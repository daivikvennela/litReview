import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
} from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import log from "electron-log";
import { runJavaFirstLaunchCheck } from "./firstRunChecks";

/** Set by esbuild CJS bundle (`scripts/bundle-electron.mjs` banner). */
declare const __dirname: string;

log.transports.file.level = "info";

let serverProc: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let activePort = 3456;

function appResourceDir(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app");
  }
  return path.join(__dirname, "..", "app");
}

function userEnvPath(): string {
  return path.join(app.getPath("userData"), ".env");
}

function ensureUserEnv(): void {
  const dest = userEnvPath();
  if (fs.existsSync(dest)) return;

  const candidates = [
    path.join(appResourceDir(), ".env.example"),
    path.join(__dirname, "..", ".env.example"),
  ];
  for (const src of candidates) {
    if (fs.existsSync(src)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      log.info("Created user .env from", src);
      return;
    }
  }
}

function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
          resolve();
        } else if (Date.now() < deadline) {
          setTimeout(attempt, 300);
        } else {
          reject(new Error(`Health check failed: HTTP ${res.statusCode}`));
        }
      });
      req.on("error", () => {
        if (Date.now() < deadline) {
          setTimeout(attempt, 300);
        } else {
          reject(new Error(`Server did not respond at ${url}`));
        }
      });
      req.setTimeout(2000, () => {
        req.destroy();
        if (Date.now() < deadline) setTimeout(attempt, 300);
        else reject(new Error(`Timeout waiting for ${url}`));
      });
    };
    attempt();
  });
}

function serverEntryPath(): { command: string; args: string[]; cwd: string } {
  const appDir = appResourceDir();
  const cwd = appDir;

  const tsxCli = path.join(appDir, "node_modules", "tsx", "dist", "cli.mjs");
  const serverTs = path.join(appDir, "server.ts");
  if (!fs.existsSync(tsxCli)) {
    throw new Error(`tsx not found at ${tsxCli}. Run npm install in app/.`);
  }
  return {
    command: process.execPath,
    args: [tsxCli, serverTs],
    cwd,
  };
}

async function pickPort(start = 3456): Promise<number> {
  const net = await import("net");
  for (let port = start; port < start + 20; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => {
        srv.close(() => resolve(true));
      });
      srv.listen(port, "127.0.0.1");
    });
    if (free) return port;
  }
  return start;
}

async function startServer(): Promise<number> {
  activePort = await pickPort(3456);
  ensureUserEnv();

  const { command, args, cwd } = serverEntryPath();
  const env = {
    ...process.env,
    PORT: String(activePort),
    LITREVIEW_HEADLESS: "1",
    LITREVIEW_ENV_PATH: userEnvPath(),
    LITREVIEW_ROOT: appResourceDir(),
    ELECTRON_RUN_AS_NODE: "1",
  };

  log.info("Starting server", { command, args, cwd, port: activePort });

  serverProc = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProc.stdout?.on("data", (buf: Buffer) => {
    const line = buf.toString().trim();
    if (line) log.info("[server]", line);
  });
  serverProc.stderr?.on("data", (buf: Buffer) => {
    const line = buf.toString().trim();
    if (line) log.error("[server]", line);
  });

  serverProc.on("exit", (code, signal) => {
    log.warn("Server exited", { code, signal });
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "Lit Review Agent",
        `The local server stopped unexpectedly (code ${code ?? signal}). Restart the app.`,
      );
    }
  });

  const healthUrl = `http://127.0.0.1:${activePort}/api/meta/health`;
  await waitForHttp(healthUrl, 30_000);
  return activePort;
}

function stopServer(): void {
  if (!serverProc || serverProc.killed) return;
  try {
    serverProc.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  serverProc = null;
}

async function createWindow(port: number): Promise<void> {
  const preloadPath = app.isPackaged
    ? path.join(__dirname, "preload.cjs")
    : path.join(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Lit Review Agent",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const url = `http://127.0.0.1:${port}`;
  await mainWindow.loadURL(url);
}

function registerIpc(): void {
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    return shell.openExternal(url);
  });
}

app.whenReady().then(async () => {
  registerIpc();
  ensureUserEnv();

  try {
    await runJavaFirstLaunchCheck(app.getPath("userData"));
    const port = await startServer();
    await createWindow(port);
  } catch (err) {
    log.error("Failed to start", err);
    dialog.showErrorBox(
      "Lit Review Agent",
      err instanceof Error ? err.message : String(err),
    );
    app.quit();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", async () => {
  if (mainWindow === null && serverProc) {
    await createWindow(activePort);
  }
});

app.on("before-quit", () => {
  stopServer();
});

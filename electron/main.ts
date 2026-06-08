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
let splashWindow: BrowserWindow | null = null;
let activePort = 3456;

const LINE_BUFFER_MAX = 30;
const STARTUP_TAIL_LINES = 20;

function startupTimeoutMs(): number {
  const env = process.env.LITREVIEW_STARTUP_TIMEOUT_MS;
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return app.isPackaged ? 60_000 : 30_000;
}

function logFilePath(): string {
  try {
    return log.transports.file.getFile().path;
  } catch {
    return "";
  }
}

function logDirPath(): string {
  const p = logFilePath();
  return p ? path.dirname(p) : app.getPath("logs");
}

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

class LineRingBuffer {
  private readonly max: number;
  private lines: string[] = [];

  constructor(max: number) {
    this.max = max;
  }

  push(chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      this.lines.push(t);
      if (this.lines.length > this.max) {
        this.lines = this.lines.slice(-this.max);
      }
    }
  }

  tail(n: number): string[] {
    return this.lines.slice(-n);
  }
}

function probeHealth(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      res.resume();
      if (res.statusCode && res.statusCode >= 200 && res.statusCode < 500) {
        resolve();
      } else {
        reject(new Error(`Health check failed: HTTP ${res.statusCode}`));
      }
    });
    req.on("error", (err) => reject(err));
    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error("Health request timed out"));
    });
  });
}

export type ServerReadyDiagnostics = {
  port: number;
  healthUrl: string;
  logPath: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  stdoutTail: string[];
  stderrTail: string[];
};

function formatStartupFailure(d: ServerReadyDiagnostics, reason: string): string {
  const parts = [
    reason,
    "",
    `Port: ${d.port}`,
    `Health: ${d.healthUrl}`,
    `Log file: ${d.logPath || "(unknown)"}`,
  ];
  if (d.exitCode !== null || d.exitSignal) {
    parts.push(`Server exit: code=${d.exitCode ?? "null"} signal=${d.exitSignal ?? "null"}`);
  }
  const errLines = d.stderrTail.length ? d.stderrTail : d.stdoutTail;
  if (errLines.length) {
    parts.push("", "Recent server output:", ...errLines.map((l) => `  ${l}`));
  }
  return parts.join("\n");
}

function waitForServerReady(
  proc: ChildProcess,
  port: number,
  stdoutBuf: LineRingBuffer,
  stderrBuf: LineRingBuffer,
  timeoutMs: number,
): Promise<void> {
  const healthUrl = `http://127.0.0.1:${port}/api/meta/health`;

  return new Promise((resolve, reject) => {
    let settled = false;
    let httpTimer: ReturnType<typeof setInterval> | null = null;

    const diagnostics = (): ServerReadyDiagnostics => ({
      port,
      healthUrl,
      logPath: logFilePath(),
      exitCode: null,
      exitSignal: null,
      stdoutTail: stdoutBuf.tail(STARTUP_TAIL_LINES),
      stderrTail: stderrBuf.tail(STARTUP_TAIL_LINES),
    });

    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      if (httpTimer) clearInterval(httpTimer);
      proc.stdout?.off("data", onStdout);
      proc.stderr?.off("data", onStderr);
      proc.off("exit", onExit);
      if (err) reject(err);
      else resolve();
    };

    const onStdout = (buf: Buffer) => {
      const text = buf.toString();
      stdoutBuf.push(text);
      const line = text.trim();
      if (line) log.info("[server]", line);
      if (text.includes("LITREVIEW_READY")) {
        finish();
      }
    };

    const onStderr = (buf: Buffer) => {
      const text = buf.toString();
      stderrBuf.push(text);
      const line = text.trim();
      if (line) log.error("[server]", line);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const d = diagnostics();
      d.exitCode = code;
      d.exitSignal = signal;
      finish(
        new Error(
          formatStartupFailure(
            d,
            `Local server exited before ready (code ${code ?? "null"}, signal ${signal ?? "null"}).`,
          ),
        ),
      );
    };

    proc.stdout?.on("data", onStdout);
    proc.stderr?.on("data", onStderr);
    proc.on("exit", onExit);

    const tryHttp = () => {
      if (settled) return;
      probeHealth(healthUrl)
        .then(() => finish())
        .catch(() => {
          /* retry on interval */
        });
    };

    httpTimer = setInterval(tryHttp, 300);
    tryHttp();

    setTimeout(() => {
      if (settled) return;
      finish(
        new Error(
          formatStartupFailure(
            diagnostics(),
            `Server did not become ready within ${timeoutMs / 1000}s.`,
          ),
        ),
      );
    }, timeoutMs);
  });
}

function serverEntryPath(): { command: string; args: string[]; cwd: string } {
  const appDir = appResourceDir();
  const cwd = appDir;

  const bundle = path.join(appDir, "server.bundle.cjs");
  if (fs.existsSync(bundle)) {
    return {
      command: process.execPath,
      args: [bundle],
      cwd,
    };
  }

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

function showSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) return;
  splashWindow = new BrowserWindow({
    width: 420,
    height: 120,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: "Lit Review Agent",
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui;margin:24px;text-align:center">
<h3 style="margin:0 0 8px">Lit Review Agent</h3>
<p style="margin:0;color:#444">Starting local server…</p>
</body></html>`;
  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

function closeSplash(): void {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
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

  const stdoutBuf = new LineRingBuffer(LINE_BUFFER_MAX);
  const stderrBuf = new LineRingBuffer(LINE_BUFFER_MAX);

  serverProc = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
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

  await waitForServerReady(
    serverProc,
    activePort,
    stdoutBuf,
    stderrBuf,
    startupTimeoutMs(),
  );
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

/** Fully exit the desktop app (stops API child, closes windows). */
function quitApplication(): void {
  closeSplash();
  stopServer();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.removeAllListeners("close");
    mainWindow.destroy();
  }
  mainWindow = null;
  app.quit();
  // Fallback if a child process or event handler blocks a clean quit.
  setTimeout(() => app.exit(0), 1500);
}

async function createWindow(port: number): Promise<void> {
  const preloadPath = path.join(__dirname, "preload.cjs");

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: "Lit Review Agent",
    show: false,
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
  mainWindow.show();
}

function registerIpc(): void {
  ipcMain.handle("app:getVersion", () => app.getVersion());
  ipcMain.handle("app:isElectron", () => true);
  ipcMain.handle("app:quit", () => {
    quitApplication();
  });
  ipcMain.handle("shell:openExternal", (_e, url: string) => {
    return shell.openExternal(url);
  });
}

async function showStartupFailure(err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  log.error("Failed to start", err);

  const { response } = await dialog.showMessageBox({
    type: "error",
    title: "Lit Review Agent",
    message: "Could not start the local server",
    detail: message,
    buttons: ["Quit", "Open log folder"],
    defaultId: 0,
    cancelId: 0,
  });

  if (response === 1) {
    const dir = logDirPath();
    const result = await shell.openPath(dir);
    if (result) log.warn("openPath logs failed", result);
  }
}

app.whenReady().then(async () => {
  registerIpc();
  ensureUserEnv();

  showSplash();

  try {
    await runJavaFirstLaunchCheck(app.getPath("userData"));
    const port = await startServer();
    closeSplash();
    await createWindow(port);
  } catch (err) {
    closeSplash();
    await showStartupFailure(err);
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
  closeSplash();
  stopServer();
});

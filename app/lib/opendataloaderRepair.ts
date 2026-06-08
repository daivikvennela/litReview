import { execFile } from "child_process";
import { copyFileSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { promisify } from "util";
import { getAppDir } from "./appPaths.js";
import { openDataLoaderJarPath } from "./pdfParsers/opendataloaderParser.js";

const execFileAsync = promisify(execFile);

export type OpenDataLoaderJarStatus = {
  jarOk: boolean;
  jarPath: string;
  legacyJarPath: string;
  legacyJarOk: boolean;
};

/** Paths the bundled server may look for when @opendataloader/pdf was incorrectly inlined. */
export function openDataLoaderLegacyJarPaths(): string[] {
  const appDir = getAppDir();
  return [
    path.join(appDir, "lib", "opendataloader-pdf-cli.jar"),
    path.join(path.dirname(appDir), "lib", "opendataloader-pdf-cli.jar"),
  ];
}

export function getOpenDataLoaderJarStatus(): OpenDataLoaderJarStatus {
  const jarPath = openDataLoaderJarPath();
  const legacyJarPath = openDataLoaderLegacyJarPaths()[1] ?? "";
  const legacyJarOk = openDataLoaderLegacyJarPaths().some((p) => existsSync(p));
  return {
    jarOk: existsSync(jarPath),
    jarPath,
    legacyJarPath,
    legacyJarOk,
  };
}

export type RepairResult = {
  ok: boolean;
  message: string;
  steps: string[];
  jarStatus: OpenDataLoaderJarStatus;
};

function projectRootWithBundleScript(): string | null {
  const appDir = getAppDir();
  for (const root of [path.dirname(appDir), appDir]) {
    if (existsSync(path.join(root, "scripts", "bundle-server.mjs"))) return root;
  }
  return null;
}

async function ensureCanonicalJar(steps: string[]): Promise<boolean> {
  const jarPath = openDataLoaderJarPath();
  if (existsSync(jarPath)) {
    steps.push(`JAR found at ${jarPath}`);
    return true;
  }

  const appDir = getAppDir();
  steps.push("JAR missing — running npm install @opendataloader/pdf in app/");
  try {
    await execFileAsync("npm", ["install", "@opendataloader/pdf"], {
      cwd: appDir,
      timeout: 300_000,
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push(`npm install failed: ${msg}`);
    return false;
  }

  if (existsSync(jarPath)) {
    steps.push(`JAR installed at ${jarPath}`);
    return true;
  }
  steps.push("JAR still missing after npm install");
  return false;
}

function copyJarToLegacyPaths(steps: string[]): void {
  const source = openDataLoaderJarPath();
  for (const dest of openDataLoaderLegacyJarPaths()) {
    if (existsSync(dest)) {
      steps.push(`Legacy JAR already present: ${dest}`);
      continue;
    }
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(source, dest);
    steps.push(`Copied JAR to ${dest}`);
  }
}

async function rebundleServerIfDev(steps: string[]): Promise<void> {
  const root = projectRootWithBundleScript();
  if (!root) {
    steps.push("Server bundle script not found (packaged install — skipped rebuild)");
    return;
  }
  const script = path.join(root, "scripts", "bundle-server.mjs");
  steps.push("Rebuilding server bundle (scripts/bundle-server.mjs)…");
  try {
    await execFileAsync("node", [script], {
      cwd: root,
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    steps.push("Server bundle rebuilt");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    steps.push(`Bundle rebuild failed: ${msg}`);
  }
}

/**
 * Repair OpenDataLoader for packaged installs (copy JAR to legacy paths) and dev
 * (rebundle server so @opendataloader/pdf stays external).
 */
export async function repairOpenDataLoader(): Promise<RepairResult> {
  const steps: string[] = [];
  const jarReady = await ensureCanonicalJar(steps);
  if (!jarReady) {
    return {
      ok: false,
      message: "Could not locate or install the OpenDataLoader JAR.",
      steps,
      jarStatus: getOpenDataLoaderJarStatus(),
    };
  }

  copyJarToLegacyPaths(steps);
  await rebundleServerIfDev(steps);

  const jarStatus = getOpenDataLoaderJarStatus();
  const ok = jarStatus.jarOk || jarStatus.legacyJarOk;
  return {
    ok,
    message: ok
      ? "OpenDataLoader setup complete. Try parsing a PDF again."
      : "Repair finished but the JAR is still not reachable.",
    steps,
    jarStatus,
  };
}

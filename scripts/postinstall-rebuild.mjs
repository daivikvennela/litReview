#!/usr/bin/env node
/**
 * Rebuild native modules (better-sqlite3) for Electron when electron is installed.
 * Set TARGET_ARCH=arm64|x64|ia32 before running when cross-building installers.
 */
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const electronPkg = path.join(root, "node_modules", "electron", "package.json");

if (!fs.existsSync(electronPkg)) {
  console.log("postinstall-rebuild: electron not installed, skipping native rebuild");
  process.exit(0);
}

const electronVersion = JSON.parse(fs.readFileSync(electronPkg, "utf8")).version;
const appDir = path.join(root, "app");
const targetArch = process.env.TARGET_ARCH?.trim();

const rebuildArgs = [
  "@electron/rebuild",
  "-f",
  "-w",
  "better-sqlite3",
  "-v",
  electronVersion,
  "-m",
  appDir,
];

if (targetArch) {
  rebuildArgs.push("--arch", targetArch);
  console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion} (arch=${targetArch})...`);
} else {
  console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  rebuildArgs,
  { cwd: appDir, stdio: "inherit", env: process.env },
);

if (result.status !== 0) {
  const strict =
    process.env.CI === "true" || process.env.LITREVIEW_STRICT_REBUILD === "1";
  console.warn(
    "postinstall-rebuild: @electron/rebuild failed" +
      (strict ? " (strict mode — failing)" : " (dev builds may still work with system Node)"),
  );
  process.exit(strict ? 1 : 0);
}

console.log("postinstall-rebuild: done");

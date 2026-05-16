#!/usr/bin/env node
/**
 * Rebuild native modules (better-sqlite3) for Electron when electron is installed.
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

console.log(`Rebuilding better-sqlite3 for Electron ${electronVersion}...`);

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "@electron/rebuild",
    "-f",
    "-w",
    "better-sqlite3",
    "-v",
    electronVersion,
    "-m",
    appDir,
  ],
  { cwd: appDir, stdio: "inherit", env: process.env },
);

if (result.status !== 0) {
  console.warn("postinstall-rebuild: @electron/rebuild failed (dev builds may still work with system Node)");
  process.exit(0);
}

console.log("postinstall-rebuild: done");

#!/usr/bin/env node
/**
 * Rebuild app native deps (better-sqlite3) for Electron via electron-builder.
 * Set TARGET_ARCH=arm64|x64 before running when cross-building installers.
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

const targetArch = process.env.TARGET_ARCH?.trim();
const args = ["electron-builder", "install-app-deps"];
if (targetArch) {
  args.push(`--arch=${targetArch}`);
  console.log(`Rebuilding app native modules for Electron (arch=${targetArch})...`);
} else {
  console.log("Rebuilding app native modules for Electron...");
}

const result = spawnSync("npx", args, {
  cwd: root,
  stdio: "inherit",
  env: process.env,
  shell: process.platform === "win32",
});

if (result.status !== 0) {
  const strict =
    process.env.CI === "true" || process.env.LITREVIEW_STRICT_REBUILD === "1";
  console.warn(
    "postinstall-rebuild: install-app-deps failed" +
      (strict ? " (strict mode — failing)" : " (dev builds may still work with system Node)"),
  );
  if (result.error) {
    console.warn("postinstall-rebuild: spawn error:", result.error.message);
  }
  process.exit(strict ? 1 : 0);
}

console.log("postinstall-rebuild: done");

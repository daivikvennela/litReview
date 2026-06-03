#!/usr/bin/env node
/**
 * Basic release/CI config checks (run in CI and locally before tagging).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function fail(msg) {
  console.error(`validate-release-config: ${msg}`);
  process.exit(1);
}

const builderYml = fs.readFileSync(path.join(root, "electron/builder.yml"), "utf8");
if (/^\s+arch:\s*$/m.test(builderYml) || /arch:\s*\n\s+-\s+(arm64|x64)/m.test(builderYml)) {
  fail(
    "electron/builder.yml must not pin multi-arch arrays; use CLI --arm64/--x64 per job",
  );
}

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const requiredScripts = [
  "dist:mac-arm64",
  "dist:mac-x64",
  "dist:win-x64",
  "dist:win-arm64",
  "rebuild:app-native",
  "build:electron",
];
for (const s of requiredScripts) {
  if (!pkg.scripts?.[s]) fail(`package.json missing script: ${s}`);
}

if (!fs.existsSync(path.join(root, "scripts/bundle-server.mjs"))) {
  fail("missing scripts/bundle-server.mjs");
}

console.log("validate-release-config: OK");

#!/usr/bin/env node
/**
 * Bundle Electron main/preload and Express server for packaged installs.
 */
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const cjsBanner = {
  js: 'var __dirname=require("path").dirname(__filename);',
};

const shared = {
  bundle: true,
  platform: "node",
  format: "cjs",
  sourcemap: true,
  logLevel: "info",
  banner: cjsBanner,
};

await esbuild.build({
  ...shared,
  entryPoints: [path.join(root, "electron/main.ts")],
  outfile: path.join(root, "dist-electron/main.cjs"),
  external: ["electron"],
});

await esbuild.build({
  ...shared,
  entryPoints: [path.join(root, "electron/preload.ts")],
  outfile: path.join(root, "dist-electron/preload.cjs"),
  external: ["electron"],
});

console.log("Bundled dist-electron/main.cjs, dist-electron/preload.cjs");

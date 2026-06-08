#!/usr/bin/env node
/**
 * Bundle Express server for packaged installs (faster cold start than tsx).
 * better-sqlite3 stays external (native .node loaded from app/node_modules).
 */
import * as esbuild from "esbuild";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const appDir = path.join(root, "app");

const importMetaBanner = {
  js: 'var __import_meta_url=require("url").pathToFileURL(__filename).href;',
};

await esbuild.build({
  entryPoints: [path.join(appDir, "server.ts")],
  outfile: path.join(appDir, "server.bundle.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  logLevel: "info",
  packages: "bundle",
  // Keep native + Java-backed packages external so __dirname resolves inside node_modules.
  external: ["better-sqlite3", "@opendataloader/pdf"],
  banner: importMetaBanner,
  define: {
    "import.meta.url": "__import_meta_url",
  },
});

console.log("Bundled app/server.bundle.cjs");

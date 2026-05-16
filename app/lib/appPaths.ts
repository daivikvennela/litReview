import path from "path";

/** Resolved `app/` directory (works under tsx, bundled CJS, and Electron). */
export function getAppDir(): string {
  if (process.env.LITREVIEW_ROOT) {
    return process.env.LITREVIEW_ROOT;
  }
  const main = process.argv[1];
  if (main) {
    return path.dirname(path.resolve(main));
  }
  return path.join(process.cwd(), "app");
}

export function resolveFromApp(...segments: string[]): string {
  return path.join(getAppDir(), ...segments);
}

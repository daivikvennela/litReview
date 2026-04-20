import { spawn } from "child_process";
import { mkdtemp, readdir, readFile, writeFile, rm } from "fs/promises";
import path from "path";
import { tmpdir } from "os";

/** Render a PDF buffer to per-page PNG base64 strings using Poppler's `pdftoppm`. */
export async function pdfToPngBase64Pages(
  pdfBuffer: Buffer,
  opts: { maxPages?: number; dpi?: number } = {},
): Promise<string[]> {
  const maxPages = Math.max(1, Math.min(20, opts.maxPages ?? 8));
  const dpi = Math.max(72, Math.min(300, opts.dpi ?? 150));

  await ensurePdftoppmAvailable();

  const workdir = await mkdtemp(path.join(tmpdir(), "litreview-vlm-"));
  const pdfPath = path.join(workdir, "input.pdf");
  const prefix = path.join(workdir, "page");
  try {
    await writeFile(pdfPath, pdfBuffer);
    await runCommand("pdftoppm", [
      "-png",
      "-r",
      String(dpi),
      "-f",
      "1",
      "-l",
      String(maxPages),
      pdfPath,
      prefix,
    ]);
    const entries = (await readdir(workdir)).filter((f) => f.startsWith("page") && f.endsWith(".png")).sort();
    const pages: string[] = [];
    for (const entry of entries) {
      const buf = await readFile(path.join(workdir, entry));
      pages.push(buf.toString("base64"));
    }
    if (pages.length === 0) throw new Error("pdftoppm produced no pages");
    return pages;
  } finally {
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ensurePdftoppmAvailable(): Promise<void> {
  try {
    await runCommand("pdftoppm", ["-v"], { allowNonZeroExit: true });
  } catch {
    throw new Error(
      "VLM parsing requires the `pdftoppm` binary (Poppler). Install it (e.g. `brew install poppler` on macOS, `apt-get install poppler-utils` on Debian/Ubuntu) and retry.",
    );
  }
}

function runCommand(
  command: string,
  args: string[],
  opts: { allowNonZeroExit?: boolean } = {},
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr += d.toString("utf8");
    });
    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0 || opts.allowNonZeroExit) resolve();
      else reject(new Error(`${command} exited ${code}: ${stderr.trim()}`));
    });
  });
}

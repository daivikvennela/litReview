import { execFile, execFileSync, spawn } from "child_process";
import { promisify } from "util";
import { Router, Response } from "express";
import { getSetting } from "../db.js";
import { getOpenDataLoaderJarStatus, repairOpenDataLoader } from "../lib/opendataloaderRepair.js";

const execFileAsync = promisify(execFile);

const router = Router();

function hybridPortFromUrl(urlStr: string): number {
  try {
    const u = new URL(urlStr);
    if (u.port) return parseInt(u.port, 10);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return 5002;
  }
}

/** Parse major Java version from `java -version` stderr (1.8.x → 8, 11+ → 11). */
function parseJavaMajor(stderr: string): number {
  const m = stderr.match(/version\s+"(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  if (m[1] === "1" && m[2]) return parseInt(m[2], 10);
  return parseInt(m[1], 10);
}

async function getJavaInfo(): Promise<{ ok: boolean; major: number; stderr: string }> {
  try {
    const { stderr } = await execFileAsync("java", ["-version"], { encoding: "utf8", maxBuffer: 256 * 1024 });
    const major = parseJavaMajor(stderr);
    return { ok: major >= 11, major, stderr: stderr.trim() };
  } catch (err: unknown) {
    const stderr =
      err && typeof err === "object" && "stderr" in err ? String((err as { stderr?: string }).stderr) : "";
    const major = parseJavaMajor(stderr);
    return { ok: false, major, stderr: stderr || (err instanceof Error ? err.message : "java not found") };
  }
}

async function pingHybrid(baseUrl: string): Promise<boolean> {
  const root = baseUrl.replace(/\/$/, "");
  const urls = [`${root}/health`, `${root}/`, root];
  for (const u of urls) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 3000);
      const res = await fetch(u, { method: "GET", signal: ac.signal }).finally(() => clearTimeout(t));
      if (res.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function hybridCliOnPath(): boolean {
  try {
    execFileSync("which", ["opendataloader-pdf-hybrid"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

router.get("/status", async (_req, res: Response) => {
  const java = await getJavaInfo();
  const hybridEnabled = getSetting("opendataloader_hybrid_enabled") === "true";
  const hybridUrl = (getSetting("opendataloader_hybrid_url") || "http://localhost:5002").replace(/\/$/, "");
  let hybridAlive = false;
  if (hybridEnabled) {
    hybridAlive = await pingHybrid(hybridUrl);
  }
  const jar = getOpenDataLoaderJarStatus();
  res.json({
    javaOk: java.ok,
    javaMajor: java.major,
    javaDetail: java.stderr.split("\n")[0] ?? "",
    hybridEnabled,
    hybridUrl,
    hybridAlive,
    jarOk: jar.jarOk || jar.legacyJarOk,
    jarPath: jar.jarPath,
    legacyJarOk: jar.legacyJarOk,
  });
});

router.post("/repair", async (_req, res: Response) => {
  try {
    const result = await repairOpenDataLoader();
    res.status(result.ok ? 200 : 500).json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Repair failed";
    res.status(500).json({
      ok: false,
      message: msg,
      steps: [],
      jarStatus: getOpenDataLoaderJarStatus(),
    });
  }
});

router.post("/start-hybrid", (_req, res: Response) => {
  if (!hybridCliOnPath()) {
    res.status(400).json({
      ok: false,
      message:
        'Hybrid CLI not found in PATH. Install with: pip install "opendataloader-pdf[hybrid]" then ensure `opendataloader-pdf-hybrid` is on your PATH.',
    });
    return;
  }

  const hybridUrl = (getSetting("opendataloader_hybrid_url") || "http://localhost:5002").replace(/\/$/, "");
  const port = hybridPortFromUrl(hybridUrl);
  const forceOcr = getSetting("opendataloader_force_ocr") === "true";
  const ocrLang = (getSetting("opendataloader_ocr_lang") || "").trim();
  const enrichFormula = getSetting("opendataloader_enrich_formula") === "true";
  const enrichPicture = getSetting("opendataloader_enrich_picture_description") === "true";

  const args: string[] = ["--port", String(port)];
  if (forceOcr) {
    args.push("--force-ocr");
    if (ocrLang) args.push("--ocr-lang", ocrLang);
  }
  if (enrichFormula) args.push("--enrich-formula");
  if (enrichPicture) args.push("--enrich-picture-description");

  try {
    const child = spawn("opendataloader-pdf-hybrid", args, {
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
    res.json({
      ok: true,
      message: `Started opendataloader-pdf-hybrid on port ${port} (PID ${child.pid ?? "?"})`,
      port,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to start hybrid server";
    res.status(500).json({ ok: false, message: msg });
  }
});

export default router;

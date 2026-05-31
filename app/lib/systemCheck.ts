import { execFile } from "child_process";
import { promisify } from "util";
import {
  getArticleCount,
  getReviewRowCount,
  getDatabaseFilePath,
  getSetting,
} from "../db.js";
import { checkGrobidAlive, getGrobidUrl } from "./grobid.js";
import { OLLAMA_DEFAULT_URL, checkOllamaAlive } from "./pdfParsers/ollamaVlmParser.js";
import {
  CHANDRA_OCR2_DEFAULT_URL,
  DOTS_OCR_DEFAULT_URL,
  checkOcrSidecarAlive,
} from "./pdfParsers/ocrSidecarClient.js";
import { DEFAULT_MODEL_ID } from "./modelDefaults.js";

const execFileAsync = promisify(execFile);

export type CheckStatus = "ok" | "warn" | "fail";

/** `core` = needed to run; `parsing` = at least one needed to ingest PDFs; `optional` = nice to have. */
export type CheckCategory = "core" | "parsing" | "optional";

export interface SystemCheckItem {
  id: string;
  label: string;
  category: CheckCategory;
  status: CheckStatus;
  detail: string;
  hint?: string;
}

export interface SystemCheckResult {
  ranAt: string;
  durationMs: number;
  summary: { ok: number; warn: number; fail: number; total: number };
  checks: SystemCheckItem[];
}

/** Parse major Java version from `java -version` stderr (1.8.x -> 8, 11+ -> 11). */
function parseJavaMajor(stderr: string): number {
  const m = stderr.match(/version\s+"(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  if (m[1] === "1" && m[2]) return parseInt(m[2], 10);
  return parseInt(m[1], 10);
}

async function checkServer(): Promise<SystemCheckItem> {
  return {
    id: "server",
    label: "API server",
    category: "core",
    status: "ok",
    detail: `Running · v2.0.0 · Node ${process.version}`,
  };
}

async function checkDatabase(): Promise<SystemCheckItem> {
  try {
    const articles = getArticleCount();
    const reviews = getReviewRowCount();
    return {
      id: "database",
      label: "Local database (SQLite)",
      category: "core",
      status: "ok",
      detail: `Connected · ${articles} article(s), ${reviews} review(s)`,
      hint: getDatabaseFilePath(),
    };
  } catch (err) {
    return {
      id: "database",
      label: "Local database (SQLite)",
      category: "core",
      status: "fail",
      detail: err instanceof Error ? err.message : String(err),
      hint: "The better-sqlite3 native module may be built for the wrong runtime. Run: npm --prefix app rebuild better-sqlite3",
    };
  }
}

async function checkOpenRouterKey(): Promise<SystemCheckItem> {
  const apiKey = getSetting("openrouter_api_key") || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      id: "openrouter_key",
      label: "OpenRouter API key",
      category: "core",
      status: "fail",
      detail: "Not configured",
      hint: 'Add a key via the "Get API Key" tab or below. Required for chat, summaries, and reviews.',
    };
  }
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const r = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: ac.signal,
    }).finally(() => clearTimeout(t));
    if (r.ok) {
      const data = (await r.json()) as { data?: unknown[] };
      const count = Array.isArray(data?.data) ? data.data.length : 0;
      return {
        id: "openrouter_key",
        label: "OpenRouter API key",
        category: "core",
        status: "ok",
        detail: `Valid · ${count} model(s) available`,
      };
    }
    if (r.status === 401 || r.status === 403) {
      return {
        id: "openrouter_key",
        label: "OpenRouter API key",
        category: "core",
        status: "fail",
        detail: `Key rejected (HTTP ${r.status})`,
        hint: "The key is invalid or revoked. Generate a new one at openrouter.ai/keys.",
      };
    }
    return {
      id: "openrouter_key",
      label: "OpenRouter API key",
      category: "core",
      status: "warn",
      detail: `Could not verify (HTTP ${r.status})`,
      hint: "OpenRouter may be temporarily unreachable; the key itself may still be valid.",
    };
  } catch (err) {
    return {
      id: "openrouter_key",
      label: "OpenRouter API key",
      category: "core",
      status: "warn",
      detail: `Could not reach OpenRouter: ${err instanceof Error ? err.message : String(err)}`,
      hint: "Check your internet connection. The key is present but was not verified.",
    };
  }
}

async function checkDefaultModel(): Promise<SystemCheckItem> {
  const model = getSetting("default_model") || DEFAULT_MODEL_ID;
  const isFree = model.endsWith(":free");
  return {
    id: "default_model",
    label: "Default model",
    category: "core",
    status: "ok",
    detail: `${model}${isFree ? " (free)" : ""}`,
  };
}

async function checkJava(): Promise<SystemCheckItem> {
  try {
    const { stderr } = await execFileAsync("java", ["-version"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024,
      timeout: 6000,
    });
    const major = parseJavaMajor(stderr);
    const first = stderr.split("\n")[0]?.trim() ?? "";
    if (major >= 11) {
      return {
        id: "java",
        label: "Java 11+ (OpenDataLoader parser)",
        category: "parsing",
        status: "ok",
        detail: `Detected Java ${major} · ${first}`,
      };
    }
    return {
      id: "java",
      label: "Java 11+ (OpenDataLoader parser)",
      category: "parsing",
      status: "warn",
      detail: major ? `Java ${major} found, but 11+ is required` : "Java found but version unknown",
      hint: "Install Temurin JDK 11+ (adoptium.net) to use the default PDF parser, or use GROBID / a VLM parser.",
    };
  } catch {
    return {
      id: "java",
      label: "Java 11+ (OpenDataLoader parser)",
      category: "parsing",
      status: "warn",
      detail: "Not found on PATH",
      hint: "Install Temurin JDK 11+ (adoptium.net) to use the default PDF parser, or use GROBID / a VLM parser.",
    };
  }
}

async function checkGrobid(): Promise<SystemCheckItem> {
  const url = getGrobidUrl(getSetting("grobid_url"));
  const alive = await checkGrobidAlive(getSetting("grobid_url"));
  return {
    id: "grobid",
    label: "GROBID (TEI XML parser)",
    category: "parsing",
    status: alive ? "ok" : "warn",
    detail: alive ? `Reachable at ${url}` : `Offline at ${url}`,
    hint: alive ? undefined : "Optional. Start it from Settings (Docker) or point to an external GROBID.",
  };
}

async function checkOllama(): Promise<SystemCheckItem> {
  const url = getSetting("ollama_url") || process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
  const alive = await checkOllamaAlive(url);
  return {
    id: "ollama",
    label: "Ollama (local VLM parser)",
    category: "optional",
    status: alive ? "ok" : "warn",
    detail: alive ? `Reachable at ${url}` : `Offline at ${url}`,
    hint: alive ? undefined : "Optional. Only needed for the local Ollama Vision LM parser.",
  };
}

async function checkDotsOcr(): Promise<SystemCheckItem> {
  const url = getSetting("dots_ocr_url") ?? DOTS_OCR_DEFAULT_URL;
  const alive = await checkOcrSidecarAlive(url);
  return {
    id: "dots_ocr",
    label: "Dots OCR sidecar",
    category: "parsing",
    status: alive ? "ok" : "warn",
    detail: alive ? `Reachable at ${url}` : `Offline at ${url}`,
    hint: alive
      ? undefined
      : "Optional. Start the Dots sidecar (scripts/ocr-sidecars/dots_server.py) with vLLM running.",
  };
}

async function checkChandraOcr2(): Promise<SystemCheckItem> {
  const url = getSetting("chandra_ocr2_url") ?? CHANDRA_OCR2_DEFAULT_URL;
  const alive = await checkOcrSidecarAlive(url);
  return {
    id: "chandra_ocr2",
    label: "Chandra OCR 2 sidecar",
    category: "parsing",
    status: alive ? "ok" : "warn",
    detail: alive ? `Reachable at ${url}` : `Offline at ${url}`,
    hint: alive
      ? undefined
      : "Optional. Start the Chandra sidecar (scripts/ocr-sidecars/chandra_server.py) with chandra_vllm.",
  };
}

async function checkPoppler(): Promise<SystemCheckItem> {
  try {
    const { stdout } = await execFileAsync("which", ["pdftoppm"], { encoding: "utf8", timeout: 4000 });
    const p = stdout.trim();
    return {
      id: "poppler",
      label: "Poppler / pdftoppm (VLM parsers)",
      category: "optional",
      status: p ? "ok" : "warn",
      detail: p ? `Found at ${p}` : "Not found",
      hint: p ? undefined : "Optional. Only needed for OpenRouter/Ollama Vision LM parsing.",
    };
  } catch {
    return {
      id: "poppler",
      label: "Poppler / pdftoppm (VLM parsers)",
      category: "optional",
      status: "warn",
      detail: "Not found on PATH",
      hint: "Optional. Install Poppler (e.g. `brew install poppler`) only if you use Vision LM parsing.",
    };
  }
}

export async function runSystemCheck(): Promise<SystemCheckResult> {
  const start = Date.now();
  const checks = await Promise.all([
    checkServer(),
    checkDatabase(),
    checkOpenRouterKey(),
    checkDefaultModel(),
    checkJava(),
    checkGrobid(),
    checkDotsOcr(),
    checkChandraOcr2(),
    checkOllama(),
    checkPoppler(),
  ]);

  const summary = checks.reduce(
    (acc, c) => {
      acc[c.status] += 1;
      acc.total += 1;
      return acc;
    },
    { ok: 0, warn: 0, fail: 0, total: 0 },
  );

  return {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - start,
    summary,
    checks,
  };
}

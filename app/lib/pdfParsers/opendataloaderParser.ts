import { readFileSync } from "fs";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { fileURLToPath } from "url";
import { convert } from "@opendataloader/pdf";
import type { OpenDataLoaderParseOptions, ParsedArticleFields, ParsedOutput } from "./types.js";
import { extractFieldsFromVlmMarkdown, markdownToPlainText } from "./vlmShared.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function odlPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "../../node_modules/@opendataloader/pdf/package.json");
    const j = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    return j.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

type JsonElement = Record<string, unknown>;

function normalizeElements(data: unknown): JsonElement[] {
  if (Array.isArray(data)) return data as JsonElement[];
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const key of ["elements", "blocks", "content", "items"]) {
      const arr = o[key];
      if (Array.isArray(arr)) return arr as JsonElement[];
    }
  }
  return [];
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v != null ? String(v) : "";
}

function typeOf(el: JsonElement): string {
  const t = el.type ?? el.Type;
  return str(t).toLowerCase();
}

function contentOf(el: JsonElement): string {
  const c = el.content ?? el.text ?? el.Text;
  return str(c).trim();
}

function pageNum(el: JsonElement): number {
  const p = el["page number"] ?? el.pageNumber ?? el.page ?? el["pageNumber"];
  const n = typeof p === "number" ? p : parseInt(String(p), 10);
  return Number.isFinite(n) ? n : 0;
}

function headingLevel(el: JsonElement): number | null {
  const hl = el["heading level"] ?? el.headingLevel ?? el.level;
  if (typeof hl === "number" && hl >= 1 && hl <= 6) return hl;
  const s = str(hl).toLowerCase();
  if (s === "title") return 0;
  const m = str(hl).match(/^(\d+)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 6) return n;
  }
  return null;
}

/** Best-effort metadata from OpenDataLoader JSON (layout elements). */
export function extractFieldsFromOdlJson(data: unknown, mdFallback: string): ParsedArticleFields {
  const elements = normalizeElements(data);
  if (elements.length === 0) {
    return extractFieldsFromVlmMarkdown(mdFallback);
  }

  let title: string | null = null;
  for (const el of elements) {
    const ty = typeOf(el);
    if (ty !== "heading") continue;
    const lvl = headingLevel(el);
    const lev = str(el.level);
    const c = contentOf(el);
    if (!c) continue;
    if (lev.toLowerCase() === "title" || lvl === 0 || lvl === 1) {
      title = c;
      break;
    }
  }
  if (!title) {
    for (const el of elements) {
      if (typeOf(el) === "heading" && pageNum(el) <= 1) {
        const c = contentOf(el);
        if (c) {
          title = c;
          break;
        }
      }
    }
  }

  const page1Text: string[] = [];
  for (const el of elements) {
    if (pageNum(el) !== 1 && pageNum(el) !== 0) continue;
    const ty = typeOf(el);
    if (ty === "paragraph" || ty === "text" || ty === "line") {
      const c = contentOf(el);
      if (c) page1Text.push(c);
    }
  }

  let abstract: string | null = null;
  let absStart = -1;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (typeOf(el) !== "heading") continue;
    const c = contentOf(el).toLowerCase();
    if (c === "abstract" || c.startsWith("abstract")) {
      absStart = i;
      break;
    }
  }
  if (absStart >= 0) {
    const parts: string[] = [];
    for (let j = absStart + 1; j < elements.length; j++) {
      const el = elements[j];
      if (typeOf(el) === "heading") break;
      const c = contentOf(el);
      if (c) parts.push(c);
    }
    abstract = parts.join("\n\n").trim() || null;
  }

  let authors: string | null = null;
  if (title) {
    const titleIdx = elements.findIndex((e) => typeOf(e) === "heading" && contentOf(e) === title);
    if (titleIdx >= 0) {
      const blobs: string[] = [];
      for (let j = titleIdx + 1; j < Math.min(titleIdx + 12, elements.length); j++) {
        const el = elements[j];
        if (typeOf(el) === "heading") {
          const h = contentOf(el).toLowerCase();
          if (h === "abstract" || h.includes("introduction") || h === "keywords") break;
        }
        if (typeOf(el) === "paragraph" && pageNum(el) <= 1) {
          const c = contentOf(el);
          if (c && c.length < 500 && /[A-Za-z]/.test(c)) blobs.push(c);
        }
      }
      if (blobs.length) {
        const list = blobs[0]
          .split(/\s+and\s+|,\s+|;|\s+·\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1 && s.length < 120);
        if (list.length) authors = JSON.stringify(list);
      }
    }
  }

  let year: number | null = null;
  const early = [...page1Text, title ?? ""].join(" ");
  const y = early.match(/\b(19|20)\d{2}\b/);
  if (y) {
    const n = parseInt(y[0], 10);
    if (n >= 1800 && n <= 2100) year = n;
  }

  const fromMd = extractFieldsFromVlmMarkdown(mdFallback);
  return {
    title: title || fromMd.title,
    authors: authors || fromMd.authors,
    abstract: abstract || fromMd.abstract,
    year: year ?? fromMd.year,
    venue_type: fromMd.venue_type,
    venue_name: fromMd.venue_name,
    links_json: fromMd.links_json,
  };
}

export async function parseWithOpenDataLoader(
  pdfBuffer: Buffer,
  _filename: string,
  opts: OpenDataLoaderParseOptions = {},
): Promise<ParsedOutput> {
  const ver = odlPackageVersion();
  const workDir = await mkdtemp(path.join(tmpdir(), "litreview-odl-"));
  const base = "document";
  const pdfPath = path.join(workDir, `${base}.pdf`);
  const jsonPath = path.join(workDir, `${base}.json`);
  const mdPath = path.join(workDir, `${base}.md`);

  try {
    await writeFile(pdfPath, pdfBuffer);

    const hybridOn = opts.hybrid === "docling-fast" || opts.hybrid === "hancom-ai";
    const hybridMode =
      opts.hybridMode ??
      (opts.enrichFormula || opts.enrichPictureDescription ? "full" : undefined);

    await convert([pdfPath], {
      outputDir: workDir,
      format: "json,markdown",
      quiet: true,
      useStructTree: opts.useStructTree !== false,
      ...(hybridOn
        ? {
            hybrid: opts.hybrid ?? "docling-fast",
            ...(opts.hybridUrl ? { hybridUrl: opts.hybridUrl } : {}),
            ...(hybridMode ? { hybridMode } : {}),
          }
        : {}),
    });

    let md = "";
    let jsonRaw = "";
    try {
      md = await readFile(mdPath, "utf8");
    } catch {
      md = "";
    }
    try {
      jsonRaw = await readFile(jsonPath, "utf8");
    } catch {
      jsonRaw = "";
    }

    let parsedJson: unknown = null;
    if (jsonRaw.trim()) {
      try {
        parsedJson = JSON.parse(jsonRaw) as unknown;
      } catch {
        parsedJson = null;
      }
    }

    const rawPayload = jsonRaw.trim() || JSON.stringify({ error: "no_json_output", markdown: md });
    const articleFields =
      parsedJson != null ? extractFieldsFromOdlJson(parsedJson, md) : extractFieldsFromVlmMarkdown(md);

    return {
      engine: "opendataloader",
      model: `opendataloader@${ver}`,
      format: "json",
      rawPayload,
      normalizedText: markdownToPlainText(md || jsonRaw),
      teiXml: null,
      articleFields,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

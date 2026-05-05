import { appendFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";

const __AGENT_DEBUG_LOG = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".cursor",
  "debug-aa59a2.log",
);
import * as XLSX from "xlsx";
import {
  getArticles,
  getArticle,
  getArticlesMeta,
  getReviews,
  getReviewsForArticleIds,
  deleteArticle,
  deleteAllArticles,
  upsertArticle,
  getSetting,
  setSetting,
  getArticlesExportRows,
  folderFromPdfPath,
  getDistinctArticleFolders,
  insertParseOutput,
  getLatestParseOutput,
  type ArticleFilters,
} from "../db.js";
import { parsePdfWithEngine, coerceEngine } from "../lib/pdfParsers/index.js";
import { pickIntroSummaryLit } from "../lib/reviewPick.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });
const router = Router();

router.get("/export", (_req: Request, res: Response) => {
  const raw = _req.query.ids;
  const ids = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const rows = getArticlesExportRows(ids.length > 0 ? ids : null);
  const rowIds = rows.map((r) => r.id);
  const allReviews = getReviewsForArticleIds(rowIds);
  const reviewsByArticle = new Map<string, typeof allReviews>();
  for (const rev of allReviews) {
    const list = reviewsByArticle.get(rev.article_id) ?? [];
    list.push(rev);
    reviewsByArticle.set(rev.article_id, list);
  }

  const articleHeader = [
    "Article ID (MD5)",
    "Title",
    "Authors (JSON array)",
    "Year",
    "Venue type",
    "Venue name",
    "Abstract",
    "Intro & metadata (LLM)",
    "Section summary (LLM)",
    "Literature review (LLM)",
    "PDF filename",
    "Folder (upload path)",
    "Parsed at (ISO)",
    "Links (JSON)",
  ];
  const articleAoa: (string | number | null)[][] = [
    articleHeader,
    ...rows.map((r) => {
      const llm = pickIntroSummaryLit(reviewsByArticle.get(r.id) ?? []);
      return [
        r.id,
        r.title ?? "",
        r.authors ?? "",
        r.year ?? "",
        r.venue_type ?? "",
        r.venue_name ?? "",
        r.abstract ?? "",
        llm.intro ?? "",
        llm.summary ?? "",
        llm.literature_review ?? "",
        r.pdf_path ?? "",
        r.folder ?? "",
        r.parsed_at ?? "",
        r.links_json ?? "",
      ];
    }),
  ];
  const wsArticles = XLSX.utils.aoa_to_sheet(articleAoa);
  wsArticles["!cols"] = [
    { wch: 34 },
    { wch: 44 },
    { wch: 28 },
    { wch: 8 },
    { wch: 14 },
    { wch: 28 },
    { wch: 56 },
    { wch: 48 },
    { wch: 48 },
    { wch: 48 },
    { wch: 28 },
    { wch: 36 },
    { wch: 22 },
    { wch: 40 },
  ];

  const linkRows: Array<{ article_id: string; url: string; kind: string }> = [];
  for (const r of rows) {
    if (!r.links_json) continue;
    try {
      const arr = JSON.parse(r.links_json) as Array<{ url?: string; kind?: string }>;
      if (!Array.isArray(arr)) continue;
      for (const L of arr) {
        if (L?.url) linkRows.push({ article_id: r.id, url: L.url, kind: L.kind || "other" });
      }
    } catch {
      /* skip */
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsArticles, "Articles");
  if (linkRows.length > 0) {
    const linkHeader = ["Article ID (MD5)", "URL", "Kind (dataset/code/other)"];
    const linkAoa: string[][] = [
      linkHeader,
      ...linkRows.map((l) => [l.article_id, l.url, l.kind]),
    ];
    const wsLinks = XLSX.utils.aoa_to_sheet(linkAoa);
    wsLinks["!cols"] = [{ wch: 34 }, { wch: 64 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, wsLinks, "Links");
  }

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const nowIso = new Date().toISOString();
  const prevCount = Number.parseInt(getSetting("exports_count") || "0", 10);
  setSetting("exports_last_at", nowIso);
  setSetting("exports_last_scope", ids.length > 0 ? "selected" : "all");
  setSetting("exports_last_rows", String(rows.length));
  setSetting("exports_last_links_rows", String(linkRows.length));
  setSetting("exports_count", String(Number.isFinite(prevCount) ? prevCount + 1 : 1));
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="library-export.xlsx"');
  res.send(Buffer.from(buf));
});

router.get("/folders", (_req: Request, res: Response) => {
  res.json(getDistinctArticleFolders());
});

router.get("/", (req: Request, res: Response) => {
  const search = (req.query.search as string) || undefined;
  const sort = (req.query.sort as ArticleFilters["sort"]) || "parsed_at";
  const order = (req.query.order as ArticleFilters["order"]) || "desc";
  const yearMin = req.query.year_min != null && req.query.year_min !== "" ? Number(req.query.year_min) : undefined;
  const yearMax = req.query.year_max != null && req.query.year_max !== "" ? Number(req.query.year_max) : undefined;
  const venue_type = (req.query.venue_type as string) || undefined;
  const folder =
    typeof req.query.folder === "string" && req.query.folder.length > 0 ? req.query.folder : undefined;
  const rawInc = req.query.include_xml;
  const include_xml =
    rawInc === undefined || rawInc === "" ? true : !["0", "false", "no"].includes(String(rawInc).toLowerCase());
  const rawRev = req.query.include_reviews;
  const includeReviews =
    rawRev === "1" || String(rawRev).toLowerCase() === "true" || String(rawRev).toLowerCase() === "yes";

  const list = getArticles({
    search,
    sort,
    order,
    year_min: Number.isFinite(yearMin) ? yearMin : undefined,
    year_max: Number.isFinite(yearMax) ? yearMax : undefined,
    venue_type,
    folder,
    include_xml,
  });

  // #region agent log
  {
    const engines = list.reduce<Record<string, number>>((acc, a) => {
      const e = (a.parser_engine ?? "").trim() || "_null";
      acc[e] = (acc[e] ?? 0) + 1;
      return acc;
    }, {});
    const sample = list.slice(0, 8).map((a) => ({ id: a.id.slice(0, 12), pe: a.parser_engine ?? null }));
    let primaryCompare: { id: string; articlePe: string | null; latestPe: string | null } | null = null;
    if (list[0]) {
      const latest = getLatestParseOutput(list[0].id);
      primaryCompare = {
        id: list[0].id.slice(0, 12),
        articlePe: list[0].parser_engine ?? null,
        latestPe: latest?.parser_engine ?? null,
      };
    }
    const payload = {
      sessionId: "aa59a2",
      location: "articles.ts:GET/",
      message: "list_parser_engine_distribution",
      data: { engines, sample, n: list.length, includeReviews, primaryCompare },
      timestamp: Date.now(),
      hypothesisId: "H1-H2-H3",
      runId: "post-fix-library-badge",
    };
    fetch("http://127.0.0.1:7850/ingest/0daa5dfd-1e0b-4c66-8efc-7b58e0540940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa59a2" },
      body: JSON.stringify(payload),
    }).catch(() => {});
    try {
      appendFileSync(__AGENT_DEBUG_LOG, `${JSON.stringify(payload)}\n`);
    } catch {
      /* ignore */
    }
  }
  // #endregion

  if (!includeReviews || list.length === 0) {
    res.json(list);
    return;
  }

  const idList = list.map((a) => a.id);
  const allReviews = getReviewsForArticleIds(idList);
  const byArt = new Map<string, typeof allReviews>();
  for (const rev of allReviews) {
    const arr = byArt.get(rev.article_id) ?? [];
    arr.push(rev);
    byArt.set(rev.article_id, arr);
  }

  const merged = list.map((a) => {
    const llm = pickIntroSummaryLit(byArt.get(a.id) ?? []);
    return {
      ...a,
      llm_intro: llm.intro,
      llm_summary: llm.summary,
      llm_literature_review: llm.literature_review,
    };
  });
  res.json(merged);
});

router.get("/meta", (req: Request, res: Response) => {
  const raw = req.query.ids;
  const idList = typeof raw === "string" ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
  res.json(getArticlesMeta(idList));
});

router.get("/:id/xml", (req: Request, res: Response) => {
  const article = getArticle(String(req.params.id));
  if (!article || !article.xml) {
    res.status(404).json({ error: "Article or XML not found" });
    return;
  }
  res.type("application/xml").send(article.xml);
});

router.get("/:id", (req: Request, res: Response) => {
  const id = String(req.params.id);
  const article = getArticle(id);
  if (!article) {
    res.status(404).json({ error: "Article not found" });
    return;
  }
  const reviews = getReviews(id);
  res.json({ ...article, reviews });
});

router.delete("/all", (_req: Request, res: Response) => {
  try {
    const removed = deleteAllArticles();
    res.json({ removed });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to delete articles";
    res.status(500).json({ error: msg });
  }
});

router.delete("/:id", (req: Request, res: Response) => {
  try {
    deleteArticle(String(req.params.id));
    res.status(204).send();
  } catch {
    res.status(404).json({ error: "Article not found" });
  }
});

router.post("/batch", upload.array("pdfs", 200), async (req: Request, res: Response) => {
  const files = (req.files as Express.Multer.File[]) || [];
  if (files.length === 0) {
    res.status(400).json({ error: "No PDF files uploaded" });
    return;
  }

  const engine = coerceEngine(req.body?.parser_engine);
  const parserModel =
    typeof req.body?.parser_model === "string" && req.body.parser_model.trim().length > 0
      ? req.body.parser_model.trim()
      : undefined;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // #region agent log
  const __dbgBatchStart = Date.now();
  let __dbgSendCount = 0;
  fetch("http://127.0.0.1:7850/ingest/0daa5dfd-1e0b-4c66-8efc-7b58e0540940", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "895971" },
    body: JSON.stringify({
      sessionId: "895971",
      location: "articles.ts:POST/batch entry",
      message: "batch_entry",
      data: {
        fileCount: files.length,
        engine,
        parserModel: parserModel ?? null,
        firstFilename: files[0]?.originalname ?? null,
        firstFilenameBytes: files[0]?.originalname ? Buffer.from(files[0].originalname, "utf8").length : 0,
        firstFilenameCodepoints: files[0]?.originalname
          ? Array.from(files[0].originalname).slice(0, 40).map((c) => c.codePointAt(0))
          : [],
        acceptEncoding: req.headers["accept-encoding"] ?? null,
      },
      timestamp: Date.now(),
      hypothesisId: "H1-H2",
      runId: "upload-sse-debug",
    }),
  }).catch(() => {});
  // #endregion

  const send = (event: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
    // #region agent log
    __dbgSendCount += 1;
    fetch("http://127.0.0.1:7850/ingest/0daa5dfd-1e0b-4c66-8efc-7b58e0540940", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "895971" },
      body: JSON.stringify({
        sessionId: "895971",
        location: "articles.ts:send()",
        message: "sse_write",
        data: {
          event,
          sendIndex: __dbgSendCount,
          msSinceStart: Date.now() - __dbgBatchStart,
          filename: (data as { filename?: unknown }).filename ?? null,
          status: (data as { status?: unknown }).status ?? null,
          current: (data as { current?: unknown }).current ?? null,
          total: (data as { total?: unknown }).total ?? null,
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
        runId: "upload-sse-debug",
      }),
    }).catch(() => {});
    // #endregion
  };

  send("start", { total: files.length, engine });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    send("progress", {
      current: i + 1,
      total: files.length,
      filename: file.originalname,
      status: "parsing",
      engine,
    });
    try {
      const id = createHash("md5").update(file.buffer).digest("hex");
      const existing = getArticle(id);
      if (existing?.xml && engine === "grobid") {
        // GROBID TEI is cached for this content hash; refresh the filename/timestamp and move on.
        upsertArticle({
          id,
          pdf_path: file.originalname,
          parsed_at: new Date().toISOString(),
          folder: folderFromPdfPath(file.originalname),
          parser_engine: engine,
        });
        send("progress", {
          current: i + 1,
          total: files.length,
          filename: file.originalname,
          status: "done",
          cached: true,
          engine,
        });
        continue;
      }
      if (existing?.parser_engine === engine && engine === "opendataloader") {
        const latest = getLatestParseOutput(id);
        if (latest?.payload_json) {
          upsertArticle({
            id,
            pdf_path: file.originalname,
            parsed_at: new Date().toISOString(),
            folder: folderFromPdfPath(file.originalname),
            parser_engine: engine,
          });
          send("progress", {
            current: i + 1,
            total: files.length,
            filename: file.originalname,
            status: "done",
            cached: true,
            engine,
          });
          continue;
        }
      }

      const parsed = await parsePdfWithEngine(file.buffer, file.originalname, {
        engine,
        model: parserModel,
      });
      const parsedAt = new Date().toISOString();

      upsertArticle({
        id,
        title: parsed.articleFields.title,
        authors: parsed.articleFields.authors,
        abstract: parsed.articleFields.abstract,
        pdf_path: file.originalname,
        xml: parsed.teiXml,
        parsed_at: parsedAt,
        model_used: parsed.model,
        year: parsed.articleFields.year,
        venue_type: parsed.articleFields.venue_type,
        venue_name: parsed.articleFields.venue_name,
        links_json: parsed.articleFields.links_json,
        folder: folderFromPdfPath(file.originalname),
        parser_engine: parsed.engine,
      });

      insertParseOutput({
        article_id: id,
        parser_engine: parsed.engine,
        parser_model: parsed.model,
        output_format: parsed.format,
        payload_json: parsed.rawPayload,
        normalized_text: parsed.normalizedText,
        is_primary: true,
      });

      send("progress", {
        current: i + 1,
        total: files.length,
        filename: file.originalname,
        status: "done",
        engine,
        format: parsed.format,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Parse failed";

      send("progress", {
        current: i + 1,
        total: files.length,
        filename: file.originalname,
        status: "error",
        error: message,
        engine,
      });
    }
  }

  send("done", {});
  res.end();

  // #region agent log
  fetch("http://127.0.0.1:7850/ingest/0daa5dfd-1e0b-4c66-8efc-7b58e0540940", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "895971" },
    body: JSON.stringify({
      sessionId: "895971",
      location: "articles.ts:POST/batch exit",
      message: "batch_end",
      data: {
        totalMs: Date.now() - __dbgBatchStart,
        sendCount: __dbgSendCount,
        fileCount: files.length,
      },
      timestamp: Date.now(),
      hypothesisId: "H1",
      runId: "upload-sse-debug",
    }),
  }).catch(() => {});
  // #endregion
});

export default router;

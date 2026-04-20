import { Router, Request, Response } from "express";
import multer from "multer";
import { createHash } from "crypto";
import * as XLSX from "xlsx";
import {
  getArticles,
  getArticle,
  getArticlesMeta,
  getReviews,
  getReviewsForArticleIds,
  deleteArticle,
  upsertArticle,
  getSetting,
  setSetting,
  getArticlesExportRows,
  folderFromPdfPath,
  getDistinctArticleFolders,
  insertParseOutput,
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

  const grobidUrl = getSetting("grobid_url");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const send = (event: string, data: Record<string, unknown>) => {
    res.write(`data: ${JSON.stringify({ event, ...data })}\n\n`);
  };

  send("start", { total: files.length });

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    send("progress", { current: i + 1, total: files.length, filename: file.originalname, status: "parsing" });
    try {
      const id = createHash("md5").update(file.buffer).digest("hex");
      const existing = getArticle(id);
      if (existing?.xml) {
        // Even if we already have TEI cached for this content hash, update the displayed filename
        // and timestamp so Library reflects the most recent upload.
        upsertArticle({
          id,
          pdf_path: file.originalname,
          parsed_at: new Date().toISOString(),
          folder: folderFromPdfPath(file.originalname),
        });
        send("progress", {
          current: i + 1,
          total: files.length,
          filename: file.originalname,
          status: "done",
          cached: true,
        });
        continue;
      }

      const xml = await parsePdfToXml(file.buffer, file.originalname, grobidUrl);
      const parsedAt = new Date().toISOString();
      upsertArticle({
        ...buildArticleRecordFromTei(xml, { id, pdf_path: file.originalname, parsed_at: parsedAt }),
        folder: folderFromPdfPath(file.originalname),
      });
      send("progress", { current: i + 1, total: files.length, filename: file.originalname, status: "done" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Parse failed";

      send("progress", {
        current: i + 1,
        total: files.length,
        filename: file.originalname,
        status: "error",
        error: message,
      });
    }
  }

  send("done", {});
  res.end();
});

export default router;

import { Router, Request, Response } from "express";
import { homedir } from "os";
import {
  LITREVIEW_DIR,
  getDatabaseFilePath,
  getArticleCount,
  getReviewRowCount,
  getSetting,
} from "../db.js";
import { runSystemCheck } from "../lib/systemCheck.js";

const router = Router();

router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, version: "2.0.0" });
});

router.get("/system-check", async (_req: Request, res: Response) => {
  try {
    const result = await runSystemCheck();
    res.json(result);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/database", (_req: Request, res: Response) => {
  try {
    const resolvedPath = getDatabaseFilePath();
    const home = homedir();
    const displayPath = resolvedPath.startsWith(home)
      ? `~${resolvedPath.slice(home.length)}`
      : resolvedPath;

    const articleCount = getArticleCount();
    const reviewRowCount = getReviewRowCount();
    const exports_last_at = getSetting("exports_last_at");
    const exports_last_scope = getSetting("exports_last_scope");
    const exports_last_rows = Number.parseInt(getSetting("exports_last_rows") || "0", 10);
    const exports_last_links_rows = Number.parseInt(getSetting("exports_last_links_rows") || "0", 10);
    const exports_count = Number.parseInt(getSetting("exports_count") || "0", 10);

    res.json({
      displayPath,
      resolvedPath,
      litreviewDir: LITREVIEW_DIR,
      articleCount,
      reviewRowCount,
      exportStats: {
        lastAt: exports_last_at,
        lastScope: exports_last_scope,
        lastRows: Number.isFinite(exports_last_rows) ? exports_last_rows : 0,
        lastLinkRows: Number.isFinite(exports_last_links_rows) ? exports_last_links_rows : 0,
        totalCount: Number.isFinite(exports_count) ? exports_count : 0,
      },
      storedFields: [
        "On PDF parse, TEI fields match Excel export: Article ID, Title, Authors (JSON), Year, Venue type, Venue name, Abstract, PDF filename, Parsed at (ISO), Links (JSON)",
        "articles: full TEI XML (GROBID), model_used",
        "reviews: cached LLM outputs — task 1 metadata & links, task 2 section summary (depth), task 3 related work",
        "settings: key-value (API keys, GROBID URL, default models, export audit counters/timestamp)",
      ],
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;

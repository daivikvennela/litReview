import Database from "better-sqlite3";
import path from "path";
import { homedir } from "os";
import { mkdirSync, existsSync } from "fs";

export const LITREVIEW_DIR = path.join(homedir(), ".litreview");
const DB_PATH = path.join(LITREVIEW_DIR, "data.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    if (!existsSync(LITREVIEW_DIR)) mkdirSync(LITREVIEW_DIR, { recursive: true });
    db = new Database(DB_PATH);
    initSchema(db);
  }
  return db;
}

function articleColumnNames(database: Database.Database): Set<string> {
  const rows = database.prepare("PRAGMA table_info(articles)").all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

/** Directory part of a relative upload path (`a/b/paper.pdf` → `a/b`). */
export function folderFromPdfPath(pdfPath: string | null | undefined): string | null {
  if (!pdfPath) return null;
  const n = pdfPath.replace(/\\/g, "/");
  const i = n.lastIndexOf("/");
  if (i <= 0) return null;
  return n.slice(0, i) || null;
}

function migrateArticlesColumns(database: Database.Database) {
  const names = articleColumnNames(database);
  if (!names.has("year")) database.exec("ALTER TABLE articles ADD COLUMN year INTEGER");
  if (!names.has("venue_type")) database.exec("ALTER TABLE articles ADD COLUMN venue_type TEXT");
  if (!names.has("venue_name")) database.exec("ALTER TABLE articles ADD COLUMN venue_name TEXT");
  if (!names.has("links_json")) database.exec("ALTER TABLE articles ADD COLUMN links_json TEXT");
  if (!names.has("folder")) {
    database.exec("ALTER TABLE articles ADD COLUMN folder TEXT");
    const rows = database
      .prepare("SELECT id, pdf_path FROM articles WHERE pdf_path IS NOT NULL")
      .all() as Array<{ id: string; pdf_path: string }>;
    const upd = database.prepare("UPDATE articles SET folder = ? WHERE id = ?");
    for (const r of rows) {
      const f = folderFromPdfPath(r.pdf_path);
      if (f != null) upd.run(f, r.id);
    }
  }
}

function reviewColumnNames(database: Database.Database): Set<string> {
  const rows = database.prepare("PRAGMA table_info(reviews)").all() as Array<{ name: string }>;
  return new Set(rows.map((r) => r.name));
}

function migrateReviewsReviewDepth(database: Database.Database) {
  if (reviewColumnNames(database).has("review_depth")) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS reviews_migrated (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      task INTEGER NOT NULL,
      model TEXT NOT NULL,
      review_depth TEXT NOT NULL DEFAULT '',
      result TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(article_id, task, model, review_depth)
    );
    INSERT INTO reviews_migrated (article_id, task, model, review_depth, result, created_at)
    SELECT article_id, task, model, CASE WHEN task = 2 THEN 'detailed' ELSE '' END, result, created_at FROM reviews;
    DROP TABLE reviews;
    ALTER TABLE reviews_migrated RENAME TO reviews;
  `);
}

function initSchema(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT,
      authors TEXT,
      abstract TEXT,
      pdf_path TEXT,
      xml TEXT,
      parsed_at TEXT,
      model_used TEXT
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT REFERENCES articles(id) ON DELETE CASCADE,
      task INTEGER NOT NULL,
      model TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(article_id, task, model)
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS article_parse_outputs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      parser_engine TEXT NOT NULL,
      parser_model TEXT,
      output_format TEXT NOT NULL,
      payload_json TEXT,
      normalized_text TEXT,
      is_primary INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_parse_outputs_article ON article_parse_outputs(article_id, created_at DESC);
  `);
  migrateArticlesColumns(database);
  migrateReviewsReviewDepth(database);
}

export interface Article {
  id: string;
  title: string | null;
  authors: string | null;
  abstract: string | null;
  pdf_path: string | null;
  xml: string | null;
  parsed_at: string | null;
  model_used: string | null;
  year?: number | null;
  venue_type?: string | null;
  venue_name?: string | null;
  links_json?: string | null;
  folder?: string | null;
}

export interface Review {
  id: number;
  article_id: string;
  task: number;
  model: string;
  review_depth: string;
  result: string;
  created_at: string;
}

export interface ArticleFilters {
  search?: string;
  sort?: "parsed_at" | "title" | "folder";
  order?: "asc" | "desc";
  year_min?: number;
  year_max?: number;
  venue_type?: string;
  /** Exact folder path, or `__root__` for articles with no folder. */
  folder?: string;
  /** When false, omit TEI XML from the query (smaller payloads for list/metadata views). Default true. */
  include_xml?: boolean;
}

export function getArticles(filters: ArticleFilters = {}): Article[] {
  const database = getDb();
  const includeXml = filters.include_xml !== false;
  const selectCols = includeXml
    ? "id, title, authors, abstract, pdf_path, xml, parsed_at, model_used, year, venue_type, venue_name, links_json, folder"
    : "id, title, authors, abstract, pdf_path, NULL AS xml, parsed_at, model_used, year, venue_type, venue_name, links_json, folder";
  let sql = `SELECT ${selectCols} FROM articles WHERE 1=1`;
  const params: (string | number)[] = [];
  if (filters.search) {
    sql +=
      " AND (title LIKE ? OR abstract LIKE ? OR authors LIKE ? OR IFNULL(venue_name,'') LIKE ? OR IFNULL(links_json,'') LIKE ? OR IFNULL(folder,'') LIKE ?)";
    const term = `%${filters.search}%`;
    params.push(term, term, term, term, term, term);
  }
  if (filters.year_min != null && Number.isFinite(filters.year_min)) {
    sql += " AND year IS NOT NULL AND year >= ?";
    params.push(filters.year_min);
  }
  if (filters.year_max != null && Number.isFinite(filters.year_max)) {
    sql += " AND year IS NOT NULL AND year <= ?";
    params.push(filters.year_max);
  }
  if (filters.venue_type && filters.venue_type.trim() && filters.venue_type !== "all") {
    sql += " AND IFNULL(venue_type,'') = ?";
    params.push(filters.venue_type.trim());
  }
  if (filters.folder === "__root__") {
    sql += " AND (folder IS NULL OR TRIM(IFNULL(folder,'')) = '')";
  } else if (filters.folder != null && filters.folder.trim() !== "") {
    sql += " AND folder = ?";
    params.push(filters.folder.trim());
  }
  const order = filters.order === "asc" ? "ASC" : "DESC";
  if (filters.sort === "folder") {
    sql += ` ORDER BY IFNULL(folder,'') ${order}, parsed_at DESC`;
  } else {
    const sortCol = filters.sort === "title" ? "title" : "parsed_at";
    sql += ` ORDER BY ${sortCol} ${order}`;
  }
  return database.prepare(sql).all(...params) as Article[];
}

export function getArticle(id: string): Article | null {
  const database = getDb();
  const row = database.prepare(
    "SELECT id, title, authors, abstract, pdf_path, xml, parsed_at, model_used, year, venue_type, venue_name, links_json, folder FROM articles WHERE id = ?"
  ).get(id) as Article | undefined;
  return row ?? null;
}

/** Lightweight rows for chat scope / citation list (order matches `ids`). */
export function getArticlesMeta(ids: string[]): Array<{ id: string; title: string | null; pdf_path: string | null }> {
  const ordered = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (ordered.length === 0) return [];
  const database = getDb();
  const placeholders = ordered.map(() => "?").join(",");
  const rows = database
    .prepare(`SELECT id, title, pdf_path FROM articles WHERE id IN (${placeholders})`)
    .all(...ordered) as Array<{ id: string; title: string | null; pdf_path: string | null }>;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ordered.map((id) => byId.get(id)).filter((r): r is { id: string; title: string | null; pdf_path: string | null } => r != null);
}

export function upsertArticle(article: {
  id: string;
  title?: string | null;
  authors?: string | null;
  abstract?: string | null;
  pdf_path?: string | null;
  xml?: string | null;
  parsed_at?: string | null;
  model_used?: string | null;
  year?: number | null;
  venue_type?: string | null;
  venue_name?: string | null;
  links_json?: string | null;
  folder?: string | null;
}): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO articles (id, title, authors, abstract, pdf_path, xml, parsed_at, model_used, year, venue_type, venue_name, links_json, folder)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = COALESCE(excluded.title, title),
      authors = COALESCE(excluded.authors, authors),
      abstract = COALESCE(excluded.abstract, abstract),
      pdf_path = COALESCE(excluded.pdf_path, pdf_path),
      xml = COALESCE(excluded.xml, xml),
      parsed_at = COALESCE(excluded.parsed_at, parsed_at),
      model_used = COALESCE(excluded.model_used, model_used),
      year = COALESCE(excluded.year, year),
      venue_type = COALESCE(excluded.venue_type, venue_type),
      venue_name = COALESCE(excluded.venue_name, venue_name),
      links_json = COALESCE(excluded.links_json, links_json),
      folder = COALESCE(excluded.folder, folder)
  `).run(
    article.id,
    article.title ?? null,
    article.authors ?? null,
    article.abstract ?? null,
    article.pdf_path ?? null,
    article.xml ?? null,
    article.parsed_at ?? null,
    article.model_used ?? null,
    article.year ?? null,
    article.venue_type ?? null,
    article.venue_name ?? null,
    article.links_json ?? null,
    article.folder ?? null
  );
}

export type ArticleExportRow = {
  id: string;
  title: string | null;
  authors: string | null;
  abstract: string | null;
  pdf_path: string | null;
  parsed_at: string | null;
  year: number | null;
  venue_type: string | null;
  venue_name: string | null;
  links_json: string | null;
  folder: string | null;
};

export function getArticlesExportRows(ids: string[] | null): ArticleExportRow[] {
  const database = getDb();
  const base =
    "SELECT id, title, authors, abstract, pdf_path, parsed_at, year, venue_type, venue_name, links_json, folder FROM articles";
  if (ids && ids.length > 0) {
    const placeholders = ids.map(() => "?").join(",");
    return database.prepare(`${base} WHERE id IN (${placeholders}) ORDER BY parsed_at DESC`).all(...ids) as ArticleExportRow[];
  }
  return database.prepare(`${base} ORDER BY parsed_at DESC`).all() as ArticleExportRow[];
}

export function deleteArticle(id: string): void {
  const database = getDb();
  database.prepare("DELETE FROM articles WHERE id = ?").run(id);
}

export function getReviews(articleId: string): Review[] {
  const database = getDb();
  return database.prepare(
    "SELECT id, article_id, task, model, review_depth, result, created_at FROM reviews WHERE article_id = ? ORDER BY created_at DESC"
  ).all(articleId) as Review[];
}

/** Batch-load reviews for many articles (export, list previews). */
export function getReviewsForArticleIds(ids: string[]): Review[] {
  if (ids.length === 0) return [];
  const database = getDb();
  const ph = ids.map(() => "?").join(",");
  return database
    .prepare(
      `SELECT id, article_id, task, model, review_depth, result, created_at FROM reviews WHERE article_id IN (${ph}) ORDER BY article_id, created_at DESC`,
    )
    .all(...ids) as Review[];
}

export function getReview(articleId: string, task: number, model: string, reviewDepth: string): Review | null {
  const database = getDb();
  const row = database.prepare(
    "SELECT id, article_id, task, model, review_depth, result, created_at FROM reviews WHERE article_id = ? AND task = ? AND model = ? AND review_depth = ?"
  ).get(articleId, task, model, reviewDepth) as Review | undefined;
  return row ?? null;
}

export function upsertReview(articleId: string, task: number, model: string, result: string, reviewDepth: string): void {
  const database = getDb();
  database.prepare(`
    INSERT INTO reviews (article_id, task, model, review_depth, result) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(article_id, task, model, review_depth) DO UPDATE SET result = excluded.result, created_at = datetime('now')
  `).run(articleId, task, model, reviewDepth, result);
}

export function getSetting(key: string): string | null {
  const database = getDb();
  const row = database.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  const database = getDb();
  database.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, value);
}

/** Absolute path to the SQLite file (after getDb() may create parent dir). */
export function getDatabaseFilePath(): string {
  return DB_PATH;
}

/** Distinct non-empty folder paths for library filters. */
export function getDistinctArticleFolders(): string[] {
  const database = getDb();
  const rows = database
    .prepare(
      "SELECT DISTINCT folder AS f FROM articles WHERE folder IS NOT NULL AND TRIM(folder) != '' ORDER BY folder COLLATE NOCASE ASC",
    )
    .all() as Array<{ f: string }>;
  return rows.map((r) => r.f);
}

export function getArticleCount(): number {
  const database = getDb();
  const row = database.prepare("SELECT COUNT(*) AS n FROM articles").get() as { n: number };
  return Number(row?.n ?? 0);
}

export function getReviewRowCount(): number {
  const database = getDb();
  const row = database.prepare("SELECT COUNT(*) AS n FROM reviews").get() as { n: number };
  return Number(row?.n ?? 0);
}

// -------- Parse outputs (non-TEI / VLM payloads) --------

/** Normalized record for any parser engine; VLM payloads live here rather than on `articles`. */
export interface ArticleParseOutput {
  id: number;
  article_id: string;
  parser_engine: string;
  parser_model: string | null;
  output_format: string;
  payload_json: string | null;
  normalized_text: string | null;
  is_primary: number;
  created_at: string;
}

export function insertParseOutput(row: {
  article_id: string;
  parser_engine: string;
  parser_model?: string | null;
  output_format: string;
  payload_json?: string | null;
  normalized_text?: string | null;
  is_primary?: boolean;
}): number {
  const database = getDb();
  if (row.is_primary) {
    database
      .prepare("UPDATE article_parse_outputs SET is_primary = 0 WHERE article_id = ?")
      .run(row.article_id);
  }
  const info = database
    .prepare(
      `INSERT INTO article_parse_outputs
        (article_id, parser_engine, parser_model, output_format, payload_json, normalized_text, is_primary)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.article_id,
      row.parser_engine,
      row.parser_model ?? null,
      row.output_format,
      row.payload_json ?? null,
      row.normalized_text ?? null,
      row.is_primary ? 1 : 0,
    );
  return Number(info.lastInsertRowid);
}

export function getLatestParseOutput(articleId: string): ArticleParseOutput | null {
  const database = getDb();
  const row = database
    .prepare(
      `SELECT id, article_id, parser_engine, parser_model, output_format, payload_json, normalized_text, is_primary, created_at
       FROM article_parse_outputs
       WHERE article_id = ?
       ORDER BY is_primary DESC, created_at DESC
       LIMIT 1`,
    )
    .get(articleId) as ArticleParseOutput | undefined;
  return row ?? null;
}

export function listParseOutputs(articleId: string): ArticleParseOutput[] {
  const database = getDb();
  return database
    .prepare(
      `SELECT id, article_id, parser_engine, parser_model, output_format, payload_json, normalized_text, is_primary, created_at
       FROM article_parse_outputs
       WHERE article_id = ?
       ORDER BY created_at DESC`,
    )
    .all(articleId) as ArticleParseOutput[];
}

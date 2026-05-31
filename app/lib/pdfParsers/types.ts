/**
 * Shared types for the PDF parser abstraction.
 *
 * Every parser engine produces a {@link ParsedOutput} so downstream code can persist
 * the raw payload (TEI XML, Markdown, JSON, etc.) while still getting a normalized
 * text view to back chat/search.
 */

export type ParserEngine =
  | "opendataloader"
  | "grobid"
  | "openrouter_vlm"
  | "ollama_vlm"
  | "dots_ocr"
  | "chandra_ocr2";

/** Options passed through to @opendataloader/pdf when engine is `opendataloader`. */
export interface OpenDataLoaderParseOptions {
  /** e.g. `docling-fast` when hybrid server is running; omit or `off` for local-only. */
  hybrid?: string;
  hybridUrl?: string;
  hybridMode?: string;
  useStructTree?: boolean;
  /** When true, pass hybrid to docling-fast and rely on server started with --force-ocr (user responsibility). */
  forceOcr?: boolean;
  ocrLang?: string;
  enrichFormula?: boolean;
  enrichPictureDescription?: boolean;
}

export type ParsedOutputFormat = "tei_xml" | "markdown" | "json" | "plain_text";

export interface ParsedArticleFields {
  title: string | null;
  authors: string | null;
  abstract: string | null;
  year: number | null;
  venue_type: string | null;
  venue_name: string | null;
  links_json: string | null;
}

export interface ParsedOutput {
  engine: ParserEngine;
  model: string | null;
  format: ParsedOutputFormat;
  /** Raw parser payload (TEI XML string, Markdown text, or JSON string). */
  rawPayload: string;
  /** Best-effort plain text representation used for search/chat context. */
  normalizedText: string;
  /** TEI XML when the engine produces it; otherwise null. */
  teiXml: string | null;
  /** Best-effort structured metadata extracted from the payload. */
  articleFields: ParsedArticleFields;
}

export interface ParseRequestOptions {
  /** Which engine to invoke. Defaults to app setting `pdf_parser_default_engine` or `opendataloader`. */
  engine?: ParserEngine;
  /** Optional model override for VLM engines. */
  model?: string | null;
  /** GROBID base URL (used only for `grobid`). */
  grobidUrl?: string | null;
  /** Maximum PDF pages rendered for VLM engines. */
  maxPages?: number;
  /** Overrides persisted OpenDataLoader settings for this request. */
  opendataloader?: OpenDataLoaderParseOptions;
}

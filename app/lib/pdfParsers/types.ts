/**
 * Shared types for the PDF parser abstraction.
 *
 * Every parser engine produces a {@link ParsedOutput} so downstream code can persist
 * the raw payload (TEI XML, Markdown, JSON, etc.) while still getting a normalized
 * text view to back chat/search.
 */

export type ParserEngine = "grobid" | "openrouter_vlm" | "ollama_vlm";

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
  /** Which engine to invoke. Defaults to `grobid`. */
  engine?: ParserEngine;
  /** Optional model override for VLM engines. */
  model?: string | null;
  /** GROBID base URL (used only for `grobid`). */
  grobidUrl?: string | null;
  /** Maximum PDF pages rendered for VLM engines. */
  maxPages?: number;
}

import { getSetting } from "../../db.js";
import { parseWithGrobid } from "./grobidParser.js";
import {
  OPENROUTER_VLM_DEFAULT_MODEL,
  parseWithOpenRouterVlm,
} from "./openrouterVlmParser.js";
import {
  OLLAMA_DEFAULT_URL,
  OLLAMA_VLM_DEFAULT_MODEL,
  parseWithOllamaVlm,
} from "./ollamaVlmParser.js";
import type { ParseRequestOptions, ParsedOutput, ParserEngine } from "./types.js";

export type { ParsedOutput, ParserEngine, ParseRequestOptions } from "./types.js";
export {
  OPENROUTER_VLM_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  OLLAMA_VLM_DEFAULT_MODEL,
};

const VALID_ENGINES: ParserEngine[] = ["grobid", "openrouter_vlm", "ollama_vlm"];

export function coerceEngine(value: unknown, fallback: ParserEngine = "grobid"): ParserEngine {
  if (typeof value !== "string") return fallback;
  const v = value.trim() as ParserEngine;
  return VALID_ENGINES.includes(v) ? v : fallback;
}

/** Dispatch to the requested parser. Fills settings-based defaults automatically. */
export async function parsePdfWithEngine(
  pdfBuffer: Buffer,
  filename: string,
  options: ParseRequestOptions = {},
): Promise<ParsedOutput> {
  const engine = options.engine ?? (getSetting("pdf_parser_default_engine") as ParserEngine | null) ?? "grobid";

  switch (engine) {
    case "grobid": {
      const grobidUrl = options.grobidUrl ?? getSetting("grobid_url");
      return parseWithGrobid(pdfBuffer, filename, grobidUrl);
    }
    case "openrouter_vlm": {
      const apiKey = getSetting("openrouter_api_key") || process.env.OPENROUTER_API_KEY || "";
      const model = options.model ?? getSetting("pdf_parser_openrouter_model") ?? OPENROUTER_VLM_DEFAULT_MODEL;
      return parseWithOpenRouterVlm(pdfBuffer, { apiKey, model, maxPages: options.maxPages });
    }
    case "ollama_vlm": {
      const baseUrl = getSetting("ollama_url") || process.env.OLLAMA_URL || OLLAMA_DEFAULT_URL;
      const model = options.model ?? getSetting("pdf_parser_ollama_model") ?? OLLAMA_VLM_DEFAULT_MODEL;
      return parseWithOllamaVlm(pdfBuffer, { baseUrl, model, maxPages: options.maxPages });
    }
    default: {
      throw new Error(`Unknown parser engine: ${engine}`);
    }
  }
}

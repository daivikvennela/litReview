import { getSetting } from "../../db.js";
import { parseWithGrobid } from "./grobidParser.js";
import { parseWithOpenDataLoader } from "./opendataloaderParser.js";
import {
  OPENROUTER_VLM_DEFAULT_MODEL,
  parseWithOpenRouterVlm,
} from "./openrouterVlmParser.js";
import {
  OLLAMA_DEFAULT_URL,
  OLLAMA_VLM_DEFAULT_MODEL,
  parseWithOllamaVlm,
} from "./ollamaVlmParser.js";
import type { OpenDataLoaderParseOptions, ParseRequestOptions, ParsedOutput, ParserEngine } from "./types.js";

export type { OpenDataLoaderParseOptions, ParsedOutput, ParserEngine, ParseRequestOptions } from "./types.js";
export {
  OPENROUTER_VLM_DEFAULT_MODEL,
  OLLAMA_DEFAULT_URL,
  OLLAMA_VLM_DEFAULT_MODEL,
};

const VALID_ENGINES: ParserEngine[] = ["opendataloader", "grobid", "openrouter_vlm", "ollama_vlm"];

function parseBoolSetting(key: string, defaultValue: boolean): boolean {
  const v = getSetting(key);
  if (v == null || v === "") return defaultValue;
  const t = v.toLowerCase().trim();
  if (t === "0" || t === "false" || t === "no" || t === "off") return false;
  if (t === "1" || t === "true" || t === "yes" || t === "on") return true;
  return defaultValue;
}

export function coerceEngine(value: unknown, fallback: ParserEngine = "opendataloader"): ParserEngine {
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
  const engine = options.engine ?? (getSetting("pdf_parser_default_engine") as ParserEngine | null) ?? "opendataloader";

  switch (engine) {
    case "opendataloader": {
      const od = options.opendataloader;
      const hybridEnabled =
        od?.hybrid !== undefined
          ? od.hybrid !== "off" && od.hybrid !== ""
          : parseBoolSetting("opendataloader_hybrid_enabled", false);
      const hybridUrl =
        (od?.hybridUrl ?? getSetting("opendataloader_hybrid_url") ?? "http://localhost:5002").replace(/\/$/, "") ||
        "http://localhost:5002";
      const useStructTree =
        od?.useStructTree !== undefined ? od.useStructTree : parseBoolSetting("opendataloader_use_struct_tree", true);
      const enrichFormula =
        od?.enrichFormula ?? parseBoolSetting("opendataloader_enrich_formula", false);
      const enrichPicture =
        od?.enrichPictureDescription ??
        parseBoolSetting("opendataloader_enrich_picture_description", false);
      const odlOpts: OpenDataLoaderParseOptions = {
        useStructTree,
        enrichFormula,
        enrichPictureDescription: enrichPicture,
        forceOcr: od?.forceOcr ?? parseBoolSetting("opendataloader_force_ocr", false),
        ocrLang: od?.ocrLang ?? getSetting("opendataloader_ocr_lang") ?? undefined,
      };
      if (hybridEnabled) {
        odlOpts.hybrid = typeof od?.hybrid === "string" && od.hybrid.length > 0 ? od.hybrid : "docling-fast";
        odlOpts.hybridUrl = hybridUrl;
        if (enrichFormula || enrichPicture) {
          odlOpts.hybridMode = od?.hybridMode ?? "full";
        }
      }
      return parseWithOpenDataLoader(pdfBuffer, filename, odlOpts);
    }
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

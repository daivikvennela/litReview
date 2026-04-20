import { pdfToPngBase64Pages } from "./pdfToImages.js";
import {
  VLM_PARSE_SYSTEM_PROMPT,
  VLM_USER_PROMPT,
  extractFieldsFromVlmMarkdown,
  markdownToPlainText,
} from "./vlmShared.js";
import type { ParsedOutput } from "./types.js";

export const OLLAMA_DEFAULT_URL = "http://localhost:11434";
/**
 * Recommended local OSS VLMs for PDF pages. Leading community picks as of writing:
 * - `qwen2.5vl:7b` (Qwen 2.5-VL 7B; strong doc/layout understanding)
 * - `minicpm-v` (MiniCPM-V 2.6; lightweight, multi-image)
 * - `llama3.2-vision` (Meta 11B vision)
 */
export const OLLAMA_VLM_DEFAULT_MODEL = "qwen2.5vl:7b";

export async function parseWithOllamaVlm(
  pdfBuffer: Buffer,
  opts: { baseUrl?: string | null; model?: string | null; maxPages?: number },
): Promise<ParsedOutput> {
  const base = (opts.baseUrl?.trim() || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
  const model = opts.model?.trim() || OLLAMA_VLM_DEFAULT_MODEL;
  const pages = await pdfToPngBase64Pages(pdfBuffer, { maxPages: opts.maxPages ?? 6 });

  const body = {
    model,
    stream: false,
    options: { temperature: 0.1 },
    messages: [
      { role: "system", content: VLM_PARSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: VLM_USER_PROMPT,
        images: pages,
      },
    ],
  };

  let res: Response;
  try {
    res = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not reach Ollama at ${base}: ${msg}`);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama VLM error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const json = (await res.json()) as { message?: { content?: string } };
  const markdown = json.message?.content?.trim() ?? "";
  if (!markdown) throw new Error("Ollama VLM returned an empty response");

  return {
    engine: "ollama_vlm",
    model,
    format: "markdown",
    rawPayload: markdown,
    normalizedText: markdownToPlainText(markdown),
    teiXml: null,
    articleFields: extractFieldsFromVlmMarkdown(markdown),
  };
}

export async function checkOllamaAlive(baseUrl?: string | null): Promise<boolean> {
  const base = (baseUrl?.trim() || OLLAMA_DEFAULT_URL).replace(/\/+$/, "");
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

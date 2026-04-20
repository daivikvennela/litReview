import { pdfToPngBase64Pages } from "./pdfToImages.js";
import {
  VLM_PARSE_SYSTEM_PROMPT,
  VLM_USER_PROMPT,
  extractFieldsFromVlmMarkdown,
  markdownToPlainText,
} from "./vlmShared.js";
import type { ParsedOutput } from "./types.js";

/**
 * Recommended OpenRouter VLMs (frontier + OSS). Used as default when caller leaves `model` blank.
 * `qwen/qwen2.5-vl-72b-instruct:free` is a strong OSS vision-language choice on OpenRouter.
 */
export const OPENROUTER_VLM_DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct:free";

export async function parseWithOpenRouterVlm(
  pdfBuffer: Buffer,
  opts: { apiKey: string; model?: string | null; maxPages?: number },
): Promise<ParsedOutput> {
  if (!opts.apiKey) throw new Error("Missing OpenRouter API key. Set it in Settings.");
  const model = opts.model?.trim() || OPENROUTER_VLM_DEFAULT_MODEL;
  const pages = await pdfToPngBase64Pages(pdfBuffer, { maxPages: opts.maxPages ?? 8 });

  const imageContent = pages.map((b64) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/png;base64,${b64}` },
  }));

  const body = {
    model,
    messages: [
      { role: "system", content: VLM_PARSE_SYSTEM_PROMPT },
      {
        role: "user",
        content: [{ type: "text", text: VLM_USER_PROMPT }, ...imageContent],
      },
    ],
    temperature: 0.1,
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://litreview.local",
      "X-Title": "Lit Review Agent",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenRouter VLM error (${res.status}): ${errText.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const markdown = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!markdown) throw new Error("OpenRouter VLM returned an empty response");

  return {
    engine: "openrouter_vlm",
    model,
    format: "markdown",
    rawPayload: markdown,
    normalizedText: markdownToPlainText(markdown),
    teiXml: null,
    articleFields: extractFieldsFromVlmMarkdown(markdown),
  };
}

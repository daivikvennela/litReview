import { parsePdfViaSidecar } from "./ocrSidecarClient.js";
import { extractFieldsFromVlmMarkdown, markdownToPlainText } from "./vlmShared.js";
import type { ParsedOutput } from "./types.js";

function titleFromFilename(filename: string): string {
  return filename.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim();
}

export async function parseWithDotsOcr(
  pdfBuffer: Buffer,
  filename: string,
  baseUrl: string,
  timeoutMs?: number,
): Promise<ParsedOutput> {
  const response = await parsePdfViaSidecar(baseUrl, pdfBuffer, filename, { timeoutMs });
  const markdown = response.markdown.trim();
  const fields = extractFieldsFromVlmMarkdown(markdown);
  if (!fields.title) {
    fields.title = titleFromFilename(filename);
  }

  return {
    engine: "dots_ocr",
    model: response.model ?? "dots.ocr",
    format: "json",
    rawPayload: JSON.stringify(response),
    normalizedText: markdownToPlainText(markdown),
    teiXml: null,
    articleFields: fields,
  };
}

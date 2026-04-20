import { parsePdfToXml } from "../grobid.js";
import { buildArticleRecordFromTei } from "../teiMetadata.js";
import type { ParsedOutput } from "./types.js";

/** Wrap existing GROBID call so it returns a normalized {@link ParsedOutput}. */
export async function parseWithGrobid(
  pdfBuffer: Buffer,
  filename: string,
  grobidUrl: string | null,
): Promise<ParsedOutput> {
  const xml = await parsePdfToXml(pdfBuffer, filename, grobidUrl);
  const record = buildArticleRecordFromTei(xml, {
    id: "tmp",
    pdf_path: filename,
    parsed_at: "",
  });
  const normalizedText = extractNormalizedTextFromTei(xml);
  return {
    engine: "grobid",
    model: "grobid",
    format: "tei_xml",
    rawPayload: xml,
    normalizedText,
    teiXml: xml,
    articleFields: {
      title: record.title,
      authors: record.authors,
      abstract: record.abstract,
      year: record.year,
      venue_type: record.venue_type,
      venue_name: record.venue_name,
      links_json: record.links_json,
    },
  };
}

/** Crude TEI → text conversion for search/chat context on VLM-agnostic rows. */
function extractNormalizedTextFromTei(xml: string): string {
  return xml
    .replace(/<teiHeader[\s\S]*?<\/teiHeader>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

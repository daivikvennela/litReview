import type { ParsedArticleFields } from "./types.js";

export const VLM_PARSE_SYSTEM_PROMPT = `You are a meticulous research-paper extraction engine. You will be shown images of the pages of a single PDF research article.

Extract the paper's contents into **clean Markdown** using this exact structure:

# <Paper Title>

**Authors:** <Comma-separated authors, in order>
**Year:** <4-digit year or "unknown">
**Venue Type:** <one of: journal, conference, preprint, book, report, unknown>
**Venue:** <Full venue name or "unknown">

## Abstract
<The paper's abstract, verbatim where possible>

## Sections
<Use the paper's section headings as \`##\` subheaders. Preserve paragraphs, lists, and inline citations. Render equations as LaTeX inside \`$...$\` / \`$$...$$\`. Describe figures briefly in italics like *Figure 1: <caption>*; do not fabricate figure data.>

## References
<Numbered list of the references as printed.>

Rules:
- Do not invent content that is not visible on the pages.
- Prefer fidelity over summarization; transcribe section text rather than paraphrasing.
- Never wrap the full response in code fences.`;

export const VLM_USER_PROMPT = `Extract this paper following the required Markdown structure. Return **only** the Markdown, with no preamble or closing commentary.`;

/** Parse the title/authors/abstract/year block that the VLM system prompt asks for. */
export function extractFieldsFromVlmMarkdown(md: string): ParsedArticleFields {
  const title = (md.match(/^#\s+(.+?)\s*$/m)?.[1] ?? "").trim();
  const authorsLine = md.match(/^\*\*Authors:\*\*\s*(.+?)\s*$/m)?.[1]?.trim();
  const yearLine = md.match(/^\*\*Year:\*\*\s*(.+?)\s*$/m)?.[1]?.trim();
  const venueType = md.match(/^\*\*Venue Type:\*\*\s*(.+?)\s*$/m)?.[1]?.trim();
  const venueName = md.match(/^\*\*Venue:\*\*\s*(.+?)\s*$/m)?.[1]?.trim();
  const abstractSection = md.match(/##\s+Abstract\s*\n+([\s\S]*?)(?:\n##\s+|\n#\s+|$)/)?.[1]?.trim();

  let year: number | null = null;
  if (yearLine) {
    const m = yearLine.match(/(\d{4})/);
    if (m) {
      const y = parseInt(m[1], 10);
      if (y >= 1800 && y <= 2100) year = y;
    }
  }

  let authors: string | null = null;
  if (authorsLine && authorsLine.toLowerCase() !== "unknown") {
    const list = authorsLine
      .split(/[,;]| and /i)
      .map((a) => a.trim())
      .filter(Boolean);
    if (list.length > 0) authors = JSON.stringify(list);
  }

  const normalize = (v: string | undefined) => (v && v.toLowerCase() !== "unknown" ? v : null);

  return {
    title: title || null,
    authors,
    abstract: abstractSection && abstractSection.length > 0 ? abstractSection : null,
    year,
    venue_type: normalize(venueType),
    venue_name: normalize(venueName),
    links_json: null,
  };
}

/** Strip Markdown to plain text for search/chat indexing. */
export function markdownToPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

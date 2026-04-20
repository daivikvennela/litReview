import { getArticle } from "../db.js";

const MAX_TOTAL_CHARS = 100_000;

function stripTags(xml: string): string {
  return xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export type ArticleContextOptions = {
  /** When set, adds task-specific framing on top of the default preamble. */
  mode?: string;
};

/**
 * Builds a system-prompt block with full text for scoped chat (~100k chars total split across articles).
 */
export function buildArticleContextSystemBlock(articleIds: string[], options?: ArticleContextOptions): string | null {
  const ids = [...new Set(articleIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return null;

  const blobs: { id: string; title: string; body: string }[] = [];
  for (const id of ids) {
    const a = getArticle(id);
    if (!a) continue;
    const title = a.title || a.pdf_path || id;
    const chunks: string[] = [];
    if (a.authors?.trim()) chunks.push(`Authors:\n${a.authors.trim()}`);
    if (a.year != null) chunks.push(`Year: ${a.year}`);
    if (a.venue_type || a.venue_name) {
      chunks.push(`Venue: ${[a.venue_type, a.venue_name].filter(Boolean).join(" — ")}`);
    }
    if (a.abstract?.trim()) chunks.push(`Abstract:\n${a.abstract.trim()}`);
    if (a.xml?.trim()) {
      const plain = stripTags(a.xml);
      chunks.push(`Extracted full text (TEI → plain):\n${plain}`);
    }
    const body = chunks.length > 0 ? chunks.join("\n\n") : "(No extracted text for this article yet — parse the PDF first.)";
    blobs.push({ id, title, body });
  }
  if (blobs.length === 0) return null;

  const perArticle = Math.max(4_000, Math.floor(MAX_TOTAL_CHARS / blobs.length));
  let preamble =
    "The user is asking about ONLY the following research article(s). Ground factual claims in this text only. " +
    "If something is not stated here, say it is not in the provided document(s). Do not invent citations, numbers, or results.";
  if (options?.mode === "related_work_compile") {
    preamble +=
      " Task: produce a publication-quality **Related Works** synthesis across these papers — thematic comparison first; " +
      "avoid turning the section into a disconnected list of per-paper abstracts unless the evidence base is extremely thin.";
  }
  const citationStyle = `
### Inline citations (required for claims from the papers)
Whenever you state a specific fact, number, method, quote, or finding from the documents, add a **small superscript-style Markdown link** immediately after that claim so the UI can hyperlink it:
- Format: \`[n](cite:DOCUMENT_INTERNAL_ID)\` where \`n\` is the citation index (1, 2, 3, …) and \`DOCUMENT_INTERNAL_ID\` is the **exact** value shown after "Internal ID:" in the document block above (copy-paste it; never guess or invent an ID).
- Example: \`The model reached 94% accuracy[1](cite:0f1b16afa320e4c1af0fffdc79e79a11)\`.
- Use a new index \`n\` when pointing to a different passage or document; reuse the same \`n\` only when repeating the same citation target.
- If the user asks something not answered in the text, say so — do **not** add a \`cite:\` link for invented content.
`.trim();
  const parts: string[] = [preamble, citationStyle];
  for (const b of blobs) {
    parts.push(
      `### Document\n- Internal ID: ${b.id}\n- Title: ${b.title}\n\n${b.body.slice(0, perArticle)}`,
    );
  }
  return parts.join("\n\n---\n\n");
}

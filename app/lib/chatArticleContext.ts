import type { Article } from "../db.js";
import { getArticle } from "../db.js";
import {
  extractConclusionSectionFromTei,
  extractRelatedWorkSectionFromTei,
  stripTeiTags,
} from "./teiSectionExtract.js";

const MAX_TOTAL_CHARS = 100_000;
/** Reserve space for preamble, citation instructions, and index map so document slices stay bounded. */
const RESERVED_CHARS = 14_000;
const MIN_PER_ARTICLE = 1_500;

function stripTags(xml: string): string {
  return stripTeiTags(xml);
}

export type ArticleContextMode = "related_work_compile" | "related_work_structured";

export type ArticleContextOptions = {
  /** When set, adds task-specific framing and focused TEI excerpts for related-work modes. */
  mode?: ArticleContextMode;
};

function shortTitle(title: string, max = 72): string {
  const t = title.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function buildDocumentBody(a: Article, focusedRelatedWork: boolean): string {
  const chunks: string[] = [];
  if (a.authors?.trim()) chunks.push(`Authors:\n${a.authors.trim()}`);
  if (a.year != null) chunks.push(`Year: ${a.year}`);
  if (a.venue_type || a.venue_name) {
    chunks.push(`Venue: ${[a.venue_type, a.venue_name].filter(Boolean).join(" — ")}`);
  }
  if (a.abstract?.trim()) chunks.push(`Abstract:\n${a.abstract.trim()}`);

  const xml = a.xml?.trim();
  if (!xml) {
    return chunks.length > 0 ? chunks.join("\n\n") : "(No extracted text for this article yet — parse the PDF first.)";
  }

  if (focusedRelatedWork) {
    const rel = extractRelatedWorkSectionFromTei(xml);
    const concl = extractConclusionSectionFromTei(xml);
    if (rel) chunks.push(`Related work (TEI excerpt):\n${rel}`);
    if (concl) chunks.push(`Conclusion (TEI excerpt):\n${concl}`);
    const fullPlain = stripTags(xml);
    chunks.push(`Broader context — full document (TEI → plain, may overlap excerpts above):\n${fullPlain}`);
  } else {
    const plain = stripTags(xml);
    chunks.push(`Extracted full text (TEI → plain):\n${plain}`);
  }

  return chunks.join("\n\n");
}

/**
 * Builds a system-prompt block with full text for scoped chat (~100k chars total split across articles).
 */
export function buildArticleContextSystemBlock(articleIds: string[], options?: ArticleContextOptions): string | null {
  const ids = [...new Set(articleIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return null;

  const focused =
    options?.mode === "related_work_compile" || options?.mode === "related_work_structured";

  const blobs: { id: string; title: string; body: string }[] = [];
  for (const id of ids) {
    const a = getArticle(id);
    if (!a) continue;
    const title = a.title || a.pdf_path || id;
    const body = buildDocumentBody(a, focused);
    blobs.push({ id, title, body });
  }
  if (blobs.length === 0) return null;

  const available = Math.max(0, MAX_TOTAL_CHARS - RESERVED_CHARS);
  const perArticle = Math.max(MIN_PER_ARTICLE, Math.floor(available / blobs.length));

  let preamble =
    "The user is asking about ONLY the following research article(s). Ground factual claims in this text only. " +
    "If something is not stated here, say it is not in the provided document(s). Do not invent citations, numbers, or results. " +
    "Output the finished prose only — never include planning notes, paper-by-paper relevance analysis, or meta-commentary about how you will write.";
  if (options?.mode === "related_work_compile") {
    preamble +=
      " Task: produce a publication-quality **Related Works** synthesis across these papers — thematic comparison first; " +
      "avoid turning the section into a disconnected list of per-paper abstracts unless the evidence base is extremely thin.";
  } else if (options?.mode === "related_work_structured") {
    preamble +=
      " Task: produce the structured related-works output requested in your system instructions (per-paper cards, synthesis, citations).";
  }

  const indexMap =
    "### Citation index (paper number → Internal ID)\n" +
    blobs.map((b, i) => `- Paper [${i + 1}] → Internal ID \`${b.id}\` → ${shortTitle(b.title)}`).join("\n");

  const citationStyle = `
### Inline citations (required for claims from the papers)
Whenever you state a specific fact, number, method, quote, or finding from the documents, add a **small superscript-style Markdown link** immediately after that claim so the UI can hyperlink it:
- Format: \`[n](cite:DOCUMENT_INTERNAL_ID)\` where \`n\` is the citation index (1, 2, 3, …) matching **Paper [n]** in the index above, and \`DOCUMENT_INTERNAL_ID\` is the **exact** value after \`Internal ID:\` in the document block (copy-paste it; never guess or invent an ID).
- Example: \`The model reached 94% accuracy[1](cite:0f1b16afa320e4c1af0fffdc79e79a11)\`.
- Use a new index \`n\` when pointing to a different passage or document; reuse the same \`n\` only when repeating the same citation target.
- If the user asks something not answered in the text, say so — do **not** add a \`cite:\` link for invented content.
`.trim();

  const parts: string[] = [preamble, indexMap, citationStyle];
  for (const b of blobs) {
    parts.push(
      `### Document\n- Internal ID: ${b.id}\n- Title: ${b.title}\n\n${b.body.slice(0, perArticle)}`,
    );
  }
  return parts.join("\n\n---\n\n");
}

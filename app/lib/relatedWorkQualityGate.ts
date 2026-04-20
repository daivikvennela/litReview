/**
 * Heuristic checks for "related_work_compile" outputs. Used to trigger one retry with stricter instructions.
 * Not a guarantee of quality — catches obvious low-rigor drafts.
 */

const CITE_PATTERN = /\(cite:[a-f0-9]{32}\)/i;

/** Minimum characters scale with number of papers (rough floor). */
export function relatedWorkMinLength(articleCount: number): number {
  const n = Math.max(2, articleCount);
  return Math.min(6_000, Math.max(750, 280 * n));
}

export function relatedWorkPassesRigor(text: string, articleCount: number): boolean {
  const t = text.trim();
  if (t.length < relatedWorkMinLength(articleCount)) return false;

  // Expect structured Markdown (at least one heading)
  if (!/^#{1,3}\s/m.test(t) && !/\n#{1,3}\s/.test(t)) return false;

  // Expect synthesis-style language (not a bare list of titles)
  if (
    !/\b(theme|synthesis|compare|comparison|contrast|method|approach|limitation|gap|evidence|finding|assumption|dataset|metric|evaluation|contribution)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  // Must use at least one inline cite link when multiple papers are in scope
  if (articleCount >= 2) {
    const citeMatches = t.match(new RegExp(CITE_PATTERN.source, "gi"));
    if (!citeMatches || citeMatches.length < 2) return false;
  }

  // Should mention takeaways / synthesis section cues (heading or body)
  if (!/\b(synthesis|takeaway|gap|related work)\b/i.test(t)) return false;

  return true;
}

/** User message appended for a single retry after a failed rigor check. */
export const RELATED_WORK_RETRY_USER_MESSAGE = `
Your previous answer did not meet the minimum rigor bar (structure, comparative depth, or citation density).

**Rewrite the entire response from scratch** (do not prepend excuses). Requirements:
1. Use clear Markdown with \`##\` / \`###\` headings and **thematic** organization — not a separate mini-summary per paper unless the user selected only 2–3 papers and comparison demands it.
2. **Compare across papers** within each theme: methods, assumptions, datasets, metrics, and where results agree or conflict.
3. Include explicit subsections for **limitations and gaps** and **synthesis takeaways** (bullets allowed there).
4. Add **at least one** \`[n](cite:INTERNAL_ID)\` citation after **every substantive claim** tied to a paper (aim for dense, honest attribution).
5. If evidence in the excerpts is thin, say so explicitly rather than inventing details.

Write at publication quality for a research audience.
`.trim();

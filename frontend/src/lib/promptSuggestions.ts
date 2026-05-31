/** Workflow user prompts for chat modes (used by toolbar, ?gen=, and prompt composer). */

export const LIT_REVIEW_PROMPT = `Write a literature review synthesis that integrates the selected papers. Organize by themes and contrasts, note gaps and methodological patterns, and ground every claim in the provided texts. Use inline citations in the required Markdown form when attributing specific points to a paper.`

export const SUMMARIZE_USER_PROMPT = `Summarize the selected papers using the structure defined in your instructions (cross-paper bullets, then a short paragraph per paper).`

export const INTRO_ABSTRACT_USER_PROMPT = `Draft the Introduction and Abstract sections in Markdown as specified in your instructions.`

export const RELATED_WORK_COMPILE_PROMPT = `Write a publication-ready **Related Works** section for a research paper: thematic synthesis across the selected sources, explicit cross-paper comparison (methods, assumptions, datasets/metrics, and where findings agree or conflict), honest uncertainty when excerpts are thin, and dense inline citations in the required Markdown form. Avoid a disconnected list of per-paper abstracts unless the evidence base is extremely small.`

export const RELATED_WORK_STRUCTURED_PROMPT = `Produce the structured related-works report exactly as specified in your instructions: per-paper cards (one-line, strengths, weaknesses, critic with citations), then section-by-section thematic synthesis. BibTeX will be appended automatically — do not invent BibTeX entries.`

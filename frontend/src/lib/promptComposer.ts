import type { ArticleMeta, ChatMode } from '@/lib/api'
import {
  INTRO_ABSTRACT_USER_PROMPT,
  LIT_REVIEW_PROMPT,
  RELATED_WORK_COMPILE_PROMPT,
  RELATED_WORK_STRUCTURED_PROMPT,
  SUMMARIZE_USER_PROMPT,
} from '@/lib/promptSuggestions'

export type GeneratedPrompt = {
  id: string
  label: string
  preview: string
  text: string
  mode?: ChatMode
  intent: string
  requiresScope?: boolean
  badge?: 'Workflow' | 'Compare' | 'Explore' | 'Methods' | 'Gaps'
}

export type PromptComposeContext = {
  partialQuery: string
  articles: ArticleMeta[]
  detailLevel: 0 | 1 | 2 | 3
}

type IntentId =
  | 'summarize'
  | 'lit_review'
  | 'intro_abstract'
  | 'related_work'
  | 'related_work_structured'
  | 'compare_methods'
  | 'compare_findings'
  | 'gaps'
  | 'metrics'
  | 'explore_topic'
  | 'library_wide'

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'in', 'on', 'for', 'to', 'with', 'by', 'from', 'as', 'at',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
  'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'using',
  'use', 'used', 'based', 'via', 'through', 'into', 'over', 'under', 'between', 'among', 'this',
  'that', 'these', 'those', 'it', 'its', 'their', 'they', 'we', 'our', 'paper', 'papers', 'study',
  'studies', 'research', 'approach', 'approaches', 'method', 'methods', 'analysis', 'results',
])

const INTENT_KEYWORDS: Record<IntentId, string[]> = {
  summarize: ['summarize', 'summary', 'overview', 'bullets', 'summ'],
  lit_review: ['literature', 'synthesis', 'survey', 'lit review', 'review'],
  intro_abstract: ['intro', 'introduction', 'abstract', 'draft'],
  related_work: ['related work', 'related works', 'prior art', 'background'],
  related_work_structured: ['bibtex', 'structured', 'cards'],
  compare_methods: ['compare', 'method', 'methodology', 'contrast'],
  compare_findings: ['findings', 'results', 'conclusions', 'outcomes'],
  gaps: ['gap', 'gaps', 'future', 'limitation', 'limitations', 'open question'],
  metrics: ['metric', 'metrics', 'dataset', 'datasets', 'benchmark', 'evaluation'],
  explore_topic: [],
  library_wide: ['library', 'corpus', 'collection'],
}

function displayTitle(a: ArticleMeta): string {
  return (a.title || a.pdf_path || a.id).trim()
}

function shortTitle(title: string, max = 56): string {
  if (title.length <= max) return title
  return `${title.slice(0, max - 1)}…`
}

export function formatPaperList(articles: ArticleMeta[]): string {
  if (articles.length === 0) return 'the selected papers'
  if (articles.length === 1) return `"${shortTitle(displayTitle(articles[0]!))}"`
  if (articles.length <= 3) {
    return articles.map((a) => `"${shortTitle(displayTitle(a))}"`).join(', ')
  }
  const first = articles.slice(0, 2).map((a) => `"${shortTitle(displayTitle(a), 40)}"`).join(', ')
  return `the ${articles.length} selected papers (including ${first}, …)`
}

export function themeHint(articles: ArticleMeta[]): string {
  const freq = new Map<string, number>()
  for (const a of articles) {
    const blob = `${a.title ?? ''} ${a.abstract ?? ''}`.toLowerCase()
    for (const raw of blob.match(/[a-z]{4,}/g) ?? []) {
      if (STOPWORDS.has(raw)) continue
      freq.set(raw, (freq.get(raw) ?? 0) + 1)
    }
  }
  const shared = [...freq.entries()]
    .filter(([, n]) => n >= Math.min(2, articles.length))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w)
  return shared.length > 0 ? shared.join(', ') : ''
}

function contextSuffix(articles: ArticleMeta[]): string {
  if (articles.length === 0) return ''
  const papers = formatPaperList(articles)
  const themes = themeHint(articles)
  let line = `\n\nFocus on: ${papers}.`
  if (themes) line += ` Shared themes in scope: ${themes}.`
  return line
}

export function matchIntents(query: string): IntentId[] {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const scored: Array<{ id: IntentId; score: number }> = []
  for (const [id, keywords] of Object.entries(INTENT_KEYWORDS) as Array<[IntentId, string[]]>) {
    if (id === 'explore_topic') continue
    let score = 0
    for (const kw of keywords) {
      if (kw.startsWith(q) || q.startsWith(kw) || kw.includes(q) || q.includes(kw)) {
        score = Math.max(score, kw.startsWith(q) ? 100 : 60)
      }
    }
    const tokens = q.split(/\s+/).filter(Boolean)
    for (const t of tokens) {
      if (keywords.some((kw) => kw.includes(t) || t.includes(kw))) score = Math.max(score, 40)
    }
    if (score > 0) scored.push({ id, score })
  }

  if (scored.length === 0 && q.length >= 2) {
    scored.push({ id: 'explore_topic', score: 30 })
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.id)
}

function relatedWorkEligible(articles: ArticleMeta[]): boolean {
  return articles.length >= 2 && articles.length <= 25
}

type TemplateDraft = Omit<GeneratedPrompt, 'id'> & { id?: string }

function tplSummarize(articles: ArticleMeta[]): TemplateDraft {
  const papers = formatPaperList(articles)
  return {
    label: 'Summarize selected papers',
    preview: `Structured summary of ${papers}`,
    text: `${SUMMARIZE_USER_PROMPT}${contextSuffix(articles)}`,
    mode: 'summarize_set',
    intent: 'summarize',
    requiresScope: true,
    badge: 'Workflow',
  }
}

function tplLitReview(articles: ArticleMeta[]): TemplateDraft {
  return {
    label: 'Literature review synthesis',
    preview: `Thematic synthesis across ${formatPaperList(articles)}`,
    text: `${LIT_REVIEW_PROMPT}${contextSuffix(articles)}`,
    mode: 'lit_review_synthesis',
    intent: 'lit_review',
    requiresScope: true,
    badge: 'Workflow',
  }
}

function tplIntroAbstract(articles: ArticleMeta[]): TemplateDraft {
  return {
    label: 'Draft Introduction and Abstract',
    preview: `Intro + abstract spanning ${formatPaperList(articles)}`,
    text: `${INTRO_ABSTRACT_USER_PROMPT}${contextSuffix(articles)}`,
    mode: 'intro_abstract',
    intent: 'intro_abstract',
    requiresScope: true,
    badge: 'Workflow',
  }
}

function tplRelatedWork(articles: ArticleMeta[]): TemplateDraft {
  return {
    label: 'Compile related works section',
    preview: `Publication-style related works for ${formatPaperList(articles)}`,
    text: `${RELATED_WORK_COMPILE_PROMPT}${contextSuffix(articles)}`,
    mode: 'related_work_compile',
    intent: 'related_work',
    requiresScope: true,
    badge: 'Workflow',
  }
}

function tplRelatedWorkStructured(articles: ArticleMeta[]): TemplateDraft {
  return {
    label: 'Structured related works + BibTeX',
    preview: `Per-paper cards and synthesis for ${formatPaperList(articles)}`,
    text: `${RELATED_WORK_STRUCTURED_PROMPT}${contextSuffix(articles)}`,
    mode: 'related_work_structured',
    intent: 'related_work_structured',
    requiresScope: true,
    badge: 'Workflow',
  }
}

function tplCompareMethods(articles: ArticleMeta[]): TemplateDraft {
  const papers = formatPaperList(articles)
  return {
    label: 'Compare methods across papers',
    preview: `Methods, assumptions, and trade-offs in ${papers}`,
    text: `Compare the experimental methodologies across ${papers}. Highlight similarities, differences, assumptions, datasets, and evaluation choices. Note where conclusions agree or conflict, and cite each paper inline when attributing claims.${contextSuffix(articles)}`,
    intent: 'compare_methods',
    requiresScope: true,
    badge: 'Compare',
  }
}

function tplCompareFindings(articles: ArticleMeta[]): TemplateDraft {
  const papers = formatPaperList(articles)
  return {
    label: 'Compare findings and conclusions',
    preview: `Results and conclusions across ${papers}`,
    text: `Compare the main findings and conclusions across ${papers}. Note where results agree, conflict, or complement each other. Ground every claim in the provided texts and use inline citations.${contextSuffix(articles)}`,
    intent: 'compare_findings',
    requiresScope: true,
    badge: 'Compare',
  }
}

function tplGaps(articles: ArticleMeta[], topic?: string): TemplateDraft {
  const papers = formatPaperList(articles)
  const topicPhrase = topic?.trim() ? ` regarding ${topic.trim()}` : ''
  return {
    label: 'Identify research gaps',
    preview: `Open questions${topicPhrase} across ${papers}`,
    text: `What gaps or open questions remain${topicPhrase} across ${papers}? Use the scoped papers as evidence, note limitations acknowledged by each study, and identify what is still unresolved.${contextSuffix(articles)}`,
    intent: 'gaps',
    requiresScope: true,
    badge: 'Gaps',
  }
}

function tplMetrics(articles: ArticleMeta[]): TemplateDraft {
  const papers = formatPaperList(articles)
  return {
    label: 'Summarize metrics and datasets',
    preview: `Evaluation setups across ${papers}`,
    text: `Summarize the evaluation metrics and datasets used across ${papers}. Compare experimental setups, benchmarks, and reported scores where possible. Cite specific papers for each claim.${contextSuffix(articles)}`,
    intent: 'metrics',
    requiresScope: true,
    badge: 'Methods',
  }
}

function tplExploreTopic(articles: ArticleMeta[], topic: string): TemplateDraft {
  const papers = formatPaperList(articles)
  const t = topic.trim()
  if (articles.length === 0) {
    return {
      label: `Explore "${t}" in my library`,
      preview: 'Survey themes and notable papers in your corpus',
      text: `What themes, methods, or findings appear in my library related to ${t}? Summarize patterns, highlight notable papers if any are in scope, and note gaps in coverage.`,
      intent: 'explore_topic',
      badge: 'Explore',
    }
  }
  return {
    label: `Explore "${t}" in scoped papers`,
    preview: `What ${papers} say about ${t}`,
    text: `What do ${papers} say about ${t}? Synthesize themes across the scoped papers, compare methods and findings where relevant, and cite each paper inline.${contextSuffix(articles)}`,
    intent: 'explore_topic',
    requiresScope: true,
    badge: 'Explore',
  }
}

function tplLibraryWide(id: string, label: string, preview: string, text: string): TemplateDraft {
  return { label, preview, text, intent: 'library_wide', badge: 'Explore', id }
}

const TEMPLATE_BUILDERS: Record<
  IntentId,
  (articles: ArticleMeta[], query?: string) => TemplateDraft | null
> = {
  summarize: (a) => tplSummarize(a),
  lit_review: (a) => tplLitReview(a),
  intro_abstract: (a) => tplIntroAbstract(a),
  related_work: (a) => (relatedWorkEligible(a) ? tplRelatedWork(a) : null),
  related_work_structured: (a) => (relatedWorkEligible(a) ? tplRelatedWorkStructured(a) : null),
  compare_methods: (a) => tplCompareMethods(a),
  compare_findings: (a) => tplCompareFindings(a),
  gaps: (a, q) => tplGaps(a, q),
  metrics: (a) => tplMetrics(a),
  explore_topic: (a, q) => tplExploreTopic(a, q ?? ''),
  library_wide: () => null,
}

function scopedDefaults(articles: ArticleMeta[]): IntentId[] {
  const base: IntentId[] = ['summarize', 'compare_methods', 'lit_review', 'gaps']
  if (relatedWorkEligible(articles)) {
    base.push('related_work', 'related_work_structured')
  }
  return base
}

function libraryDefaults(): TemplateDraft[] {
  return [
    tplLibraryWide(
      'lib_themes',
      'Survey themes in my library',
      'Broad patterns across your uploaded papers',
      'What major themes, methods, and research areas appear across my library? Group findings by theme and note which papers exemplify each area.',
    ),
    tplLibraryWide(
      'lib_recent',
      'Compare recent vs. older work',
      'Temporal patterns in your corpus',
      'Compare newer papers in my library with older ones. What methods, benchmarks, or conclusions have shifted over time?',
    ),
    tplLibraryWide(
      'lib_gaps',
      'Find gaps in my library coverage',
      'What topics are underrepresented?',
      'Based on my library, what research questions or subtopics appear under-covered? Suggest areas where adding papers would strengthen a future literature review.',
    ),
  ]
}

function finalize(draft: TemplateDraft, index: number): GeneratedPrompt {
  return {
    id: draft.id ?? `${draft.intent}-${index}`,
    label: draft.label,
    preview: draft.preview,
    text: draft.text,
    mode: draft.mode,
    intent: draft.intent,
    requiresScope: draft.requiresScope,
    badge: draft.badge,
  }
}

function buildIntent(intent: IntentId, articles: ArticleMeta[], query: string, slot: number): GeneratedPrompt | null {
  const builder = TEMPLATE_BUILDERS[intent]
  const draft = builder(articles, query)
  if (!draft) return null
  const id = draft.id ?? intent
  if (draft.requiresScope && articles.length === 0) {
    return finalize({ ...draft, preview: `${draft.preview} (select papers in Library)`, id }, slot)
  }
  return finalize({ ...draft, id }, slot)
}

export function composePrompts(ctx: PromptComposeContext, limit = 6): GeneratedPrompt[] {
  const { partialQuery, articles } = ctx
  const q = partialQuery.trim()
  const seen = new Set<string>()
  const out: GeneratedPrompt[] = []

  const push = (prompt: GeneratedPrompt | null) => {
    if (!prompt || seen.has(prompt.id)) return
    seen.add(prompt.id)
    out.push(prompt)
  }

  if (!q) {
    if (articles.length === 0) {
      for (const draft of libraryDefaults()) {
        push(finalize(draft, out.length))
        if (out.length >= limit) break
      }
      return out
    }
    for (const intent of scopedDefaults(articles)) {
      push(buildIntent(intent, articles, q, out.length))
      if (out.length >= limit) break
    }
    return out
  }

  for (const intent of matchIntents(q)) {
    push(buildIntent(intent, articles, q, out.length))
    if (out.length >= limit) break
  }

  if (out.length < limit) {
    const backfill = articles.length > 0 ? scopedDefaults(articles) : (['library_wide'] as IntentId[])
    for (const intent of backfill) {
      if (intent === 'library_wide') {
        for (const draft of libraryDefaults()) {
          push(finalize(draft, out.length))
          if (out.length >= limit) break
        }
      } else {
        push(buildIntent(intent, articles, q, out.length))
      }
      if (out.length >= limit) break
    }
  }

  return out.slice(0, limit)
}

export const INTENT_BADGE: Record<string, string> = {
  summarize: 'Workflow',
  lit_review: 'Workflow',
  intro_abstract: 'Workflow',
  related_work: 'Workflow',
  related_work_structured: 'Workflow',
}

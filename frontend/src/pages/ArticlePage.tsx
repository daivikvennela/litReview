import { useEffect, useMemo, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Sparkles,
  BookOpen,
  Library,
  RefreshCw,
} from 'lucide-react'
import { getArticle, getModels, getSettings, runReview } from '@/lib/api'
import type { ArticleWithReviews } from '@/lib/api'
import { DEFAULT_MODEL_ID } from '@/lib/modelCatalog'
import MarkdownContent, { type CitationArticleRef } from '@/components/MarkdownContent'
import AuthorsDropdown from '@/components/AuthorsDropdown'
import { pickReviewText, pickReviewTextMediumTask2 } from '@/lib/reviewPick'
import { extractIntroductionSectionFromTei, extractRelatedWorkSectionFromTei } from '@/lib/teiRelatedWork'
import {
  extractedPreviewText,
  formatParsePayload,
  hasExtractedContent,
  parserEngineLabel,
} from '@/lib/parseOutputDisplay'

type Task2Depth = 'one_line' | 'five_line' | 'detailed'

function streamKey(task: 1 | 2 | 3, task2Depth: Task2Depth): string {
  return task === 2 ? `2-${task2Depth}` : String(task)
}

function parseAuthorsJson(s: string | null): string[] {
  try {
    if (!s) return []
    const a = JSON.parse(s) as unknown
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseLinksJson(s: string | null): Array<{ url: string; kind?: string; name?: string }> {
  try {
    if (!s) return []
    const a = JSON.parse(s) as unknown
    if (!Array.isArray(a)) return []
    return a.filter(
      (x): x is { url: string; kind?: string; name?: string } =>
        x && typeof x === 'object' && typeof (x as { url?: string }).url === 'string',
    )
  } catch {
    return []
  }
}

function renderTask1Body(text: string) {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return (
      <pre className="text-[12px] bg-slate-50 dark:bg-slate-800/80 p-4 rounded-xl overflow-auto max-h-96 text-slate-800 dark:text-slate-200">
        {JSON.stringify(parsed, null, 2)}
      </pre>
    )
  } catch {
    return <MarkdownContent content={text} />
  }
}

function LlmTaskCard({
  title,
  subtitle,
  taskNum,
  picked,
  streamingText,
  generating,
  onGenerate,
  models,
  modelValue,
  onModelChange,
  task2Depth,
  onTask2DepthChange,
  citationArticle,
  hasParseContent,
}: {
  title: string
  subtitle: string
  taskNum: 1 | 2 | 3
  picked: { text: string; depth?: string } | null
  streamingText: string
  generating: boolean
  onGenerate: () => void
  models: Array<{ id: string }>
  modelValue: string
  onModelChange: (v: string) => void
  task2Depth?: Task2Depth
  onTask2DepthChange?: (d: Task2Depth) => void
  citationArticle: CitationArticleRef
  hasParseContent: boolean
}) {
  const text = (streamingText || picked?.text || '').trim()
  const showBody = text.length > 0

  return (
    <div className="rounded-xl border border-slate-200/90 dark:border-slate-700/90 bg-gradient-to-b from-white to-slate-50/80 dark:from-slate-900 dark:to-slate-900/80 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-500 shrink-0" />
            {title}
          </h3>
          <p className="text-[10px] text-slate-400 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {picked?.depth && taskNum === 2 && (
            <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{picked.depth}</span>
          )}
          <select
            value={modelValue}
            onChange={(e) => onModelChange(e.target.value)}
            className="text-[11px] border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 max-w-[200px]"
          >
            {models.length === 0 && <option value={modelValue}>{modelValue}</option>}
            {(() => {
              const visible = models.slice(0, 50)
              const needCustom = modelValue && !visible.some((m) => m.id === modelValue)
              return (
                <>
                  {needCustom && (
                    <option value={modelValue}>{modelValue}</option>
                  )}
                  {visible.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.id}
                    </option>
                  ))}
                </>
              )
            })()}
          </select>
          {taskNum === 2 && task2Depth && onTask2DepthChange && (
            <select
              value={task2Depth}
              onChange={(e) => onTask2DepthChange(e.target.value as Task2Depth)}
              className="text-[11px] border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
            >
              <option value="one_line">1 line / section</option>
              <option value="five_line">~5 lines / section (medium)</option>
              <option value="detailed">Detailed — multi-paragraph per section</option>
            </select>
          )}
          <button
            type="button"
            onClick={onGenerate}
            disabled={generating || !hasParseContent}
            title={
              !hasParseContent
                ? 'Parse the PDF first so extracted content is available for the same prompts as the drawer.'
                : undefined
            }
            className="inline-flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400 hover:text-blue-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40"
          >
            {generating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            {generating ? 'Generating…' : showBody ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>
      <div className="px-4 py-3 text-[13px] min-h-[3rem]">
        {!hasParseContent && (
          <p className="text-amber-700 dark:text-amber-400 text-[12px] mb-2">
            Upload and parse this PDF on the Upload page first — LLM tasks need extracted parser output (GROBID TEI,
            OpenDataLoader text, or other parser formats).
          </p>
        )}
        {showBody ? (
          taskNum === 1 ? (
            renderTask1Body(streamingText || picked?.text || '')
          ) : (
            <MarkdownContent
              content={streamingText || picked?.text || ''}
              citationRefPrefix={`article${taskNum}`}
              citationArticles={[citationArticle]}
            />
          )
        ) : (
          <p className="text-slate-400 dark:text-slate-500 text-[13px] leading-relaxed italic">
            Not generated yet. Choose model
            {taskNum === 2 ? ', section depth,' : ''} and Generate — same tasks and prompts as Settings → models and
            the article drawer.
          </p>
        )}
      </div>
    </div>
  )
}

export default function ArticlePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [article, setArticle] = useState<ArticleWithReviews | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rawOpen, setRawOpen] = useState(false)

  const [models, setModels] = useState<Array<{ id: string }>>([])
  const [defaultModels, setDefaultModels] = useState({
    task1: DEFAULT_MODEL_ID,
    task2: DEFAULT_MODEL_ID,
    task3: DEFAULT_MODEL_ID,
  })
  const [selectedModel, setSelectedModel] = useState<Partial<Record<1 | 2 | 3, string>>>({})
  const [task2Depth, setTask2Depth] = useState<Task2Depth>('five_line')
  const [genLoading, setGenLoading] = useState<1 | 2 | 3 | null>(null)
  const [genStream, setGenStream] = useState<Record<string, string>>({})

  const loadModelsAndDefaults = useCallback(() => {
    getSettings().then((s) => {
      setDefaultModels({
        task1: s.default_model_task1 || s.default_model || DEFAULT_MODEL_ID,
        task2: s.default_model_task2 || s.default_model || DEFAULT_MODEL_ID,
        task3: s.default_model_task3 || s.default_model || DEFAULT_MODEL_ID,
      })
    })
    getModels()
      .then((r) => {
        const list = (r as { data?: Array<{ id: string }> })?.data ?? []
        setModels(Array.isArray(list) ? list : [])
      })
      .catch(() => setModels([]))
  }, [])

  useEffect(() => {
    loadModelsAndDefaults()
  }, [loadModelsAndDefaults])

  useEffect(() => {
    if (!id) {
      setLoading(false)
      setError('No article ID')
      return
    }
    setLoading(true)
    setError(null)
    getArticle(id)
      .then(setArticle)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [id])

  const reviews = article?.reviews ?? []

  const task1 = useMemo(() => pickReviewText(reviews, 1), [reviews])
  /** Task 2: prefer cached row matching selected depth in UI; else medium fallback. */
  const task2ForSelectedDepth = useMemo(() => {
    const exact = reviews.find((r) => r.task === 2 && (r.review_depth || '') === task2Depth)
    if (exact?.result?.trim()) return { text: exact.result, depth: exact.review_depth || task2Depth }
    return pickReviewTextMediumTask2(reviews)
  }, [reviews, task2Depth])
  const task3 = useMemo(() => pickReviewText(reviews, 3), [reviews])

  const teiIntro = useMemo(
    () => (article?.xml ? extractIntroductionSectionFromTei(article.xml) : null),
    [article?.xml],
  )
  const teiRelatedWork = useMemo(
    () => (article?.xml ? extractRelatedWorkSectionFromTei(article.xml) : null),
    [article?.xml],
  )

  const authorsList = article ? parseAuthorsJson(article.authors ?? null) : []
  const links = article ? parseLinksJson(article.links_json ?? null) : []

  const refetchArticle = useCallback((): Promise<void> => {
    if (!id) return Promise.resolve()
    return getArticle(id)
      .then(setArticle)
      .then(() => undefined)
  }, [id])

  const handleGenerate = useCallback(
    (task: 1 | 2 | 3) => {
      if (!id || !article) return
      const model =
        selectedModel[task] || defaultModels[`task${task}` as 'task1' | 'task2' | 'task3'] || DEFAULT_MODEL_ID
      const key = streamKey(task, task2Depth)
      setGenLoading(task)
      setGenStream((s) => ({ ...s, [key]: '' }))
      runReview(
        id,
        task,
        model,
        (chunk) => setGenStream((s) => ({ ...s, [key]: (s[key] || '') + chunk })),
        undefined,
        (err) => setGenStream((s) => ({ ...s, [key]: (s[key] || '') + `\n[Error: ${err}]` })),
        task === 2 ? task2Depth : undefined,
      )
        .then(() => {
          setGenLoading(null)
          return refetchArticle()
            .then(() => {
              setGenStream((s) => {
                const next = { ...s }
                delete next[key]
                return next
              })
            })
            .catch(() => {
              /* keep streamed text if reload fails */
            })
        })
        .catch((e: unknown) => {
          setGenLoading(null)
          const msg = e instanceof Error ? e.message : 'Request failed'
          setGenStream((s) => ({ ...s, [key]: (s[key] || '') + `\n[Error: ${msg}]` }))
        })
    },
    [id, article, selectedModel, defaultModels, task2Depth, refetchArticle],
  )

  const citationArticle: CitationArticleRef = article
    ? { id: article.id, title: article.title, pdf_path: article.pdf_path }
    : { id: '', title: null, pdf_path: null }

  if (!id) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </button>
        <p className="mt-4 text-slate-500 dark:text-slate-400">No article ID.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </button>
        <p className="mt-4 text-slate-500 dark:text-slate-400">Loading article…</p>
      </div>
    )
  }

  if (error || !article) {
    return (
      <div className="p-6">
        <button
          type="button"
          onClick={() => navigate('/library')}
          className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Library
        </button>
        <p className="mt-4 text-red-600 dark:text-red-400">{error ?? 'Article not found.'}</p>
      </div>
    )
  }

  const xml = article.xml ?? null
  const hasXml = xml != null && typeof xml === 'string' && xml.trim() !== ''
  const hasParseContent = hasExtractedContent(article)
  const parserLabel = parserEngineLabel(article.parser_engine ?? article.parse_output?.parser_engine)
  const parsePreview = extractedPreviewText(article)
  const rawPayload = hasXml
    ? xml!
    : formatParsePayload(article.parse_output?.payload_json) ||
      article.parse_output?.normalized_text?.trim() ||
      ''
  const rawLabel = hasXml
    ? 'Extracted TEI XML (GROBID)'
    : article.parse_output
      ? `Extracted parse output (${parserLabel})`
      : 'Extracted parse output'

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 pb-16">
      <button
        type="button"
        onClick={() => navigate('/library')}
        className="text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex items-center gap-1 mb-1"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Library
      </button>

      <header className="space-y-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
          {article.title || 'Untitled'}
        </h1>
        {authorsList.length > 0 && <AuthorsDropdown authors={authorsList} />}
        <div className="flex flex-wrap gap-2 text-[12px] text-slate-500 dark:text-slate-400">
          {article.year != null && (
            <span className="font-medium text-slate-600 dark:text-slate-300">Year {article.year}</span>
          )}
          {article.venue_type && (
            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {article.venue_type}
            </span>
          )}
          {article.venue_name && <span className="text-slate-600 dark:text-slate-300">{article.venue_name}</span>}
          {article.pdf_path && <span className="font-mono text-[11px] opacity-90">{article.pdf_path}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {article.parsed_at && (
            <p className="text-[11px] text-slate-400">Parsed {new Date(article.parsed_at).toLocaleString()}</p>
          )}
          {(article.parser_engine || article.parse_output?.parser_engine) && (
            <span className="text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300">
              {parserLabel}
            </span>
          )}
        </div>
      </header>

      {/* Article preview — above TEI */}
      <div className="relative rounded-3xl border border-slate-200/80 dark:border-slate-700 bg-gradient-to-br from-slate-50/90 via-white to-blue-50/40 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 p-1 shadow-lg shadow-slate-200/40 dark:shadow-none">
        <div className="rounded-[1.35rem] bg-white/90 dark:bg-slate-950/60 backdrop-blur-sm px-5 py-6 space-y-6">
          <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
            <BookOpen className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-semibold tracking-tight">Article preview</h2>
          </div>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 -mt-2">
            <strong className="text-slate-600 dark:text-slate-300">Extracted preview</strong> comes from your parser
            (GROBID TEI or OpenDataLoader / OCR text). <strong className="text-slate-600 dark:text-slate-300">LLM blocks</strong>{' '}
            use the same backend tasks and prompts as the library drawer (
            <code className="text-[11px]">POST /api/reviews/:id</code>). Generate or regenerate inline below.
          </p>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Abstract (summarized)
              </p>
              {article.abstract?.trim() ? (
                <p className="text-[13px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {article.abstract}
                </p>
              ) : (
                <p className="text-slate-400 italic text-[13px]">
                  No abstract detected in parsed content
                  {hasParseContent ? ' (common for forms and non-paper PDFs).' : '.'}
                </p>
              )}
            </div>

            {parsePreview && !hasXml && (
              <div className="rounded-xl border border-violet-200/80 dark:border-violet-800/80 bg-violet-50/40 dark:bg-violet-950/30 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-400 mb-2">
                  Extracted text ({parserLabel})
                </p>
                <pre className="text-[12px] text-slate-800 dark:text-slate-100 leading-relaxed whitespace-pre-wrap font-sans max-h-80 overflow-auto">
                  {parsePreview}
                </pre>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  Preview from parser output. Expand the raw parse section below for the full payload.
                </p>
              </div>
            )}

            {teiIntro && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Introduction (extracted preview)
                </p>
                <p className="text-[13px] text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-[12]">
                  {teiIntro}
                </p>
                <p className="text-[10px] text-slate-400 mt-2">Truncated from TEI for preview; full text is in XML below.</p>
              </div>
            )}

            {teiRelatedWork && (
              <div className="rounded-xl border border-emerald-200/80 dark:border-emerald-800/80 bg-emerald-50/40 dark:bg-emerald-950/30 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-2">
                  Related work (extracted from TEI)
                </p>
                <p className="text-[13px] text-slate-800 dark:text-slate-100 leading-relaxed line-clamp-[14]">
                  {teiRelatedWork}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2">
                  Parsed from the Related Work / Prior Work / Background section in GROBID output when present.
                </p>
              </div>
            )}

            {!teiRelatedWork && hasXml && (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-600 bg-slate-50/30 dark:bg-slate-900/30 px-4 py-2.5">
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  No separate &quot;Related work&quot; section detected in TEI (heading may differ or section may be
                  merged). Use Task 3 LLM below or inspect full XML.
                </p>
              </div>
            )}

            {links.length > 0 && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Extracted links</p>
                <ul className="space-y-2">
                  {links.map((L, i) => (
                    <li key={`${L.url}-${i}`} className="flex flex-wrap items-baseline gap-2 text-[13px]">
                      {L.kind && (
                        <span className="text-[10px] uppercase tracking-wide text-slate-400 shrink-0">{L.kind}</span>
                      )}
                      <a
                        href={L.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline break-all inline-flex items-center gap-1"
                      >
                        {L.name || L.url}
                        <ExternalLink className="w-3 h-3 shrink-0 opacity-70" />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
                LLM outputs (same prompts as drawer)
              </p>
              <div className="grid gap-4 sm:grid-cols-1">
                <LlmTaskCard
                  taskNum={1}
                  title="Intro + metadata"
                  subtitle="Task 1 — JSON metadata, links, and context (PAPER_REVIEW option 1)"
                  picked={task1}
                  streamingText={genStream['1'] ?? ''}
                  generating={genLoading === 1}
                  onGenerate={() => handleGenerate(1)}
                  models={models}
                  modelValue={selectedModel[1] ?? defaultModels.task1}
                  onModelChange={(v) => setSelectedModel((s) => ({ ...s, 1: v }))}
                  citationArticle={citationArticle}
                  hasParseContent={hasParseContent}
                />
                <LlmTaskCard
                  taskNum={2}
                  title="Section summary"
                  subtitle="Task 2 — section-by-section summary; default depth matches “medium” (~5 lines / section)"
                  picked={task2ForSelectedDepth}
                  streamingText={genStream[streamKey(2, task2Depth)] ?? ''}
                  generating={genLoading === 2}
                  onGenerate={() => handleGenerate(2)}
                  models={models}
                  modelValue={selectedModel[2] ?? defaultModels.task2}
                  onModelChange={(v) => setSelectedModel((s) => ({ ...s, 2: v }))}
                  task2Depth={task2Depth}
                  onTask2DepthChange={setTask2Depth}
                  citationArticle={citationArticle}
                  hasParseContent={hasParseContent}
                />
                <LlmTaskCard
                  taskNum={3}
                  title="Literature review / related work"
                  subtitle="Task 3 — related work synthesis vs TEI (PAPER_REVIEW option 3)"
                  picked={task3}
                  streamingText={genStream['3'] ?? ''}
                  generating={genLoading === 3}
                  onGenerate={() => handleGenerate(3)}
                  models={models}
                  modelValue={selectedModel[3] ?? defaultModels.task3}
                  onModelChange={(v) => setSelectedModel((s) => ({ ...s, 3: v }))}
                  citationArticle={citationArticle}
                  hasParseContent={hasParseContent}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 px-1">
        <Link
          to="/library"
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2.5 text-[13px] font-medium hover:opacity-95 transition-opacity"
        >
          <Library className="w-4 h-4" />
          Open in Library
        </Link>
        <Link
          to="/metadata"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-600 px-4 py-2.5 text-[13px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80"
        >
          Metadata & export
        </Link>
      </div>

      <div className="border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden bg-slate-100/50 dark:bg-slate-900/50">
        <button
          type="button"
          onClick={() => setRawOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left text-[13px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 dark:hover:bg-slate-800/60"
        >
          <span className="flex items-center gap-2">
            {rawOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            {rawLabel}
          </span>
          {!hasParseContent && <span className="text-[11px] font-normal text-slate-400">None</span>}
        </button>
        {rawOpen && hasParseContent && (
          <pre className="text-xs font-mono bg-slate-900 text-slate-100 p-4 overflow-auto max-h-[70vh] whitespace-pre-wrap break-words border-t border-slate-700">
            {rawPayload}
          </pre>
        )}
        {rawOpen && !hasParseContent && (
          <p className="px-4 pb-4 text-sm text-slate-500 dark:text-slate-400">
            No extracted content yet. Parse the PDF from Upload.
          </p>
        )}
      </div>
    </div>
  )
}

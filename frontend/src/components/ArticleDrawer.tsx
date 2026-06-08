import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCw, Link2, FileText, BookOpen, Code, Copy, Download, ChevronRight, ChevronDown } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'
import {
  getArticle,
  getReviews,
  runReview,
  getSettings,
  getModels,
  type ArticleWithReviews,
  type Review,
  type ArticleParseOutput,
} from '@/lib/api'
import { formatParsePayload, parserEngineLabel } from '@/lib/parseOutputDisplay'
import { DEFAULT_MODEL_ID } from '@/lib/modelCatalog'
import MarkdownContent from '@/components/MarkdownContent'
import AuthorsDropdown from '@/components/AuthorsDropdown'

type Tab = 'overview' | 'extracted' | 'task1' | 'task2' | 'task3'

type Task2Depth = 'one_line' | 'five_line' | 'detailed'

const TASK_LABELS: Record<number, string> = {
  1: 'Metadata & Links',
  2: 'Section Summary',
  3: 'Related Work',
}

interface Props {
  article: ArticleWithReviews | null
  articleId: string | null
  onClose: () => void
  onRefetch?: () => void
}

function streamKey(task: number, task2Depth: Task2Depth): string {
  return task === 2 ? `2-${task2Depth}` : String(task)
}

export default function ArticleDrawer({ article, articleId, onClose, onRefetch }: Props) {
  const [tab, setTab] = useState<Tab>('extracted')
  const [streaming, setStreaming] = useState<Record<string, string>>({})
  /** Default to medium (five_line) so it matches article page “medium detail” summary. */
  const [task2Depth, setTask2Depth] = useState<Task2Depth>('five_line')
  const [loadingTask, setLoadingTask] = useState<number | null>(null)
  const [selectedModel, setSelectedModel] = useState<Record<number, string>>({})
  const [models, setModels] = useState<Array<{ id: string }>>([])
  const [defaultModels, setDefaultModels] = useState<Record<string, string>>({})

  const loadModels = () => {
    getSettings().then((s) => {
      setDefaultModels({
        task1: s.default_model_task1 || s.default_model || DEFAULT_MODEL_ID,
        task2: s.default_model_task2 || s.default_model || DEFAULT_MODEL_ID,
        task3: s.default_model_task3 || s.default_model || DEFAULT_MODEL_ID,
      })
    })
    getModels().then((r) => {
      const list = (r as { data?: Array<{ id: string }> })?.data ?? []
      setModels(Array.isArray(list) ? list : [])
    })
  }

  if (!articleId) return null
  const drawerContent = !article ? (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl min-h-screen bg-white shadow-2xl flex flex-col justify-center items-center border-l border-slate-200">
        <p className="text-slate-500">Loading article…</p>
        <button type="button" onClick={onClose} className="mt-3 text-sm text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
    </div>
  ) : null
  if (!article) {
    return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : drawerContent
  }

  const reviews = article.reviews ?? []
  const authorsParsed = (() => {
    try {
      const a = article.authors
      if (!a) return []
      const arr = JSON.parse(a) as string[]
      return Array.isArray(arr) ? arr : []
    } catch {
      return []
    }
  })()

  const getCachedForTask = (task: number, depth?: Task2Depth) => {
    if (task === 2 && depth) {
      const d = depth
      return reviews.filter((r) => r.task === task && (r.review_depth || '') === d)
    }
    return reviews.filter((r) => r.task === task)
  }

  const getStreamingOrCached = (task: number) => {
    const key = streamKey(task, task2Depth)
    const stream = streaming[key]
    if (stream) return stream
    const cachedList = task === 2 ? getCachedForTask(task, task2Depth) : getCachedForTask(task)
    const cached = cachedList[0]
    return cached?.result ?? ''
  }

  const handleGenerate = (task: 1 | 2 | 3) => {
    const model = selectedModel[task] || defaultModels[`task${task}`] || DEFAULT_MODEL_ID
    const key = streamKey(task, task2Depth)
    setLoadingTask(task)
    setStreaming((s) => ({ ...s, [key]: '' }))
    runReview(
      articleId,
      task,
      model,
      (chunk) => setStreaming((s) => ({ ...s, [key]: (s[key] || '') + chunk })),
      undefined,
      (err) => setStreaming((s) => ({ ...s, [key]: (s[key] || '') + `\n[Error: ${err}]` })),
      task === 2 ? task2Depth : undefined,
    )
      .then(() => {
        setLoadingTask(null)
        getArticle(articleId).then((a) => {
          onRefetch?.()
        })
      })
      .catch((e: unknown) => {
        setLoadingTask(null)
        const msg = e instanceof Error ? e.message : 'Request failed'
        setStreaming((s) => ({ ...s, [key]: (s[key] || '') + `\n[Error: ${msg}]` }))
      })
  }

  useEffect(() => {
    if (tab !== 'overview' && models.length === 0) loadModels()
  }, [tab])

  const fullDrawer = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl min-h-screen bg-white shadow-2xl flex flex-col overflow-hidden animate-fade-in-up border-l border-slate-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-[15px] leading-snug line-clamp-2">
              {article.title || 'Untitled'}
            </h2>
            <p className="text-[12px] text-slate-400 mt-1">
              {article.parsed_at ? new Date(article.parsed_at).toLocaleDateString() : ''}
              {article.pdf_path ? ` · ${article.pdf_path}` : ''}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0 mt-0.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-100 px-2">
          {[
            { id: 'overview', label: 'Overview', icon: BookOpen },
            { id: 'extracted', label: 'Extracted data', icon: Code },
            { id: 'task1', label: TASK_LABELS[1], icon: Link2 },
            { id: 'task2', label: TASK_LABELS[2], icon: FileText },
            { id: 'task3', label: TASK_LABELS[3], icon: BookOpen },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTab(id as Tab)
                if (id !== 'overview' && models.length === 0) loadModels()
              }}
              className={cn(
                'px-4 py-2.5 text-[12px] font-medium flex items-center gap-1.5 transition-colors',
                tab === id
                  ? 'text-blue-600 border-b-2 border-blue-500'
                  : 'text-slate-500 hover:text-slate-700',
              )}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-4">
          {tab === 'extracted' && (
            <div className="mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">Extracted data (XML)</div>
          )}
          {tab === 'overview' && (
            <>
              {authorsParsed.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Authors</p>
                  <AuthorsDropdown authors={authorsParsed} compact />
                </div>
              )}
              {(article.year != null || article.venue_type || article.venue_name) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Publication</p>
                  <p className="text-[13px] text-slate-700">
                    {[article.year, article.venue_type, article.venue_name].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
              )}
              {article.links_json && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Extracted links</p>
                  <ul className="text-[12px] text-blue-600 space-y-1 break-all">
                    {(() => {
                      try {
                        const arr = JSON.parse(article.links_json!) as Array<{ url: string; kind?: string }>
                        return Array.isArray(arr)
                          ? arr.slice(0, 20).map((l, i) => (
                              <li key={i}>
                                <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                  {l.kind ? `[${l.kind}] ` : ''}
                                  {l.url}
                                </a>
                              </li>
                            ))
                          : null
                      } catch {
                        return null
                      }
                    })()}
                  </ul>
                </div>
              )}
              {article.abstract && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Abstract</p>
                  <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">{article.abstract}</p>
                </div>
              )}
            </>
          )}

          {tab === 'extracted' && (
            <ExtractedDataViewer
              xml={article.xml ?? null}
              parseOutput={article.parse_output ?? null}
              parserEngine={article.parser_engine ?? article.parse_output?.parser_engine}
              filename={article.pdf_path || article.id}
            />
          )}

          {tab === 'task1' && (
            <ReviewTab
              task={1}
              content={getStreamingOrCached(1)}
              loading={loadingTask === 1}
              onGenerate={() => handleGenerate(1)}
              cachedList={getCachedForTask(1)}
              modelSelect={{
                models,
                value: selectedModel[1] || defaultModels.task1,
                onChange: (v) => setSelectedModel((s) => ({ ...s, 1: v })),
              }}
              renderJson
            />
          )}
          {tab === 'task2' && (
            <ReviewTab
              task={2}
              content={getStreamingOrCached(2)}
              loading={loadingTask === 2}
              onGenerate={() => handleGenerate(2)}
              cachedList={getCachedForTask(2, task2Depth)}
              task2Depth={task2Depth}
              onTask2DepthChange={setTask2Depth}
              modelSelect={{
                models,
                value: selectedModel[2] || defaultModels.task2,
                onChange: (v) => setSelectedModel((s) => ({ ...s, 2: v })),
              }}
              renderMarkdown
              citationArticle={{ id: articleId, title: article.title, pdf_path: article.pdf_path }}
            />
          )}
          {tab === 'task3' && (
            <ReviewTab
              task={3}
              content={getStreamingOrCached(3)}
              loading={loadingTask === 3}
              onGenerate={() => handleGenerate(3)}
              cachedList={getCachedForTask(3)}
              modelSelect={{
                models,
                value: selectedModel[3] || defaultModels.task3,
                onChange: (v) => setSelectedModel((s) => ({ ...s, 3: v })),
              }}
              renderMarkdown
              citationArticle={{ id: articleId, title: article.title, pdf_path: article.pdf_path }}
            />
          )}
        </div>
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(fullDrawer, document.body) : fullDrawer
}

type ViewMode = 'tree' | 'code'

function XmlTree({ xml }: { xml: string }) {
  const root = useMemo(() => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(xml, 'text/xml')
      const err = doc.querySelector('parsererror')
      if (err) return null
      return doc.documentElement
    } catch {
      return null
    }
  }, [xml])

  if (!root) return <p className="text-sm text-amber-600">Could not parse XML for tree view.</p>

  function Node({ el, depth = 0 }: { el: Element; depth?: number }) {
    const [open, setOpen] = useState(depth < 2)
    const tag = el.tagName
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}="${a.value}"`)
      .join(' ')
    const hasChildren = el.children.length > 0
    const text = Array.from(el.childNodes)
      .filter((n) => n.nodeType === 3 && n.textContent?.trim())
      .map((n) => n.textContent?.trim())
      .join(' ')
      .slice(0, 80)

    return (
      <div className="select-text" style={{ marginLeft: depth * 12 }}>
        <div
          className="flex items-start gap-1 py-0.5 hover:bg-slate-100 rounded group"
          style={{ minHeight: 20 }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="shrink-0 text-slate-400 hover:text-slate-600 p-0.5 -m-0.5"
            >
              {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-4 shrink-0" />
          )}
          <span className="text-[11px] font-mono">
            <span className="text-blue-600">&lt;{tag}</span>
            {attrs && <span className="text-amber-700"> {attrs}</span>}
            <span className="text-blue-600">{hasChildren ? '&gt;' : ' /&gt;'}</span>
            {!hasChildren && text && <span className="text-slate-500 ml-1"> {text}</span>}
          </span>
        </div>
        {open && hasChildren && (
          <div className="border-l border-slate-200 ml-1.5 pl-1">
            {Array.from(el.children).map((child, i) => (
              <Node key={i} el={child as Element} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="font-mono text-[11px] bg-slate-50 rounded-xl p-3 overflow-auto max-h-[60vh] border border-slate-200">
      <Node el={root} />
    </div>
  )
}

function ExtractedDataViewer({
  xml,
  parseOutput,
  parserEngine,
  filename,
}: {
  xml: string | null
  parseOutput?: ArticleParseOutput | null
  parserEngine?: string | null
  filename: string
}) {
  const [copied, setCopied] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('code')
  const baseName = filename.replace(/\.pdf$/i, '') || 'article'
  const hasXml = Boolean(xml?.trim())
  const rawText = hasXml
    ? xml!
    : formatParsePayload(parseOutput?.payload_json) || parseOutput?.normalized_text?.trim() || ''
  const hasContent = hasXml || Boolean(rawText.trim())
  const label = hasXml
    ? 'TEI XML (GROBID export)'
    : `Parse output (${parserEngineLabel(parserEngine ?? parseOutput?.parser_engine)})`
  const downloadExt = hasXml ? 'xml' : parseOutput?.output_format === 'json' ? 'json' : 'txt'
  const mime = hasXml ? 'application/xml' : 'text/plain'

  const handleCopy = () => {
    if (!hasContent) return
    navigator.clipboard.writeText(rawText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownload = () => {
    if (!hasContent) return
    const blob = new Blob([rawText], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${baseName}.${downloadExt}`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!hasContent) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Code className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="font-medium text-slate-500">No extracted data</p>
        <p className="text-sm mt-1">Parse a PDF from the Upload page to see extracted content here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
          {hasXml && (
            <button
              type="button"
              onClick={() => setViewMode('tree')}
              className={`px-2.5 py-1 rounded text-[12px] font-medium ${viewMode === 'tree' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Tree
            </button>
          )}
          <button
            type="button"
            onClick={() => setViewMode('code')}
            className={`px-2.5 py-1 rounded text-[12px] font-medium ${viewMode === 'code' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {hasXml ? 'Code' : 'Raw'}
          </button>
        </div>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[12px] font-medium"
        >
          <Copy className="w-3.5 h-3.5" />
          {copied ? 'Copied' : 'Copy XML'}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 text-[12px] font-medium"
        >
          <Download className="w-3.5 h-3.5" />
          Download .{downloadExt}
        </button>
      </div>
      <div className="min-h-[300px]">
        {viewMode === 'tree' && hasXml ? (
          <XmlTree xml={xml!} />
        ) : (
          <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-4 rounded-xl overflow-auto max-h-[70vh] whitespace-pre-wrap break-words border border-slate-200">
            {rawText}
          </pre>
        )}
      </div>
    </div>
  )
}

function ReviewTab({
  task,
  content,
  loading,
  onGenerate,
  cachedList,
  modelSelect,
  renderJson,
  renderMarkdown,
  task2Depth,
  onTask2DepthChange,
  citationArticle,
}: {
  task: number
  content: string
  loading: boolean
  onGenerate: () => void
  cachedList: Review[]
  modelSelect: { models: Array<{ id: string }>; value: string; onChange: (v: string) => void }
  renderJson?: boolean
  renderMarkdown?: boolean
  task2Depth?: Task2Depth
  onTask2DepthChange?: (d: Task2Depth) => void
  citationArticle?: { id: string; title: string | null; pdf_path: string | null }
}) {
  let body: React.ReactNode = content
  if (renderJson && content) {
    try {
      const parsed = JSON.parse(content) as Record<string, unknown>
      body = (
        <pre className="text-[12px] bg-slate-50 p-4 rounded-xl overflow-auto max-h-96">
          {JSON.stringify(parsed, null, 2)}
        </pre>
      )
    } catch {
      body = <pre className="text-[12px] whitespace-pre-wrap font-sans">{content}</pre>
    }
  } else if (renderMarkdown && content) {
    body = (
      <MarkdownContent
        content={content}
        citationRefPrefix="review"
        citationArticles={citationArticle ? [citationArticle] : undefined}
      />
    )
  } else if (content) {
    body = <pre className="text-[13px] text-slate-700 whitespace-pre-wrap font-sans">{content}</pre>
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <select
          value={modelSelect.value}
          onChange={(e) => modelSelect.onChange(e.target.value)}
          className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
        >
          {modelSelect.models.length === 0 && <option value={modelSelect.value}>{modelSelect.value}</option>}
          {(() => {
            const visible = modelSelect.models.slice(0, 50)
            const v = modelSelect.value
            const needCustom = v && !visible.some((m) => m.id === v)
            return (
              <>
                {needCustom && <option value={v}>{v}</option>}
                {visible.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </>
            )
          })()}
        </select>
        {task === 2 && task2Depth && onTask2DepthChange && (
          <select
            value={task2Depth}
            onChange={(e) => onTask2DepthChange(e.target.value as Task2Depth)}
            className="text-[12px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="one_line">1 line / section</option>
            <option value="five_line">~5 lines / section</option>
            <option value="detailed">Detailed — multi-paragraph per section</option>
          </select>
        )}
        <button
          onClick={onGenerate}
          disabled={loading}
          className="flex items-center gap-1.5 text-[12px] text-blue-600 hover:text-blue-700 disabled:opacity-50 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50"
        >
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? 'Generating…' : content ? 'Regenerate' : 'Generate'}
        </button>
        {cachedList.length > 0 && (
          <span className="text-[11px] text-slate-400">({cachedList.length} cached)</span>
        )}
      </div>
      {!content && !loading && (
        <div className="text-center py-12 text-slate-400 text-sm">
          <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p>Click Generate to run {TASK_LABELS[task]} for this article.</p>
        </div>
      )}
      {content && <div className="mt-2">{body}</div>}
    </div>
  )
}


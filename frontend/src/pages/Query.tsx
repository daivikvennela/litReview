import { useRef, useState, useEffect, useMemo } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import {
  Send,
  StopCircle,
  Trash2,
  MessageSquare,
  Sparkles,
  BookMarked,
  Copy,
  Check,
  FileText,
} from 'lucide-react'
import { useAppStore, type ChatMessage } from '@/store'
import { useStreamQuery } from '@/hooks/useStreamQuery'
import { cn } from '@/lib/utils'
import MarkdownContent, { type CitationArticleRef } from '@/components/MarkdownContent'
import { getArticlesMeta, type ArticleMeta } from '@/lib/api'

const LIT_REVIEW_PROMPT = `Write a literature review synthesis that integrates the selected papers. Organize by themes and contrasts, note gaps and methodological patterns, and ground every claim in the provided texts. Use inline citations in the required Markdown form when attributing specific points to a paper.`

const SUMMARIZE_USER_PROMPT = `Summarize the selected papers using the structure defined in your instructions (cross-paper bullets, then a short paragraph per paper).`

const INTRO_ABSTRACT_USER_PROMPT = `Draft the Introduction and Abstract sections in Markdown as specified in your instructions.`

const RELATED_WORK_COMPILE_PROMPT = `Write a publication-ready **Related Works** section for a research paper: thematic synthesis across the selected sources, explicit cross-paper comparison (methods, assumptions, datasets/metrics, and where findings agree or conflict), honest uncertainty when excerpts are thin, and dense inline citations in the required Markdown form. Avoid a disconnected list of per-paper abstracts unless the evidence base is extremely small.`

/** Related-work compile always uses at least detail 2 so prompts match research-grade defaults (other modes unchanged). */
function effectiveDetailForRelatedWork(level: 0 | 1 | 2 | 3): 0 | 1 | 2 | 3 {
  return Math.max(level, 2) as 0 | 1 | 2 | 3
}

/** Dedupes React Strict Mode double-effect when opening /query?...&gen= */
const autoGenConsumed = new Set<string>()

function TypingIndicator() {
  return (
    <div className="flex gap-1 items-center px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1.5 h-1.5 bg-slate-400 dark:bg-slate-500 rounded-full animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }}
        />
      ))}
    </div>
  )
}

function MessageBubble({
  role,
  content,
  sources,
  messageIndex,
  citationArticles,
  onCopy,
  copied,
}: {
  role: 'user' | 'assistant'
  content: string
  sources?: ChatMessage['sources']
  messageIndex: number
  citationArticles?: ArticleMeta[]
  onCopy?: () => void
  copied?: boolean
}) {
  const showCitations = role === 'assistant' && (citationArticles?.length ?? 0) > 0

  return (
    <div className={cn('flex animate-fade-in-up', role === 'user' ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
          role === 'user'
            ? 'bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-sm whitespace-pre-wrap'
            : 'bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-200 shadow-card',
        )}
      >
        {content ? (
          role === 'assistant' ? (
            <MarkdownContent
              content={content}
              citationRefPrefix={showCitations ? `m${messageIndex}` : undefined}
              citationArticles={showCitations ? (citationArticles as CitationArticleRef[]) : undefined}
            />
          ) : (
            <span className="whitespace-pre-wrap">{content}</span>
          )
        ) : (
          <TypingIndicator />
        )}
        {role === 'assistant' && content && onCopy && (
          <div className="not-prose mt-2 flex justify-end">
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-blue-200 dark:hover:border-blue-700"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
          </div>
        )}
        {sources && sources.length > 0 && (
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Sources</p>
            {sources.map(
              (
                s: {
                  title: string
                  year?: number
                  chunk: string
                  relevance?: number
                  paper_id?: string
                },
                i: number,
              ) => (
              <div key={i} className="text-[12px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/80 rounded-lg p-2.5">
                <p className="font-medium text-slate-700 dark:text-slate-200 truncate">
                  {s.paper_id ? (
                    <Link
                      to={`/library/article/${encodeURIComponent(s.paper_id)}`}
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {s.title}
                    </Link>
                  ) : (
                    s.title
                  )}{' '}
                  {s.year ? `(${s.year})` : ''}
                </p>
                <p className="line-clamp-2 mt-0.5">{s.chunk}</p>
                {s.relevance != null && (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className="h-1 flex-1 bg-slate-200 dark:bg-slate-600 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${s.relevance * 100}%` }} />
                    </div>
                    <span className="text-[10px] text-slate-400 tabular-nums">{(s.relevance * 100).toFixed(0)}%</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Query() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [input, setInput] = useState('')
  const [scopeMeta, setScopeMeta] = useState<ArticleMeta[]>([])
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)
  const [detailLevel, setDetailLevel] = useState<0 | 1 | 2 | 3>(0)
  const detailLabel =
    detailLevel === 0 ? '0 concise' : detailLevel === 1 ? '1 standard' : detailLevel === 2 ? '2 detailed' : '3 very detailed'
  const bottomRef = useRef<HTMLDivElement>(null)
  const { chatHistory, clearChat } = useAppStore()
  const { sendMessage, isStreaming, stop } = useStreamQuery()
  const sendRef = useRef(sendMessage)
  sendRef.current = sendMessage

  const articleIds = useMemo(() => {
    const raw = searchParams.get('articles')
    if (!raw?.trim()) return []
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }, [searchParams])

  const articleIdsKey = articleIds.join(',')

  useEffect(() => {
    if (articleIds.length === 0) {
      setScopeMeta([])
      return
    }
    getArticlesMeta(articleIds).then(setScopeMeta)
  }, [articleIdsKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatHistory])

  useEffect(() => {
    const gen = searchParams.get('gen')
    if (!gen || articleIds.length === 0 || isStreaming) return
    const key = `${gen}:${articleIdsKey}`
    if (autoGenConsumed.has(key)) return
    autoGenConsumed.add(key)

    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('gen')
        return n
      },
      { replace: true },
    )

    if (gen === 'introabs') {
      sendRef.current(INTRO_ABSTRACT_USER_PROMPT, { articleIds, mode: 'intro_abstract', detailLevel })
    } else if (gen === 'summarize') {
      sendRef.current(SUMMARIZE_USER_PROMPT, { articleIds, mode: 'summarize_set', detailLevel })
    } else if (gen === 'litreview') {
      sendRef.current(LIT_REVIEW_PROMPT, { articleIds, mode: 'lit_review_synthesis', detailLevel })
    } else if (gen === 'relatedwork') {
      sendRef.current(RELATED_WORK_COMPILE_PROMPT, {
        articleIds,
        mode: 'related_work_compile',
        detailLevel: effectiveDetailForRelatedWork(detailLevel),
      })
    }
  }, [articleIds, articleIdsKey, detailLevel, isStreaming, searchParams, setSearchParams])

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    sendMessage(input.trim(), { articleIds: articleIds.length ? articleIds : undefined, detailLevel })
    setInput('')
  }

  const runLitReview = () => {
    if (articleIds.length === 0 || isStreaming) return
    sendMessage(LIT_REVIEW_PROMPT, { articleIds, mode: 'lit_review_synthesis', detailLevel })
  }

  const runSummarize = () => {
    if (articleIds.length === 0 || isStreaming) return
    sendMessage(SUMMARIZE_USER_PROMPT, { articleIds, mode: 'summarize_set', detailLevel })
  }

  const runIntroAbstract = () => {
    if (articleIds.length === 0 || isStreaming) return
    sendMessage(INTRO_ABSTRACT_USER_PROMPT, { articleIds, mode: 'intro_abstract', detailLevel })
  }

  const runRelatedWorkCompile = () => {
    if (articleIds.length < 2 || articleIds.length > 50 || isStreaming) return
    sendMessage(RELATED_WORK_COMPILE_PROMPT, {
      articleIds,
      mode: 'related_work_compile',
      detailLevel: effectiveDetailForRelatedWork(detailLevel),
    })
  }

  const clearScope = () => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.delete('articles')
      next.delete('gen')
      return next
    })
  }

  const copyAssistantMarkdown = (index: number, text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedIndex(index)
      setTimeout(() => setCopiedIndex(null), 2000)
    })
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm px-6 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            AI Query
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm">
            {articleIds.length > 0 && (
              <>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <BookMarked className="w-3.5 h-3.5" />
                  {articleIds.length} paper{articleIds.length !== 1 ? 's' : ''} in scope
                </span>
                <button
                  type="button"
                  onClick={runSummarize}
                  disabled={isStreaming}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-slate-700 dark:bg-slate-600 text-white hover:bg-slate-800 dark:hover:bg-slate-500 disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Summarize
                </button>
                <button
                  type="button"
                  onClick={runIntroAbstract}
                  disabled={isStreaming}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Intro + abstract
                </button>
                <button
                  type="button"
                  onClick={runLitReview}
                  disabled={isStreaming}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <BookMarked className="w-3.5 h-3.5" />
                  Literature review
                </button>
                <button
                  type="button"
                  onClick={runRelatedWorkCompile}
                  disabled={isStreaming || articleIds.length < 2 || articleIds.length > 50}
                  title="Uses minimum detail level 2 (standard) for research-grade synthesis; raise the Detail slider for more depth."
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[12px] font-medium bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-50"
                >
                  <BookMarked className="w-3.5 h-3.5" />
                  Compile related works
                </button>
                <div className="inline-flex items-center gap-2 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Detail</span>
                  <input
                    type="range"
                    min={0}
                    max={3}
                    step={1}
                    value={detailLevel}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setDetailLevel(n >= 3 ? 3 : n >= 2 ? 2 : n === 1 ? 1 : 0)
                    }}
                    className="w-24"
                  />
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {detailLabel}
                  </span>
                </div>
                <button type="button" onClick={clearScope} className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                  Clear scope
                </button>
              </>
            )}
            <button
              onClick={clearChat}
              className="flex items-center gap-1 text-[12px] text-slate-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear chat
            </button>
          </div>
        </div>
        {scopeMeta.length > 0 && (
          <>
            <ul className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {scopeMeta.map((a) => (
                <li key={a.id} className="max-w-[min(100%,280px)]">
                  <Link
                    to={`/library/article/${encodeURIComponent(a.id)}`}
                    className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 truncate max-w-full text-blue-700 dark:text-blue-300 hover:underline hover:bg-slate-200/80 dark:hover:bg-slate-700/80"
                    title={a.title ?? a.id}
                  >
                    {a.title || a.pdf_path || a.id}
                  </Link>
                </li>
              ))}
            </ul>
            {(articleIds.length < 2 || articleIds.length > 50) && (
              <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">
                Compiled related works requires selecting between 2 and 50 articles.
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-gradient-to-b from-slate-50 to-slate-100/50 dark:from-slate-950 dark:to-slate-900/80">
        {chatHistory.length === 0 && (
          <div className="text-center mt-24 animate-fade-in-up">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-glow">
              <MessageSquare className="w-7 h-7 text-white" />
            </div>
            <p className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Ask about your library</p>
            <p className="text-[14px] mt-2 text-slate-400 dark:text-slate-500 max-w-md mx-auto">
              Select papers in the Library, then use Summarize, Intro + abstract, or Literature review — or ask your own question.
            </p>
          </div>
        )}
        {chatHistory.map((msg, i) => (
          <MessageBubble
            key={i}
            role={msg.role}
            content={msg.content}
            sources={msg.sources}
            messageIndex={i}
            citationArticles={msg.role === 'assistant' ? scopeMeta : undefined}
            onCopy={msg.role === 'assistant' && msg.content ? () => copyAssistantMarkdown(i, msg.content) : undefined}
            copied={copiedIndex === i}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm p-4">
        <div className="flex gap-3 max-w-4xl mx-auto">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask a research question… (Enter to send, Shift+Enter for new line)"
            rows={2}
            className="flex-1 resize-none bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl px-4 py-3 text-[14px] text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500"
          />
          <button
            onClick={isStreaming ? stop : handleSend}
            disabled={!isStreaming && !input.trim()}
            className={cn(
              'px-4 py-2 rounded-xl text-white font-medium text-sm transition-all duration-200 self-end shadow-sm',
              isStreaming
                ? 'bg-red-500 hover:bg-red-600'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:shadow-glow disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none',
            )}
          >
            {isStreaming ? <StopCircle className="w-5 h-5" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}

import ReactMarkdown, { defaultUrlTransform } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { Link } from 'react-router-dom'

/** react-markdown strips unknown URL schemes; `cite:` is required for library superscript links. */
function citationUrlTransform(url: string): string {
  const t = url.trim()
  if (t.toLowerCase().startsWith('cite:')) return t
  return defaultUrlTransform(url)
}

const proseClasses = 'prose prose-sm max-w-none text-slate-700 dark:text-slate-200'

export type CitationArticleRef = { id: string; title: string | null; pdf_path: string | null }

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Turn `**Exact title**` into `[**Exact title**](cite:id)` for in-scope articles (longest titles first). */
function linkifyBoldArticleTitles(content: string, articles: CitationArticleRef[]): string {
  if (!articles.length) return content
  const sorted = [...articles]
    .filter((a) => a.title?.trim())
    .sort((a, b) => (b.title!.length) - (a.title!.length))
  let out = content
  for (const a of sorted) {
    const t = a.title!.trim()
    const boldRe = new RegExp(`\\*\\*${escapeRegExp(t)}\\*\\*`, 'g')
    out = out.replace(boldRe, `[**${t}**](cite:${a.id})`)
  }
  return out
}

function buildComponents(citationRefPrefix: string | undefined): Components {
  return {
    h1: ({ children }) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0">{children}</h1>,
    h2: ({ children }) => <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>,
    h3: ({ children }) => <h3 className="text-sm font-bold mt-2.5 mb-1">{children}</h3>,
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>,
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    code: ({ className, children, ...props }) => {
      const isBlock = className?.includes('language-')
      if (isBlock) {
        return (
          <pre className="bg-slate-900 text-slate-100 text-xs p-4 rounded-lg overflow-x-auto my-2">
            <code {...props}>{children}</code>
          </pre>
        )
      }
      return (
        <code className="bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-1.5 py-0.5 rounded text-[0.9em] font-mono" {...props}>
          {children}
        </code>
      )
    },
    pre: ({ children }) => <>{children}</>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-slate-300 dark:border-slate-600 pl-3 my-2 text-slate-600 dark:text-slate-400 italic">
        {children}
      </blockquote>
    ),
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    a: ({ href, children }) => {
      if (href?.toLowerCase().startsWith('cite:')) {
        const docId = href.slice('cite:'.length).trim()
        return (
          <sup className="ml-0.5 align-super whitespace-nowrap">
            <Link
              to={`/library/article/${encodeURIComponent(docId)}`}
              className="inline-flex items-center justify-center min-w-[1rem] rounded px-0.5 text-[10px] font-bold leading-none no-underline bg-blue-600/15 text-blue-700 hover:bg-blue-600/25 hover:underline border border-blue-500/25"
              title={docId ? `Open source article — ${docId}` : 'Source'}
            >
              [{children}]
            </Link>
          </sup>
        )
      }
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
          {children}
        </a>
      )
    },
  }
}

interface Props {
  content: string
  className?: string
  components?: Components
  /** Unique per chat message so reference anchors don’t collide (e.g. `m0`, `m1`). */
  citationRefPrefix?: string
  /** Library articles in scope — renders a reference list with anchor targets (optional). */
  citationArticles?: CitationArticleRef[]
}

export default function MarkdownContent({
  content,
  className = '',
  components,
  citationRefPrefix,
  citationArticles,
}: Props) {
  const merged = components ?? buildComponents(citationRefPrefix)
  const md =
    citationArticles && citationArticles.length > 0 && citationRefPrefix
      ? linkifyBoldArticleTitles(content, citationArticles)
      : content

  return (
    <div className={`${proseClasses} ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={merged}
        urlTransform={citationUrlTransform}
      >
        {md}
      </ReactMarkdown>
      {citationArticles && citationArticles.length > 0 && citationRefPrefix && (
        <div className="not-prose mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
          <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            References · library scope
          </p>
          <ol className="list-decimal pl-5 space-y-2 text-[12px] text-slate-600 dark:text-slate-300">
            {citationArticles.map((a) => (
              <li
                key={a.id}
                id={`${citationRefPrefix}-ref-${a.id}`}
                className="scroll-mt-20 marker:font-medium"
              >
                <Link
                  to={`/library/article/${a.id}`}
                  className="font-medium text-blue-600 hover:underline"
                >
                  {a.title || a.pdf_path || 'Untitled'}
                </Link>
                <span className="block text-[10px] text-slate-400 font-mono mt-0.5">id {a.id}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  )
}

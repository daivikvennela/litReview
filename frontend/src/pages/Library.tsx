import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, ChevronRight, Download, MessageSquare, Sparkles, FileText, BookMarked } from 'lucide-react'
import { useArticles } from '@/hooks/useArticles'
import { downloadArticlesExport, getArticleFolders, type Article } from '@/lib/api'

const VENUE_TYPES = ['all', 'journal', 'conference', 'book', 'report', 'preprint', 'unknown'] as const

type ListSort = 'parsed_at' | 'title' | 'folder'

/** Consecutive rows with the same folder (list must already be sorted by folder when used). */
function groupByFolderRun(articles: Article[]): { folder: string; items: Article[] }[] {
  const out: { folder: string; items: Article[] }[] = []
  for (const a of articles) {
    const f = (a.folder ?? '').trim()
    const last = out[out.length - 1]
    if (!last || last.folder !== f) {
      out.push({ folder: f, items: [a] })
    } else {
      last.items.push(a)
    }
  }
  return out
}

function queryWithGen(ids: string[], gen: string) {
  const q = new URLSearchParams()
  q.set('articles', ids.join(','))
  q.set('gen', gen)
  return `/query?${q.toString()}`
}

export default function Library() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [yearMin, setYearMin] = useState('')
  const [yearMax, setYearMax] = useState('')
  const [venueType, setVenueType] = useState<string>('all')
  const [folderFilter, setFolderFilter] = useState<string>('')
  const [listSort, setListSort] = useState<ListSort>('parsed_at')
  const [folderOptions, setFolderOptions] = useState<string[]>([])
  const [exporting, setExporting] = useState(false)
  const [chatPick, setChatPick] = useState<Set<string>>(() => new Set())

  const yearMinNum = yearMin.trim() === '' ? undefined : Number(yearMin)
  const yearMaxNum = yearMax.trim() === '' ? undefined : Number(yearMax)
  const sortOrder = listSort === 'parsed_at' ? 'desc' : 'asc'

  const { articles, loading, error, refetch } = useArticles({
    search: search || undefined,
    sort: listSort,
    order: sortOrder,
    year_min: Number.isFinite(yearMinNum) ? yearMinNum : undefined,
    year_max: Number.isFinite(yearMaxNum) ? yearMaxNum : undefined,
    venue_type: venueType === 'all' ? undefined : venueType,
    folder: folderFilter || undefined,
    include_xml: false,
  })

  useEffect(() => {
    getArticleFolders()
      .then(setFolderOptions)
      .catch(() => {})
  }, [articles.length])

  const selectedIds = [...chatPick]
  const allVisibleSelected = articles.length > 0 && articles.every((a) => chatPick.has(a.id))

  const renderArticleRow = (a: Article) => (
    <tr
      key={a.id}
      onClick={() => navigate(`/library/article/${a.id}`)}
      className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer transition-colors group"
    >
      <td className="pl-4 pr-1 py-3.5 w-10 align-top" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={chatPick.has(a.id)}
          onChange={() => {
            setChatPick((prev) => {
              const next = new Set(prev)
              if (next.has(a.id)) next.delete(a.id)
              else next.add(a.id)
              return next
            })
          }}
          className="rounded border-slate-300 dark:border-slate-600 text-blue-600 mt-1"
          aria-label={`Select ${a.title || a.pdf_path || a.id}`}
        />
      </td>
      <td className="px-6 py-3.5 max-w-md">
        <p className="text-[13px] font-medium text-slate-800 dark:text-slate-100 line-clamp-1">{a.title || a.pdf_path || a.id}</p>
        {a.abstract && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">{a.abstract}</p>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => navigate(`/query?articles=${encodeURIComponent(a.id)}`)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline px-2 py-1 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/40"
          >
            <MessageSquare className="w-3 h-3" />
            Chat
          </button>
          <button
            type="button"
            onClick={() => navigate(queryWithGen([a.id], 'summarize'))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <FileText className="w-3 h-3" />
            Summarize
          </button>
          <button
            type="button"
            onClick={() => navigate(queryWithGen([a.id], 'litreview'))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
          >
            <BookMarked className="w-3 h-3" />
            Lit review
          </button>
          <button
            type="button"
            onClick={() => navigate(queryWithGen([a.id], 'introabs'))}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600 dark:text-violet-400 px-2 py-1 rounded-lg hover:bg-violet-50 dark:hover:bg-violet-950/40"
          >
            <Sparkles className="w-3 h-3" />
            Intro + abstract
          </button>
        </div>
      </td>
      <td className="px-3 py-3.5 text-[12px] text-slate-600 dark:text-slate-300 tabular-nums">{a.year ?? '—'}</td>
      <td className="px-3 py-3.5 text-[11px] text-slate-600 dark:text-slate-300">
        <span className="block font-medium capitalize">{a.venue_type || '—'}</span>
        {a.venue_name && <span className="line-clamp-2 text-slate-400 dark:text-slate-500">{a.venue_name}</span>}
      </td>
      <td className="px-3 py-3.5 text-[11px] text-slate-600 dark:text-slate-300 max-w-[200px]">
        <span className="line-clamp-2 break-all" title={a.folder?.trim() || undefined}>
          {a.folder?.trim() ? a.folder : '—'}
        </span>
      </td>
      <td className="px-4 py-3.5 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {a.parsed_at ? new Date(a.parsed_at).toLocaleDateString() : '—'}
      </td>
      <td className="px-4 py-3.5">
        <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
      </td>
    </tr>
  )

  const handleExport = (ids?: string[]) => {
    setExporting(true)
    downloadArticlesExport(ids && ids.length > 0 ? ids : undefined)
      .catch(() => {})
      .finally(() => setExporting(false))
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="border-b border-slate-200/60 dark:border-slate-800 bg-white/80 dark:bg-slate-900/90 backdrop-blur-sm px-6 py-3 sticky top-0 z-10">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search articles…"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 transition-all"
              />
            </div>
            <input
              type="number"
              value={yearMin}
              onChange={(e) => setYearMin(e.target.value)}
              placeholder="Year min"
              className="w-24 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] text-slate-800 dark:text-slate-100"
            />
            <input
              type="number"
              value={yearMax}
              onChange={(e) => setYearMax(e.target.value)}
              placeholder="Year max"
              className="w-24 px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] text-slate-800 dark:text-slate-100"
            />
            <select
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className="px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] min-w-[130px] text-slate-800 dark:text-slate-100"
            >
              {VENUE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {v === 'all' ? 'All venues' : v}
                </option>
              ))}
            </select>
            <select
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] min-w-[160px] max-w-[220px] text-slate-800 dark:text-slate-100"
              title="Filter by upload folder"
            >
              <option value="">All folders</option>
              <option value="__root__">Root (no subfolder)</option>
              {folderOptions.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <select
              value={listSort}
              onChange={(e) => setListSort(e.target.value as ListSort)}
              className="px-2 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700 rounded-xl text-[13px] min-w-[130px] text-slate-800 dark:text-slate-100"
            >
              <option value="parsed_at">Sort: date parsed</option>
              <option value="title">Sort: title</option>
              <option value="folder">Sort: folder</option>
            </select>
            <button
              type="button"
              onClick={() => handleExport()}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Export…' : 'Export Excel'}
            </button>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => handleExport(selectedIds)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium bg-emerald-700/90 text-white hover:bg-emerald-800"
              >
                <Download className="w-3.5 h-3.5" />
                Export selected ({selectedIds.length})
              </button>
            )}
            <span className="text-[12px] text-slate-400 dark:text-slate-500 ml-auto">
              {articles.length} article{articles.length !== 1 ? 's' : ''}
            </span>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/query?articles=${encodeURIComponent(selectedIds.join(','))}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-blue-600 text-white hover:bg-blue-700"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Chat ({selectedIds.length})
              </button>
              <button
                type="button"
                onClick={() => navigate(queryWithGen(selectedIds, 'summarize'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-slate-700 dark:bg-slate-600 text-white hover:bg-slate-800 dark:hover:bg-slate-500"
              >
                <FileText className="w-3.5 h-3.5" />
                Summarize
              </button>
              <button
                type="button"
                onClick={() => navigate(queryWithGen(selectedIds, 'litreview'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <BookMarked className="w-3.5 h-3.5" />
                Literature review
              </button>
              <button
                type="button"
                onClick={() => navigate(queryWithGen(selectedIds, 'relatedwork'))}
                disabled={selectedIds.length < 2 || selectedIds.length > 50}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-fuchsia-600 text-white hover:bg-fuchsia-700 disabled:opacity-50"
                title="Requires 2-50 selected papers"
              >
                <BookMarked className="w-3.5 h-3.5" />
                Compile related works
              </button>
              <button
                type="button"
                onClick={() => navigate(queryWithGen(selectedIds, 'introabs'))}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-medium bg-violet-600 text-white hover:bg-violet-700"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Intro + abstract
              </button>
              <button
                type="button"
                onClick={() => setChatPick(new Set())}
                className="text-[12px] text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 px-2"
              >
                Clear selection
              </button>
              {(selectedIds.length < 2 || selectedIds.length > 50) && (
                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                  Compile related works requires 2-50 selected papers.
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900 text-red-800 dark:text-red-200 text-sm flex items-center justify-between gap-3">
            <span>{error}</span>
            <button onClick={() => refetch()} className="px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/40 hover:bg-red-200 text-red-700 dark:text-red-200 font-medium text-xs">
              Retry
            </button>
          </div>
        )}
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !error && articles.length === 0 ? (
          <div className="text-center py-24 text-slate-400 dark:text-slate-500">
            <p className="text-lg font-semibold">No articles found</p>
            <p className="text-sm mt-1">Upload PDFs from the Upload page to get started.</p>
          </div>
        ) : !error ? (
          <>
            <div className="px-6 py-2.5 border-b border-slate-200/60 dark:border-slate-800 flex flex-wrap items-center gap-2 bg-slate-50/50 dark:bg-slate-900/40">
              <button
                type="button"
                disabled={articles.length === 0}
                onClick={() => {
                  if (allVisibleSelected) setChatPick(new Set())
                  else setChatPick(new Set(articles.map((a) => a.id)))
                }}
                className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40"
              >
                {allVisibleSelected ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {articles.length} shown
                {listSort === 'folder' ? ' · grouped by folder' : ''}
              </span>
            </div>
            <table className="w-full">
              <thead className="bg-slate-50 dark:bg-slate-900 text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-200/60 dark:border-slate-800">
                <tr>
                  <th className="pl-4 pr-1 py-3 w-10 text-left font-semibold" title="Select for batch actions">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-6 py-3 text-left font-semibold">Title</th>
                  <th className="px-3 py-3 text-left font-semibold w-20">Year</th>
                  <th className="px-3 py-3 text-left font-semibold w-28">Venue</th>
                  <th className="px-3 py-3 text-left font-semibold max-w-[200px]">Folder</th>
                  <th className="px-4 py-3 text-left font-semibold">Parsed</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {listSort === 'folder'
                  ? groupByFolderRun(articles).map((g) => (
                      <Fragment key={g.folder || '__root__'}>
                        <tr className="bg-slate-100/90 dark:bg-slate-800/60">
                          <td
                            colSpan={7}
                            className="px-6 py-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 border-b border-slate-200/60 dark:border-slate-700"
                          >
                            {g.folder ? g.folder : 'Root (no subfolder)'}
                          </td>
                        </tr>
                        {g.items.map((a) => renderArticleRow(a))}
                      </Fragment>
                    ))
                  : articles.map((a) => renderArticleRow(a))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Users, Search } from 'lucide-react'

interface Props {
  authors: string[]
  /** Tightly-packed variant used in side drawers; defaults to false. */
  compact?: boolean
  className?: string
}

/**
 * Collapsible dropdown for long author lists.
 *
 * - Button shows `N authors` with a short summary (first 3 names + "+ more").
 * - Clicking opens a scrollable panel with a search box and chip-style names.
 * - Click-outside / Esc closes the dropdown.
 */
export default function AuthorsDropdown({ authors, compact = false, className = '' }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (authors.length === 0) return null

  const filtered = query.trim()
    ? authors.filter((a) => a.toLowerCase().includes(query.trim().toLowerCase()))
    : authors

  const preview = authors.slice(0, 3).join(', ')
  const extra = Math.max(0, authors.length - 3)
  const label = extra > 0 ? `${preview} +${extra} more` : preview

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`group inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
          compact ? 'px-2.5 py-1 text-[12px]' : 'px-3 py-1.5 text-[13px]'
        }`}
      >
        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
        <span className="font-medium shrink-0">
          {authors.length} {authors.length === 1 ? 'author' : 'authors'}
        </span>
        <span className="text-slate-400 dark:text-slate-500 truncate max-w-[40ch]" title={authors.join(', ')}>
          {label}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-30 mt-1.5 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
        >
          {authors.length > 8 && (
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800">
                <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter authors…"
                  className="flex-1 bg-transparent text-[12px] text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
          )}
          <ul className="max-h-64 overflow-y-auto py-1.5 px-1.5">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[12px] text-slate-400">No matching authors</li>
            ) : (
              filtered.map((name, i) => (
                <li
                  key={`${name}-${i}`}
                  className="px-2.5 py-1 text-[12.5px] text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={name}
                >
                  <span className="text-slate-400 tabular-nums pr-2">{i + 1}.</span>
                  {name}
                </li>
              ))
            )}
          </ul>
          {authors.length > 10 && (
            <div className="px-3 py-1.5 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 text-right">
              Showing {filtered.length} of {authors.length}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

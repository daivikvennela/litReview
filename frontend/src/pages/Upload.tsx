import { useEffect, useRef, useState } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react'
import { parseArticleBatch } from '@/lib/api'
import { useArticles } from '@/hooks/useArticles'
import {
  gatherPdfFilesFromDataTransfer,
  isPdfLike,
  multipartFilenameForPdf,
} from '@/lib/pdfUploadHelpers'

type FileStatus = 'pending' | 'parsing' | 'done' | 'error'

interface FileItem {
  file: File
  /** Matches server `filename` / multipart path (nested folders when present). */
  key: string
  status: FileStatus
  error?: string
  cached?: boolean
}

const BATCH_PARSE_MAX = 200

export default function Upload() {
  const [files, setFiles] = useState<FileItem[]>([])
  const [dragging, setDragging] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const [batchNotice, setBatchNotice] = useState<string | null>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { refetch } = useArticles()

  useEffect(() => {
    const el = folderInputRef.current
    if (!el) return
    el.setAttribute('webkitdirectory', '')
    el.setAttribute('directory', '')
  }, [])

  const addPdfFiles = (incoming: File[]) => {
    const pdfs = incoming.filter((f) => isPdfLike(f))
    if (pdfs.length === 0) return
    setFiles((prev) => {
      const keys = new Set(prev.map((p) => p.key))
      const next: FileItem[] = [...prev]
      for (const file of pdfs) {
        const key = multipartFilenameForPdf(file)
        if (keys.has(key)) continue
        keys.add(key)
        next.push({ file, key, status: 'pending' })
      }
      return next
    })
  }

  const addFilesFromInput = (list: FileList | null) => {
    if (!list?.length) return
    addPdfFiles(Array.from(list))
  }

  const setFileStatusByKey = (key: string, status: FileStatus, error?: string, cached?: boolean) => {
    setFiles((prev) =>
      prev.map((item) =>
        item.key === key ? { ...item, status, error, cached: cached ?? item.cached } : item,
      ),
    )
  }

  const parseAll = async () => {
    const pending = files.filter((f) => f.status === 'pending')
    if (pending.length === 0) return
    const capped = pending.slice(0, BATCH_PARSE_MAX)
    setBatchNotice(
      pending.length > capped.length
        ? `This run parses the first ${BATCH_PARSE_MAX} pending PDFs. Parse again for the rest (or remove completed rows first).`
        : null,
    )
    setParsing(true)
    setBatchProgress({ current: 0, total: capped.length })
    try {
      await parseArticleBatch(
        capped.map((f) => f.file),
        (ev) => {
          if (ev.event === 'start') {
            setBatchProgress({ current: 0, total: ev.total ?? capped.length })
          }
          if (ev.event === 'progress' && ev.filename != null) {
            setFileStatusByKey(
              ev.filename,
              ev.status === 'done' ? 'done' : ev.status === 'error' ? 'error' : 'parsing',
              ev.error,
              Boolean(ev.cached),
            )
            if (typeof ev.current === 'number' && typeof ev.total === 'number') {
              setBatchProgress({ current: ev.current, total: ev.total })
            }
          }
          if (ev.event === 'done') {
            setBatchProgress((p) => ({ current: p.total || capped.length, total: p.total || capped.length }))
          }
        },
      )
      refetch()
    } finally {
      setParsing(false)
    }
  }

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const hasPending = files.some((f) => f.status === 'pending')
  const progressPct = batchProgress.total > 0 ? Math.min(100, Math.round((batchProgress.current / batchProgress.total) * 100)) : 0

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
          <UploadIcon className="w-6 h-6 text-violet-500" />
          Upload PDFs
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          Drop PDFs or entire folders (nested folders supported in Chromium-based browsers). Files are parsed with GROBID
          and added to your library. Paths under a chosen folder are preserved in the library filename.
        </p>
        <p className="text-slate-400 text-xs mt-2">
          Up to {BATCH_PARSE_MAX} PDFs per &quot;Parse all&quot; run.
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={async (e) => {
          e.preventDefault()
          setDragging(false)
          const gathered = await gatherPdfFilesFromDataTransfer(e.dataTransfer)
          addPdfFiles(gathered)
        }}
        className={`
          border-2 border-dashed rounded-2xl p-12 text-center transition-colors
          ${dragging ? 'border-violet-500 bg-violet-50/50' : 'border-slate-200 bg-slate-50/50'}
        `}
      >
        <input
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          id="pdf-input"
          onChange={(e) => {
            addFilesFromInput(e.target.files)
            e.target.value = ''
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          className="hidden"
          id="pdf-folder-input"
          onChange={(e) => {
            addFilesFromInput(e.target.files)
            e.target.value = ''
          }}
        />
        <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3" />
        <p className="text-slate-600 font-medium">Drop PDFs or folders here</p>
        <p className="text-slate-400 text-sm mt-1">GROBID must be running (see Settings)</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <label
            htmlFor="pdf-input"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium hover:bg-violet-700"
          >
            Choose PDF files
          </label>
          <label
            htmlFor="pdf-folder-input"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <FolderOpen className="w-4 h-4" />
            Choose folder
          </label>
        </div>
      </div>

      {batchNotice && (
        <p className="mt-3 text-[12px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          {batchNotice}
        </p>
      )}

      {files.length > 0 && (
        <div className="mt-6 bg-white rounded-2xl border border-slate-100 shadow-card overflow-hidden dark:bg-slate-900 dark:border-slate-800">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between dark:border-slate-800">
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">{files.length} PDF(s)</span>
            <button
              onClick={parseAll}
              disabled={!hasPending || parsing}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white text-[13px] font-medium rounded-xl hover:bg-violet-700 disabled:opacity-50 disabled:pointer-events-none"
            >
              {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Parse all
            </button>
          </div>
          {(parsing || batchProgress.total > 0) && (
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[12px] font-medium text-slate-600 dark:text-slate-300">Parsing progress</span>
                <span className="text-[12px] text-slate-500 tabular-nums">
                  {batchProgress.current}/{batchProgress.total} ({progressPct}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden dark:bg-slate-700">
                <div
                  className="h-full bg-violet-600 transition-all duration-300 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
          <ul className="divide-y divide-slate-100 max-h-80 overflow-y-auto dark:divide-slate-800">
            {files.map((item, i) => (
              <li key={item.key} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-5 h-5 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 truncate dark:text-slate-100" title={item.key}>
                    {item.key}
                  </p>
                  {item.error && <p className="text-[12px] text-red-600 mt-0.5 dark:text-red-400">{item.error}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.status === 'pending' && <span className="text-[11px] text-slate-400">Pending</span>}
                  {item.status === 'parsing' && <Loader2 className="w-4 h-4 animate-spin text-violet-500" />}
                  {item.status === 'done' && (
                    <>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                      {item.cached && (
                        <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900">
                          Cached
                        </span>
                      )}
                    </>
                  )}
                  {item.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="text-slate-400 hover:text-slate-600 text-[12px] dark:hover:text-slate-300"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {files.some((f) => f.status === 'done') && (
        <p className="mt-4 text-[13px] text-emerald-600 dark:text-emerald-400">
          Parsed articles are in the Library. Open any to run metadata extraction or summaries.
        </p>
      )}
    </div>
  )
}

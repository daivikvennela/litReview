import { useEffect, useRef, useState } from 'react'
import { Upload as UploadIcon, FileText, CheckCircle2, AlertCircle, Loader2, FolderOpen } from 'lucide-react'
import { parseArticleBatch, getSettings, type ParserEngine } from '@/lib/api'
import { useArticles } from '@/hooks/useArticles'
import {
  gatherPdfFilesFromDataTransfer,
  isPdfLike,
  multipartFilenameForPdf,
} from '@/lib/pdfUploadHelpers'

const PARSER_ENGINE_ORDER: ParserEngine[] = [
  'opendataloader',
  'grobid',
  'openrouter_vlm',
  'ollama_vlm',
  'dots_ocr',
  'chandra_ocr2',
]

const PARSER_ENGINE_LABELS: Record<ParserEngine, string> = {
  opendataloader: 'OpenDataLoader (default)',
  grobid: 'GROBID (TEI XML)',
  openrouter_vlm: 'OpenRouter Vision LM',
  ollama_vlm: 'Local Ollama Vision LM',
  dots_ocr: 'Dots OCR',
  chandra_ocr2: 'Chandra OCR 2',
}

const PARSER_ENGINE_HINTS: Record<ParserEngine, string> = {
  opendataloader:
    'Structured JSON + Markdown locally (Java 11+). Hybrid/OCR in Settings. Best for RAG-quality text.',
  grobid: 'Deterministic structured parse to TEI XML. Requires GROBID running.',
  openrouter_vlm: 'Sends rasterized PDF pages to a hosted vision LM. Requires OpenRouter API key + pdftoppm (Poppler).',
  ollama_vlm: 'Sends rasterized PDF pages to a local Ollama VLM (e.g. qwen2.5vl:7b). Requires Ollama + pdftoppm (Poppler).',
  dots_ocr:
    'Multilingual layout OCR via local sidecar (vLLM + dots.ocr). Best for scanned PDFs and complex layouts.',
  chandra_ocr2:
    '90+ language OCR via local sidecar (vLLM + chandra-ocr-2). Strong on tables, math, handwriting.',
}

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
  const [engine, setEngine] = useState<ParserEngine>('opendataloader')
  const [modelOverride, setModelOverride] = useState<string>('')
  const folderInputRef = useRef<HTMLInputElement>(null)
  const { refetch } = useArticles()

  useEffect(() => {
    const el = folderInputRef.current
    if (!el) return
    el.setAttribute('webkitdirectory', '')
    el.setAttribute('directory', '')
  }, [])

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        if (s.pdf_parser_default_engine) setEngine(s.pdf_parser_default_engine)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
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
        {
          engine,
          model: modelOverride.trim() || undefined,
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
          Drop PDFs or entire folders (nested folders supported in Chromium-based browsers). Files are parsed with the
          engine selected below and added to your library. Paths under a chosen folder are preserved in the library
          filename.
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
          relative overflow-hidden rounded-3xl border p-12 text-center transition-all duration-300
          ${dragging
            ? 'border-violet-300/60 shadow-[0_0_0_4px_rgba(139,92,246,0.15)] -translate-y-0.5'
            : 'border-white/10 hover:border-white/20'}
        `}
        style={{
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e1b4b 35%, #312e81 60%, #1e293b 100%)',
        }}
      >
        {/* Ambient glow accents — match landing page */}
        <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-fuchsia-500/25 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-cyan-500/20 blur-[80px]" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-[70px]" />

        <div className="relative">
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm mb-4 shadow-lg shadow-black/20">
            <FileText className="w-7 h-7 text-cyan-200" />
          </div>
          <p className="text-white text-lg font-semibold tracking-tight">Drop PDFs or folders here</p>
          <p className="text-slate-300/90 text-sm mt-1.5 max-w-md mx-auto leading-relaxed">
            Default: OpenDataLoader (Java 11+). GROBID optional for TEI — see Settings.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <label
              htmlFor="pdf-input"
              className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-slate-900 text-sm font-semibold shadow-lg shadow-black/20 hover:bg-slate-100 transition-transform hover:-translate-y-0.5"
            >
              Choose PDF files
            </label>
            <label
              htmlFor="pdf-folder-input"
              className="cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl border border-white/20 bg-white/5 text-white text-sm font-semibold backdrop-blur-sm hover:bg-white/10 transition-colors"
            >
              <FolderOpen className="w-4 h-4" />
              Choose folder
            </label>
          </div>
        </div>
      </div>

      <div className="mt-5 bg-white rounded-2xl border border-slate-100 shadow-card p-4 dark:bg-slate-900 dark:border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200">
            Parser engine
          </span>
          <a
            href="/settings"
            className="text-[12px] text-violet-600 hover:underline dark:text-violet-400"
          >
            Configure defaults
          </a>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {PARSER_ENGINE_ORDER.map((key) => {
            const isActive = engine === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setEngine(key)}
                className={`text-left rounded-xl border px-3 py-2 transition-colors ${
                  isActive
                    ? 'border-violet-500 bg-violet-50/70 dark:bg-violet-950/30 dark:border-violet-400'
                    : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/60 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="text-[13px] font-medium text-slate-800 dark:text-slate-100">
                  {PARSER_ENGINE_LABELS[key]}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 leading-snug dark:text-slate-400">
                  {PARSER_ENGINE_HINTS[key]}
                </div>
              </button>
            )
          })}
        </div>
        {engine !== 'grobid' && engine !== 'opendataloader' && (
          <div className="mt-3">
            <label className="text-[12px] text-slate-500 block mb-1 dark:text-slate-400">
              Model override (optional)
            </label>
            <input
              type="text"
              value={modelOverride}
              onChange={(e) => setModelOverride(e.target.value)}
              placeholder={
                engine === 'openrouter_vlm'
                  ? 'e.g. qwen/qwen2.5-vl-72b-instruct:free'
                  : 'e.g. qwen2.5vl:7b'
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <p className="text-[11px] text-slate-400 mt-1 dark:text-slate-500">
              Leave blank to use the default configured in Settings.
            </p>
          </div>
        )}
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

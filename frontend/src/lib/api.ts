import axios from 'axios'
import { multipartFilenameForPdf } from '@/lib/pdfUploadHelpers'

export const api = axios.create({ baseURL: '/api' })

// ----- Article types (new backend) -----
export interface Article {
  id: string
  title: string | null
  authors: string | null
  abstract: string | null
  pdf_path: string | null
  xml: string | null
  parsed_at: string | null
  model_used: string | null
  year?: number | null
  venue_type?: string | null
  venue_name?: string | null
  links_json?: string | null
  /** Relative folder from nested upload paths (e.g. `project/papers`). */
  folder?: string | null
  /** Parser engine used when the article was (most recently) parsed. */
  parser_engine?: string | null
  /** Present when listing with `include_reviews` — cached LLM outputs */
  llm_intro?: string | null
  llm_summary?: string | null
  llm_literature_review?: string | null
}

export interface ArticleParseOutput {
  parser_engine: string
  parser_model: string
  output_format: string
  normalized_text: string | null
  payload_json: string | null
  created_at: string
}

export interface ArticleWithReviews extends Article {
  reviews?: Review[]
  parse_output?: ArticleParseOutput | null
}

export interface Review {
  id: number
  article_id: string
  task: number
  model: string
  review_depth: string
  result: string
  created_at: string
}

export type ParserEngine =
  | 'opendataloader'
  | 'grobid'
  | 'openrouter_vlm'
  | 'ollama_vlm'
  | 'dots_ocr'
  | 'chandra_ocr2'

export interface Settings {
  openrouter_api_key?: string
  grobid_url?: string
  grobid_mode?: 'docker' | 'external'
  default_model?: string
  default_model_task1?: string
  default_model_task2?: string
  default_model_task3?: string
  pdf_parser_default_engine?: ParserEngine
  pdf_parser_openrouter_model?: string
  ollama_url?: string
  pdf_parser_ollama_model?: string
  opendataloader_hybrid_enabled?: string
  opendataloader_hybrid_url?: string
  opendataloader_force_ocr?: string
  opendataloader_ocr_lang?: string
  opendataloader_enrich_formula?: string
  opendataloader_enrich_picture_description?: string
  opendataloader_use_struct_tree?: string
  dots_ocr_url?: string
  chandra_ocr2_url?: string
  ocr_sidecar_timeout_ms?: string
}

// ----- Legacy types (for gradual migration) -----
export interface PaperSummary {
  paper_id: string
  title: string
  year?: number
  venue?: string
  venue_type?: string
  brief: string
  methods: string
  best_metric_name?: string
  best_metric_value?: number
  category: string
  subcategory: string
  has_code: boolean
  dataset_count: number
  corresponding_author_name?: string
  has_abstract: boolean
}

export interface StructuredAbstract {
  objective: string
  methods: string
  results: string
  conclusion: string
  generated_by: 'extracted' | 'claude'
  generated_at?: string
}

export interface StatsResponse {
  total_papers: number
  total_chunks: number
  by_category: Record<string, number>
  papers_with_code_count: number
  papers_with_abstract_count: number
  unique_datasets_count: number
  top_datasets: Array<{ name: string; count: number }>
  venue_type_breakdown: Record<string, number>
  year_distribution: Record<string, number>
}

// ----- Articles -----
export const getArticles = (params?: {
  search?: string
  sort?: string
  order?: string
  year_min?: number
  year_max?: number
  venue_type?: string
  /** Filter by folder path, or `__root__` for PDFs not under a subfolder. */
  folder?: string
  /** Omit TEI XML for lighter list responses (Metadata page, etc.). Default true. */
  include_xml?: boolean
  /** Attach cached LLM fields (intro, section summary, literature review). */
  include_reviews?: boolean
}) => api.get<Article[]>('/articles', { params }).then((r) => r.data)

export const getArticleFolders = () =>
  api.get<string[]>('/articles/folders').then((r) => r.data)

export type ArticleMeta = Pick<
  Article,
  'id' | 'title' | 'pdf_path' | 'abstract' | 'year' | 'venue_type' | 'venue_name'
>

export const getArticlesMeta = (ids: string[]) => {
  if (ids.length === 0) return Promise.resolve([] as ArticleMeta[])
  return api
    .get<ArticleMeta[]>('/articles/meta', { params: { ids: ids.join(',') } })
    .then((r) => r.data)
}

/** Trigger download of library-export.xlsx (all articles, or selected ids). */
export type DatabaseInfo = {
  displayPath: string
  resolvedPath: string
  litreviewDir: string
  articleCount: number
  reviewRowCount: number
  exportStats?: {
    lastAt: string | null
    lastScope: string | null
    lastRows: number
    lastLinkRows: number
    totalCount: number
  }
  storedFields: string[]
}

function isDatabaseInfo(d: unknown): d is DatabaseInfo {
  if (!d || typeof d !== 'object') return false
  const o = d as Record<string, unknown>
  return (
    typeof o.displayPath === 'string' &&
    typeof o.resolvedPath === 'string' &&
    typeof o.litreviewDir === 'string' &&
    typeof o.articleCount === 'number' &&
    typeof o.reviewRowCount === 'number' &&
    Array.isArray(o.storedFields) &&
    o.storedFields.every((x) => typeof x === 'string')
  )
}

export type CheckStatus = 'ok' | 'warn' | 'fail'
export type CheckCategory = 'core' | 'parsing' | 'optional'

export interface SystemCheckItem {
  id: string
  label: string
  category: CheckCategory
  status: CheckStatus
  detail: string
  hint?: string
}

export interface SystemCheckResult {
  ranAt: string
  durationMs: number
  summary: { ok: number; warn: number; fail: number; total: number }
  checks: SystemCheckItem[]
}

export const runSystemCheck = () =>
  api.get<SystemCheckResult>('/meta/system-check').then((r) => r.data)

export const getDatabaseInfo = () =>
  api.get<DatabaseInfo>('/meta/database').then((r) => {
    const d = r.data as unknown
    if (!isDatabaseInfo(d)) {
      throw new Error(
        'Unexpected response from the metadata API (got HTML or an old server). Restart the backend so /api/meta/database is available.',
      )
    }
    return d
  })

export async function downloadArticlesExport(ids?: string[]): Promise<void> {
  const q = ids?.length ? `?ids=${encodeURIComponent(ids.join(','))}` : ''
  const res = await fetch(`/api/articles/export${q}`)
  if (!res.ok) throw new Error(res.statusText)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'library-export.xlsx'
  a.click()
  URL.revokeObjectURL(url)
}

export const getArticle = (id: string) =>
  api.get<ArticleWithReviews>(`/articles/${id}`).then((r) => r.data)

export const getArticleXml = (id: string) =>
  api.get<string>(`/articles/${id}/xml`, { responseType: 'text' }).then((r) => r.data)

export const deleteArticle = (id: string) =>
  api.delete(`/articles/${id}`)

export const deleteAllArticles = () =>
  api.delete<{ removed: number }>('/articles/all').then((r) => r.data)

// ----- Parse (PDF -> XML/markdown, stored as article) -----
export interface ParseOptions {
  engine?: ParserEngine
  model?: string
}

export const parseArticle = (file: File, opts: ParseOptions = {}) => {
  const form = new FormData()
  form.append('pdf', file)
  if (opts.engine) form.append('parser_engine', opts.engine)
  if (opts.model) form.append('parser_model', opts.model)
  return api.post<string>('/parse', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    responseType: 'text',
  }).then((r) => r.data)
}

export type BatchProgressEvent = {
  event: string
  total?: number
  current?: number
  filename?: string
  status?: string
  error?: string
  cached?: boolean
  engine?: ParserEngine
  format?: string
}

export function parseArticleBatch(
  files: File[],
  onProgress: (ev: BatchProgressEvent) => void,
  opts: ParseOptions = {}
): Promise<void> {
  const form = new FormData()
  files.forEach((f) => form.append('pdfs', f, multipartFilenameForPdf(f)))
  if (opts.engine) form.append('parser_engine', opts.engine)
  if (opts.model) form.append('parser_model', opts.model)
  return fetch('/api/articles/batch', {
    method: 'POST',
    body: form,
  }).then(async (res) => {
    if (!res.ok) throw new Error(res.statusText)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const processLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const data = JSON.parse(payload) as BatchProgressEvent
        onProgress(data)
      } catch {
        /* ignore malformed chunk */
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })
      if (done) {
        for (const line of buf.split('\n')) {
          if (line.length) processLine(line)
        }
        break
      }
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.length) processLine(line)
      }
    }
  })
}

// ----- Reviews -----
export const getReviews = (articleId: string) =>
  api.get<Review[]>(`/reviews/${articleId}`).then((r) => r.data)

export function runReview(
  articleId: string,
  task: 1 | 2 | 3,
  model?: string,
  onChunk?: (content: string) => void,
  onUsage?: (usage: Record<string, unknown>) => void,
  onError?: (error: string) => void,
  depth?: 'one_line' | 'five_line' | 'detailed'
): Promise<void> {
  return fetch(`/api/reviews/${articleId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task,
      model,
      ...(task === 2 ? { depth: depth ?? 'detailed' } : {}),
    }),
  }).then(async (res) => {
    if (!res.ok) {
      let msg = res.statusText || 'Request failed'
      const text = await res.text()
      try {
        const j = JSON.parse(text) as { error?: string }
        if (j.error) msg = j.error
      } catch {
        if (text.trim()) msg = text.slice(0, 500)
      }
      throw new Error(msg)
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const data = (await res.json()) as { result?: string; cached?: boolean }
      if (data.result) onChunk?.(data.result)
      return
    }
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const processSseLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const data = JSON.parse(payload) as {
          content?: string
          usage?: Record<string, unknown>
          error?: string
        }
        if (data.content) onChunk?.(data.content)
        if (data.usage) onUsage?.(data.usage)
        if (data.error) onError?.(data.error)
      } catch {
        /* ignore malformed chunk */
      }
    }
    while (true) {
      const { done, value } = await reader.read()
      if (value) buf += decoder.decode(value, { stream: true })
      if (done) {
        for (const line of buf.split('\n')) {
          if (line.length) processSseLine(line)
        }
        break
      }
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (line.length) processSseLine(line)
      }
    }
  })
}

// ----- Settings -----
export const getSettings = () =>
  api.get<Settings>('/settings').then((r) => r.data)

export const updateSettings = (settings: Partial<Settings>) =>
  api.put('/settings', settings)

// ----- Models (OpenRouter) -----
export const getModels = () =>
  api.get<{ data?: Array<{ id: string; name?: string }> }>('/models').then((r) => r.data)

// ----- GROBID -----
export const getGrobidStatus = () =>
  api.get<{ alive: boolean; mode?: 'docker' | 'external' }>('/grobid/status').then((r) => r.data)

export const startGrobid = () =>
  api.post<{ ok: boolean; alive?: boolean; mode?: string; message?: string; error?: string }>('/grobid/start').then((r) => r.data)

// ----- OCR sidecars (Dots + Chandra) -----
export const getDotsOcrStatus = () =>
  api.get<{ alive: boolean; url: string }>('/ocr/dots/status').then((r) => r.data)

export const getChandraOcrStatus = () =>
  api.get<{ alive: boolean; url: string }>('/ocr/chandra/status').then((r) => r.data)

// ----- OpenDataLoader PDF -----
export const getOpendataloaderStatus = () =>
  api
    .get<{
      javaOk: boolean
      javaMajor: number
      javaDetail?: string
      hybridEnabled: boolean
      hybridUrl: string
      hybridAlive: boolean
      jarOk?: boolean
      jarPath?: string
      legacyJarOk?: boolean
    }>('/opendataloader/status')
    .then((r) => r.data)

export const startOpendataloaderHybrid = () =>
  api.post<{ ok: boolean; message?: string }>('/opendataloader/start-hybrid').then((r) => r.data)

export type OpendataloaderRepairResult = {
  ok: boolean
  message: string
  steps: string[]
  jarStatus: { jarOk: boolean; jarPath: string; legacyJarOk: boolean }
}

export const repairOpendataloader = () =>
  api
    .post<OpendataloaderRepairResult>('/opendataloader/repair')
    .then((r) => r.data)
    .catch((err: unknown) => {
      if (axios.isAxiosError(err) && err.response?.data) {
        return err.response.data as OpendataloaderRepairResult
      }
      throw err
    })

// ----- Ollama -----
export const getOllamaStatus = () =>
  api.get<{ alive: boolean; url: string }>('/ollama/status').then((r) => r.data)

export const getOllamaModels = () =>
  api.get<{ models: string[] }>('/ollama/tags').then((r) => r.data)

// ----- Legacy stubs (for unused hooks/pages) -----
export const getPapers = (params?: Record<string, unknown>) =>
  getArticles(params as { search?: string; sort?: string; order?: string }).then((a) => a as unknown as PaperSummary[])

export const getStats = () =>
  Promise.resolve({
    total_papers: 0,
    total_chunks: 0,
    by_category: {} as Record<string, number>,
    papers_with_code_count: 0,
    papers_with_abstract_count: 0,
    unique_datasets_count: 0,
    top_datasets: [],
    venue_type_breakdown: {},
    year_distribution: {},
  } as StatsResponse)

export const getPaperAbstract = (_paperId: string, _forceRegenerate = false) =>
  Promise.reject(new Error('Use Review panel instead'))

// ----- Chat (streaming) -----
export type ChatMode =
  | 'lit_review_synthesis'
  | 'summarize_set'
  | 'intro_abstract'
  | 'related_work_compile'
  | 'related_work_structured'

export function sendChat(
  message: string,
  options: {
    model?: string
    system?: string
    articleIds?: string[]
    mode?: ChatMode
    detailLevel?: 0 | 1 | 2 | 3
    files?: Array<{ name: string; type: string; text?: string; data?: string }>
    signal?: AbortSignal
  },
  onChunk: (content: string) => void,
  onUsage?: (usage: Record<string, unknown>) => void,
  onError?: (error: string) => void
): Promise<void> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: options.signal,
    body: JSON.stringify({
      message,
      model: options.model,
      system: options.system,
      articleIds: options.articleIds?.length ? options.articleIds : undefined,
      mode: options.mode,
      detailLevel: options.detailLevel ?? 0,
      files: options.files,
    }),
  }).then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    const processSseLine = (line: string) => {
      if (!line.startsWith('data: ')) return
      const payload = line.slice(6).trim()
      if (payload === '[DONE]') return
      try {
        const data = JSON.parse(payload) as {
          content?: string
          usage?: Record<string, unknown>
          error?: string
        }
        if (data.content) onChunk(data.content)
        if (data.usage) onUsage?.(data.usage)
        if (data.error) onError?.(data.error)
      } catch {
        /* ignore malformed chunk */
      }
    }
    function read(): Promise<void> {
      if (options.signal?.aborted) {
        return reader.cancel().catch(() => {})
      }
      return reader.read().then(({ done, value }) => {
        if (options.signal?.aborted) {
          return reader.cancel().catch(() => {})
        }
        if (value) buf += decoder.decode(value, { stream: true })
        if (done) {
          for (const line of buf.split('\n')) {
            if (line.length) processSseLine(line)
          }
          return
        }
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (line.length) processSseLine(line)
        }
        return read()
      })
    }
    return read()
  })
}

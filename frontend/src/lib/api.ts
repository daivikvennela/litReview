import axios from 'axios'

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
  /** Present when listing with `include_reviews` — cached LLM outputs */
  llm_intro?: string | null
  llm_summary?: string | null
  llm_literature_review?: string | null
}

export interface ArticleWithReviews extends Article {
  reviews?: Review[]
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

export interface Settings {
  openrouter_api_key?: string
  grobid_url?: string
  grobid_mode?: 'docker' | 'external'
  default_model?: string
  default_model_task1?: string
  default_model_task2?: string
  default_model_task3?: string
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
  /** Omit TEI XML for lighter list responses (Metadata page, etc.). Default true. */
  include_xml?: boolean
  /** Attach cached LLM fields (intro, section summary, literature review). */
  include_reviews?: boolean
}) => api.get<Article[]>('/articles', { params }).then((r) => r.data)

export type ArticleMeta = Pick<Article, 'id' | 'title' | 'pdf_path'>

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

// ----- Parse (PDF -> XML, stored as article) -----
export const parseArticle = (file: File) => {
  const form = new FormData()
  form.append('pdf', file)
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
}

export function parseArticleBatch(
  files: File[],
  onProgress: (ev: BatchProgressEvent) => void
): Promise<void> {
  const form = new FormData()
  files.forEach((f) => form.append('pdfs', f))
  return fetch('/api/articles/batch', {
    method: 'POST',
    body: form,
  }).then(async (res) => {
    if (!res.ok) throw new Error(res.statusText)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const data = JSON.parse(line.slice(6)) as BatchProgressEvent
          onProgress(data)
        } catch {}
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
    if (!res.ok) throw new Error(res.statusText)
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
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const payload = line.slice(6)
        if (payload === '[DONE]') continue
        try {
          const data = JSON.parse(payload)
          if (data.content) onChunk?.(data.content)
          if (data.usage) onUsage?.(data.usage)
          if (data.error) onError?.(data.error)
        } catch {}
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
export type ChatMode = 'lit_review_synthesis' | 'summarize_set' | 'intro_abstract'

export function sendChat(
  message: string,
  options: {
    model?: string
    system?: string
    articleIds?: string[]
    mode?: ChatMode
    files?: Array<{ name: string; type: string; text?: string; data?: string }>
  },
  onChunk: (content: string) => void,
  onUsage?: (usage: Record<string, unknown>) => void,
  onError?: (error: string) => void
): Promise<void> {
  return fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      model: options.model,
      system: options.system,
      articleIds: options.articleIds?.length ? options.articleIds : undefined,
      mode: options.mode,
      files: options.files,
    }),
  }).then((res) => {
    if (!res.ok) throw new Error(res.statusText)
    if (!res.body) return
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    function read(): Promise<void> {
      return reader.read().then(({ done, value }) => {
        if (done) return
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const data = JSON.parse(payload)
            if (data.content) onChunk(data.content)
            if (data.usage) onUsage?.(data.usage)
            if (data.error) onError?.(data.error)
          } catch {}
        }
        return read()
      })
    }
    return read()
  })
}

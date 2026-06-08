import type { Article, ArticleParseOutput } from '@/lib/api'

const PARSER_LABELS: Record<string, string> = {
  opendataloader: 'OpenDataLoader',
  grobid: 'GROBID',
  openrouter_vlm: 'OpenRouter Vision',
  ollama_vlm: 'Ollama Vision',
  dots_ocr: 'Dots OCR',
  chandra_ocr2: 'Chandra OCR 2',
}

export function parserEngineLabel(engine: string | null | undefined): string {
  if (!engine) return 'Unknown parser'
  return PARSER_LABELS[engine] ?? engine
}

export function hasExtractedContent(
  article: Pick<Article, 'xml'> & { parse_output?: ArticleParseOutput | null },
): boolean {
  const hasXml = Boolean(article.xml?.trim())
  const po = article.parse_output
  const hasParse =
    Boolean(po?.normalized_text?.trim()) || Boolean(po?.payload_json?.trim())
  return hasXml || hasParse
}

export function formatParsePayload(payload: string | null | undefined): string {
  const raw = payload?.trim() ?? ''
  if (!raw) return ''
  try {
    return JSON.stringify(JSON.parse(raw) as unknown, null, 2)
  } catch {
    return raw
  }
}

export function extractedPreviewText(
  article: Pick<Article, 'xml'> & { parse_output?: ArticleParseOutput | null },
  maxChars = 6000,
): string | null {
  const normalized = article.parse_output?.normalized_text?.trim()
  if (normalized) return normalized.length > maxChars ? `${normalized.slice(0, maxChars)}…` : normalized
  if (article.xml?.trim()) return null
  const payload = formatParsePayload(article.parse_output?.payload_json)
  if (!payload) return null
  return payload.length > maxChars ? `${payload.slice(0, maxChars)}…` : payload
}

// Curated catalog of popular OpenRouter models with research-relevant benchmarks.
//
// Benchmark figures are APPROXIMATE published values taken from each model's
// official model card / technical report. They are not re-measured here and may
// drift as providers update checkpoints. The UI shows BENCHMARKS_AS_OF and links
// to the sources so users can verify.

/** Default model used when no per-task / per-request model is chosen. */
export const DEFAULT_MODEL_ID = 'openrouter/free'

/** Month the benchmark figures below were last reviewed. */
export const BENCHMARKS_AS_OF = '2026-05'

export type ModelTag = 'recommended' | 'free' | 'budget' | 'vision' | 'reasoning'

export interface ModelEntry {
  /** OpenRouter model id (pass directly to the chat/reviews API). */
  id: string
  name: string
  provider: string
  /** Context window in thousands of tokens. */
  contextK: number
  /** USD per 1M input tokens (0 = free tier). */
  priceIn?: number
  /** USD per 1M output tokens. */
  priceOut?: number
  /** MMLU (broad knowledge), percent. */
  mmlu?: number
  /** GPQA Diamond (graduate-level reasoning), percent. */
  gpqa?: number
  /** Math/reasoning score (AIME 2024 or MATH-500), percent. */
  reasoning?: number
  /** Short label for the reasoning column, e.g. "AIME" or "MATH". */
  reasoningLabel?: string
  tags?: ModelTag[]
}

/** Links shown in the benchmark disclaimer footer. */
export const BENCHMARK_SOURCES: Array<{ label: string; url: string }> = [
  { label: 'Anthropic model cards', url: 'https://www.anthropic.com/news' },
  { label: 'OpenAI models', url: 'https://platform.openai.com/docs/models' },
  { label: 'Google Gemini', url: 'https://ai.google.dev/gemini-api/docs/models' },
  { label: 'DeepSeek', url: 'https://api-docs.deepseek.com/' },
  { label: 'OpenRouter models', url: 'https://openrouter.ai/models' },
]

// Popular OpenRouter models. Figures are approximate published values.
export const MODEL_CATALOG: ModelEntry[] = [
  {
    id: 'anthropic/claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    contextK: 200,
    priceIn: 3,
    priceOut: 15,
    mmlu: 86,
    gpqa: 68,
    reasoning: 61,
    reasoningLabel: 'AIME',
    tags: ['recommended', 'reasoning', 'vision'],
  },
  {
    id: 'openrouter/free',
    name: 'OpenRouter Free (auto)',
    provider: 'OpenRouter',
    contextK: 128,
    priceIn: 0,
    priceOut: 0,
    tags: ['free', 'recommended'],
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B (free)',
    provider: 'Meta',
    contextK: 128,
    priceIn: 0,
    priceOut: 0,
    mmlu: 86,
    gpqa: 50,
    tags: ['free'],
  },
  {
    id: 'stepfun/step-3.5-flash',
    name: 'Step 3.5 Flash',
    provider: 'StepFun',
    contextK: 256,
    priceIn: 0.2,
    priceOut: 1.15,
    tags: ['reasoning'],
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    contextK: 200,
    priceIn: 3,
    priceOut: 15,
    mmlu: 88,
    gpqa: 59,
    reasoning: 16,
    reasoningLabel: 'AIME',
    tags: ['recommended', 'vision'],
  },
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    contextK: 128,
    priceIn: 2.5,
    priceOut: 10,
    mmlu: 88,
    gpqa: 54,
    reasoning: 13,
    reasoningLabel: 'AIME',
    tags: ['recommended', 'vision'],
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o mini',
    provider: 'OpenAI',
    contextK: 128,
    priceIn: 0.15,
    priceOut: 0.6,
    mmlu: 82,
    gpqa: 40,
    reasoning: 70,
    reasoningLabel: 'MATH',
    tags: ['budget', 'vision'],
  },
  {
    id: 'google/gemini-2.5-pro',
    name: 'Gemini 2.5 Pro',
    provider: 'Google',
    contextK: 1000,
    priceIn: 1.25,
    priceOut: 10,
    mmlu: 86,
    gpqa: 84,
    reasoning: 88,
    reasoningLabel: 'AIME',
    tags: ['recommended', 'reasoning', 'vision'],
  },
  {
    id: 'google/gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: 'Google',
    contextK: 1000,
    priceIn: 0.3,
    priceOut: 2.5,
    mmlu: 84,
    gpqa: 78,
    reasoning: 72,
    reasoningLabel: 'AIME',
    tags: ['budget', 'vision'],
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    provider: 'DeepSeek',
    contextK: 128,
    priceIn: 0.55,
    priceOut: 2.19,
    mmlu: 90,
    gpqa: 71,
    reasoning: 79,
    reasoningLabel: 'AIME',
    tags: ['reasoning'],
  },
  {
    id: 'deepseek/deepseek-chat-v3-0324:free',
    name: 'DeepSeek V3 (free)',
    provider: 'DeepSeek',
    contextK: 64,
    priceIn: 0,
    priceOut: 0,
    mmlu: 88,
    gpqa: 59,
    reasoning: 59,
    reasoningLabel: 'AIME',
    tags: ['free'],
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct',
    name: 'Llama 3.3 70B',
    provider: 'Meta',
    contextK: 128,
    priceIn: 0.12,
    priceOut: 0.3,
    mmlu: 86,
    gpqa: 50,
    reasoning: 77,
    reasoningLabel: 'MATH',
    tags: ['budget'],
  },
  {
    id: 'qwen/qwen-2.5-72b-instruct',
    name: 'Qwen 2.5 72B',
    provider: 'Alibaba',
    contextK: 128,
    priceIn: 0.13,
    priceOut: 0.4,
    mmlu: 85,
    gpqa: 49,
    reasoning: 83,
    reasoningLabel: 'MATH',
    tags: ['budget'],
  },
]

/** Catalog ids merged into the live dropdowns so they are always selectable. */
export const CATALOG_MODEL_IDS = MODEL_CATALOG.map((m) => m.id)

/** Human-readable model name for UI labels; falls back to the raw OpenRouter id. */
export function getModelDisplayName(modelId: string): string {
  const entry = MODEL_CATALOG.find((m) => m.id === modelId)
  return entry?.name ?? modelId
}

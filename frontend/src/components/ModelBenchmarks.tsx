import { Check } from 'lucide-react'
import {
  MODEL_CATALOG,
  BENCHMARKS_AS_OF,
  BENCHMARK_SOURCES,
  type ModelEntry,
  type ModelTag,
} from '@/lib/modelCatalog'

const TAG_LABELS: Record<ModelTag, string> = {
  recommended: 'Recommended',
  free: 'Free',
  budget: 'Budget',
  vision: 'Vision',
  reasoning: 'Reasoning',
}

function formatPrice(m: ModelEntry): string {
  if (m.priceIn === 0 && m.priceOut === 0) return 'Free'
  if (m.priceIn == null || m.priceOut == null) return '—'
  return `$${m.priceIn} / $${m.priceOut}`
}

function formatContext(contextK: number): string {
  return contextK >= 1000 ? `${contextK / 1000}M` : `${contextK}K`
}

function pct(value?: number): string {
  return value == null ? '—' : `${value}%`
}

export default function ModelBenchmarks({
  selectedId,
  onSelect,
}: {
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
        Popular OpenRouter models with research-relevant benchmarks. Click a row to use it as your default
        chat model. Stronger models cost more per token.
      </p>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="text-left text-slate-400 dark:text-slate-500">
              <th className="font-medium px-2 py-2">Model</th>
              <th className="font-medium px-2 py-2" title="Broad knowledge (MMLU)">MMLU</th>
              <th className="font-medium px-2 py-2" title="Graduate-level reasoning (GPQA Diamond)">GPQA</th>
              <th className="font-medium px-2 py-2" title="Math / reasoning (AIME or MATH-500)">Math</th>
              <th className="font-medium px-2 py-2" title="Context window">Context</th>
              <th className="font-medium px-2 py-2" title="USD per 1M input / output tokens">$ / 1M</th>
            </tr>
          </thead>
          <tbody>
            {MODEL_CATALOG.map((m) => {
              const isSelected = m.id === selectedId
              return (
                <tr
                  key={m.id}
                  onClick={() => onSelect(m.id)}
                  className={`cursor-pointer border-t border-slate-100 dark:border-slate-800 transition-colors ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </span>
                      <div>
                        <div className="font-medium text-slate-800 dark:text-slate-100 leading-tight">
                          {m.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono leading-tight">{m.id}</div>
                        {m.tags && m.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.tags.map((t) => (
                              <span
                                key={t}
                                className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              >
                                {TAG_LABELS[t]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{pct(m.mmlu)}</td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">{pct(m.gpqa)}</td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-700 dark:text-slate-200">
                    {pct(m.reasoning)}
                    {m.reasoning != null && m.reasoningLabel && (
                      <span className="text-[9px] text-slate-400 ml-1">{m.reasoningLabel}</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">
                    {formatContext(m.contextK)}
                  </td>
                  <td className="px-2 py-2.5 tabular-nums text-slate-500 dark:text-slate-400">
                    {formatPrice(m)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
        Benchmarks are approximate published figures (as of {BENCHMARKS_AS_OF}) from provider model cards;
        actual results vary by prompt and checkpoint. Sources:{' '}
        {BENCHMARK_SOURCES.map((s, i) => (
          <span key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline"
            >
              {s.label}
            </a>
            {i < BENCHMARK_SOURCES.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </div>
  )
}

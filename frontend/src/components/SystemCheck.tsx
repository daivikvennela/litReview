import { useState } from 'react'
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import {
  runSystemCheck,
  type SystemCheckResult,
  type SystemCheckItem,
  type CheckStatus,
} from '@/lib/api'
import { cn } from '@/lib/utils'

const CATEGORY_LABELS: Record<SystemCheckItem['category'], string> = {
  core: 'Core (required to run)',
  parsing: 'PDF parsing (at least one recommended)',
  optional: 'Optional',
}

const CATEGORY_ORDER: SystemCheckItem['category'][] = ['core', 'parsing', 'optional']

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'ok') return <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
  if (status === 'warn') return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
  return <XCircle className="w-4 h-4 text-red-500 shrink-0" />
}

function SummaryPill({ status, count }: { status: CheckStatus; count: number }) {
  const styles: Record<CheckStatus, string> = {
    ok: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/50',
    warn: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50',
    fail: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900/50',
  }
  const labels: Record<CheckStatus, string> = { ok: 'Passing', warn: 'Warnings', fail: 'Failing' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border', styles[status])}>
      {count} {labels[status]}
    </span>
  )
}

export default function SystemCheck() {
  const [result, setResult] = useState<SystemCheckResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const r = await runSystemCheck()
      setResult(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run system check')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
          <Activity className="w-4 h-4" /> System Check
        </h2>
        <button
          type="button"
          onClick={run}
          disabled={running}
          className={cn(
            'inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-medium transition-all shrink-0',
            running
              ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700',
          )}
        >
          {running ? <Loader2 className="w-4 h-4 animate-spin" /> : result ? <RefreshCw className="w-4 h-4" /> : <Activity className="w-4 h-4" />}
          {running ? 'Running…' : result ? 'Re-run' : 'Run check'}
        </button>
      </div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
        Manually verify that the database, OpenRouter connectivity, default model, and PDF-parsing tools are working.
      </p>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-3 text-[12px] text-red-700 dark:text-red-300">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!result && !error && !running && (
        <p className="text-[12px] text-slate-400 italic">
          No checks run yet. Click &ldquo;Run check&rdquo; to test all main features.
        </p>
      )}

      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {result.summary.fail > 0 && <SummaryPill status="fail" count={result.summary.fail} />}
            {result.summary.warn > 0 && <SummaryPill status="warn" count={result.summary.warn} />}
            <SummaryPill status="ok" count={result.summary.ok} />
            <span className="text-[11px] text-slate-400">
              {new Date(result.ranAt).toLocaleTimeString()} · {result.durationMs} ms
            </span>
          </div>

          <div className="space-y-4">
            {CATEGORY_ORDER.map((cat) => {
              const items = result.checks.filter((c) => c.category === cat)
              if (items.length === 0) return null
              return (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">
                    {CATEGORY_LABELS[cat]}
                  </p>
                  <div className="space-y-1.5">
                    {items.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start gap-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-3.5 py-2.5"
                      >
                        <span className="mt-0.5">
                          <StatusIcon status={c.status} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13px] font-medium text-slate-800 dark:text-slate-100">{c.label}</span>
                          </div>
                          <p className="text-[12px] text-slate-500 dark:text-slate-400 break-words">{c.detail}</p>
                          {c.hint && c.status !== 'ok' && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 break-words">{c.hint}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

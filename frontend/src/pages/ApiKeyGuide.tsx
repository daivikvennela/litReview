import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  KeyRound,
  UserPlus,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Check,
  Copy,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { getSettings, updateSettings } from '@/lib/api'
import { cn } from '@/lib/utils'

const SUGGESTED_KEY_NAME = 'Lit Review Agent'
const OPENROUTER_HOME = 'https://openrouter.ai'
const OPENROUTER_KEYS = 'https://openrouter.ai/keys'
const LIMITS_AS_OF = 'May 2026'

type KeyStatus = 'loading' | 'configured' | 'missing'

interface StepDef {
  id: number
  title: string
  icon: React.ComponentType<{ className?: string }>
  blurb: string
}

const STEPS: StepDef[] = [
  { id: 0, title: 'Create or sign in to OpenRouter', icon: UserPlus, blurb: 'A free account is all you need to start.' },
  { id: 1, title: 'Open the API Keys page', icon: KeyRound, blurb: 'Your keys live under Settings → API Keys.' },
  { id: 2, title: 'Create a new key', icon: Sparkles, blurb: 'Name it, set an optional limit, and copy it once.' },
  { id: 3, title: 'Free vs paid usage', icon: ShieldCheck, blurb: 'Understand the daily and per-minute limits.' },
  { id: 4, title: 'Paste and save your key', icon: Check, blurb: 'Store it securely in this app.' },
]

function ExternalButton({
  href,
  children,
  variant = 'primary',
}: {
  href: string
  children: React.ReactNode
  variant?: 'primary' | 'ghost'
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all',
        variant === 'primary'
          ? 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-500/20 hover:-translate-y-0.5'
          : 'border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700',
      )}
    >
      {children}
      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
    </a>
  )
}

export default function ApiKeyGuide() {
  const [keyStatus, setKeyStatus] = useState<KeyStatus>('loading')
  const [activeStep, setActiveStep] = useState(0)
  const [completed, setCompleted] = useState<Set<number>>(new Set())
  const [copied, setCopied] = useState(false)

  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getSettings()
      .then((s) => {
        if (cancelled) return
        setKeyStatus(s.openrouter_api_key ? 'configured' : 'missing')
      })
      .catch(() => {
        if (!cancelled) setKeyStatus('missing')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const progress = useMemo(
    () => Math.round((completed.size / STEPS.length) * 100),
    [completed],
  )

  const keyLooksValid = apiKey.trim().startsWith('sk-or-v1-') && apiKey.trim().length > 16

  const markDone = (id: number) => {
    setCompleted((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    if (id < STEPS.length - 1) setActiveStep(id + 1)
  }

  const copyName = async () => {
    try {
      await navigator.clipboard.writeText(SUGGESTED_KEY_NAME)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard unavailable */
    }
  }

  const saveKey = async () => {
    if (!keyLooksValid) {
      setSaveError('That does not look like an OpenRouter key (it should start with "sk-or-v1-").')
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await updateSettings({ openrouter_api_key: apiKey.trim() })
      setSaved(true)
      setKeyStatus('configured')
      markDone(4)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save the key. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl border border-white/10 p-8 sm:p-10"
        style={{
          background:
            'linear-gradient(135deg, #0f172a 0%, #1e1b4b 35%, #312e81 60%, #1e293b 100%)',
        }}
      >
        <div className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-fuchsia-500/25 blur-[80px]" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-cyan-500/20 blur-[80px]" />
        <div className="relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm mb-4 shadow-lg shadow-black/20">
            <KeyRound className="w-7 h-7 text-cyan-200" />
          </div>
          <h1 className="text-white text-2xl sm:text-3xl font-bold tracking-tight">Connect OpenRouter</h1>
          <p className="text-slate-300/90 text-sm mt-2 max-w-lg leading-relaxed">
            Create a free OpenRouter API key in a few steps. It powers chat, summaries, and literature
            reviews in this app — and you can start with free models at no cost.
          </p>
        </div>
      </div>

      {/* Status banner */}
      <div className="mt-5">
        {keyStatus === 'loading' ? (
          <div className="flex items-center gap-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-slate-500 shadow-card">
            <Loader2 className="w-4 h-4 animate-spin" />
            Checking your current configuration…
          </div>
        ) : keyStatus === 'configured' ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 shadow-card">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                An API key is already configured. You can replace it below or manage it in Settings.
              </span>
            </div>
            <Link
              to="/settings"
              className="shrink-0 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
            >
              Settings
            </Link>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 shadow-card">
            <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-sm font-medium text-amber-800 dark:text-amber-300">
              No API key configured yet. Follow the steps below to get set up.
            </span>
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Setup progress</span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{progress}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-3 flex items-center gap-2">
          {STEPS.map((s) => {
            const done = completed.has(s.id)
            const active = activeStep === s.id
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setActiveStep(s.id)}
                aria-label={`Go to step ${s.id + 1}`}
                className={cn(
                  'flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold border-2 transition-all',
                  done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : active
                      ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40'
                      : 'border-slate-300 dark:border-slate-700 text-slate-400',
                )}
              >
                {done ? <Check className="w-4 h-4" /> : s.id + 1}
              </button>
            )
          })}
        </div>
      </div>

      {/* Stepper */}
      <div className="mt-6 space-y-3">
        {STEPS.map((step) => {
          const Icon = step.icon
          const isOpen = activeStep === step.id
          const done = completed.has(step.id)
          return (
            <div
              key={step.id}
              className={cn(
                'rounded-2xl border bg-white dark:bg-slate-900 shadow-card overflow-hidden transition-all',
                isOpen
                  ? 'border-blue-200 dark:border-blue-900/60 ring-1 ring-blue-500/10'
                  : 'border-slate-100 dark:border-slate-800',
              )}
            >
              <button
                type="button"
                onClick={() => setActiveStep(isOpen ? -1 : step.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left"
              >
                <span
                  className={cn(
                    'flex items-center justify-center w-9 h-9 rounded-xl shrink-0 transition-colors',
                    done
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400'
                      : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
                  )}
                >
                  {done ? <Check className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-slate-900 dark:text-slate-100">
                    Step {step.id + 1} · {step.title}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.blurb}</span>
                </span>
                <ArrowRight
                  className={cn(
                    'w-4 h-4 text-slate-400 transition-transform shrink-0',
                    isOpen && 'rotate-90',
                  )}
                />
              </button>

              <div
                className={cn(
                  'grid transition-all duration-300',
                  isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <div className="px-5 pb-5 pt-1 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                    {step.id === 0 && (
                      <>
                        <p>
                          Head to OpenRouter and sign in, or create a free account. You can sign up with
                          Google, GitHub, or email — no payment details are required to begin.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <ExternalButton href={OPENROUTER_HOME}>Open OpenRouter</ExternalButton>
                          <button
                            type="button"
                            onClick={() => markDone(0)}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            I&apos;m signed in →
                          </button>
                        </div>
                      </>
                    )}

                    {step.id === 1 && (
                      <>
                        <p>
                          Open the API Keys page. In the OpenRouter dashboard this is under{' '}
                          <span className="font-medium text-slate-800 dark:text-slate-200">Settings → API Keys</span>.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <ExternalButton href={OPENROUTER_KEYS}>Open API Keys</ExternalButton>
                          <button
                            type="button"
                            onClick={() => markDone(1)}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Page is open →
                          </button>
                        </div>
                      </>
                    )}

                    {step.id === 2 && (
                      <>
                        <p>
                          Click <span className="font-medium text-slate-800 dark:text-slate-200">Create Key</span>,
                          give it a recognizable name, and optionally set a credit limit. You can use the
                          suggested name below:
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                          <code className="flex-1 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-[13px] font-mono text-slate-700 dark:text-slate-200">
                            {SUGGESTED_KEY_NAME}
                          </code>
                          <button
                            type="button"
                            onClick={copyName}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                          >
                            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                        <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/30 px-3.5 py-3">
                          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                            The key (<code className="font-mono">sk-or-v1-…</code>) is shown{' '}
                            <span className="font-semibold">only once</span>. Copy it now — you&apos;ll paste it in
                            the final step. Keep it secret.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => markDone(2)}
                          className="mt-4 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          I copied my key →
                        </button>
                      </>
                    )}

                    {step.id === 3 && (
                      <>
                        <div className="grid sm:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300">Free models</span>
                            </div>
                            <ul className="text-xs text-emerald-900/80 dark:text-emerald-200/80 space-y-1.5 leading-relaxed">
                              <li>Models tagged <code className="font-mono">:free</code> cost nothing.</li>
                              <li>50 requests/day with no credits.</li>
                              <li>1,000 requests/day after depositing $10+.</li>
                              <li>Up to ~20 requests/minute.</li>
                            </ul>
                          </div>
                          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">Paid models</span>
                            </div>
                            <ul className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 leading-relaxed">
                              <li>Add credits to unlock higher limits.</li>
                              <li>Pay-as-you-go per token, per model.</li>
                              <li>Set a per-key credit limit to stay in control.</li>
                            </ul>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                          This app defaults to OpenRouter Free (auto), which picks an available free model. Limits
                          shown as of {LIMITS_AS_OF} and may change.
                        </p>
                        <button
                          type="button"
                          onClick={() => markDone(3)}
                          className="mt-4 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Got it →
                        </button>
                      </>
                    )}

                    {step.id === 4 && (
                      <>
                        <p>Paste the key you copied. It&apos;s stored securely and used for all model requests.</p>
                        <div className="mt-3 flex items-center gap-2">
                          <div className="relative flex-1">
                            <input
                              type={showKey ? 'text' : 'password'}
                              value={apiKey}
                              onChange={(e) => {
                                setApiKey(e.target.value)
                                setSaveError(null)
                                setSaved(false)
                              }}
                              placeholder="sk-or-v1-…"
                              autoComplete="off"
                              spellCheck={false}
                              className="w-full px-3 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-xl text-[13px] font-mono bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                            />
                            <button
                              type="button"
                              onClick={() => setShowKey((v) => !v)}
                              aria-label={showKey ? 'Hide key' : 'Show key'}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={saveKey}
                            disabled={saving || !keyLooksValid}
                            className={cn(
                              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0',
                              saving || !keyLooksValid
                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-500/20 hover:-translate-y-0.5',
                            )}
                          >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                            Save key
                          </button>
                        </div>

                        {saveError && (
                          <div className="mt-3 flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{saveError}</span>
                          </div>
                        )}

                        {saved && (
                          <div className="mt-4 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                                Key saved — you&apos;re all set!
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <Link
                                to="/query"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 text-white text-sm font-semibold shadow-md shadow-blue-500/20 hover:-translate-y-0.5 transition-all"
                              >
                                Start chatting
                                <ArrowRight className="w-4 h-4" />
                              </Link>
                              <Link
                                to="/upload"
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                              >
                                Upload papers
                                <ArrowRight className="w-4 h-4" />
                              </Link>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

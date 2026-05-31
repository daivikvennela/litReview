import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Key, Server, Cpu, Play, FileSearch, Layers, BarChart3 } from 'lucide-react'
import {
  getSettings,
  updateSettings,
  getModels,
  getGrobidStatus,
  startGrobid,
  getOllamaStatus,
  getOllamaModels,
  getOpendataloaderStatus,
  startOpendataloaderHybrid,
  getDotsOcrStatus,
  getChandraOcrStatus,
} from '@/lib/api'
import type { Settings, ParserEngine } from '@/lib/api'
import ModelBenchmarks from '@/components/ModelBenchmarks'
import SystemCheck from '@/components/SystemCheck'
import { DEFAULT_MODEL_ID, CATALOG_MODEL_IDS } from '@/lib/modelCatalog'

const PARSER_ENGINE_OPTIONS: Array<{ value: ParserEngine; label: string }> = [
  { value: 'opendataloader', label: 'OpenDataLoader (default, #1 in benchmarks)' },
  { value: 'grobid', label: 'GROBID (TEI XML)' },
  { value: 'openrouter_vlm', label: 'OpenRouter Vision LM' },
  { value: 'ollama_vlm', label: 'Local Ollama Vision LM' },
  { value: 'dots_ocr', label: 'Dots OCR (local sidecar)' },
  { value: 'chandra_ocr2', label: 'Chandra OCR 2 (local sidecar)' },
]

const OPENROUTER_VLM_SUGGESTIONS = [
  'qwen/qwen2.5-vl-72b-instruct:free',
  'qwen/qwen2.5-vl-32b-instruct',
  'google/gemini-2.5-flash',
  'anthropic/claude-3.5-sonnet',
]

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({})
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
  const [grobidAlive, setGrobidAlive] = useState<boolean | null>(null)
  const [grobidStartMessage, setGrobidStartMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [ollamaAlive, setOllamaAlive] = useState<boolean | null>(null)
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [odlJavaOk, setOdlJavaOk] = useState<boolean | null>(null)
  const [odlHybridAlive, setOdlHybridAlive] = useState<boolean | null>(null)
  const [odlJavaDetail, setOdlJavaDetail] = useState('')
  const [odlStartMessage, setOdlStartMessage] = useState<string | null>(null)
  const [dotsAlive, setDotsAlive] = useState<boolean | null>(null)
  const [chandraAlive, setChandraAlive] = useState<boolean | null>(null)

  useEffect(() => {
    getSettings().then((s) => {
      setSettings({
        ...s,
        grobid_mode: s.grobid_mode ?? 'docker',
        opendataloader_hybrid_url: s.opendataloader_hybrid_url ?? 'http://localhost:5002',
        opendataloader_ocr_lang: s.opendataloader_ocr_lang ?? 'en',
        opendataloader_use_struct_tree: s.opendataloader_use_struct_tree ?? 'true',
        dots_ocr_url: s.dots_ocr_url ?? 'http://127.0.0.1:8001',
        chandra_ocr2_url: s.chandra_ocr2_url ?? 'http://127.0.0.1:8002',
        ocr_sidecar_timeout_ms: s.ocr_sidecar_timeout_ms ?? '120000',
      })
      if (s.openrouter_api_key && !s.openrouter_api_key.endsWith('****')) {
        setApiKeyValue(s.openrouter_api_key)
      }
    })
    getModels().then((r) => {
      const list = (r as { data?: Array<{ id: string; name?: string }> })?.data ?? []
      setModels(Array.isArray(list) ? list : [])
    }).catch(() => setModels([]))
  }, [])

  // Curated catalog ids first, then the live OpenRouter list (deduped) so the
  // popular models are always selectable even if the live fetch fails.
  const modelOptions = (() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of CATALOG_MODEL_IDS) {
      if (!seen.has(id)) {
        seen.add(id)
        out.push(id)
      }
    }
    for (const m of models.slice(0, 80)) {
      if (!seen.has(m.id)) {
        seen.add(m.id)
        out.push(m.id)
      }
    }
    return out
  })()

  useEffect(() => {
    const refresh = () => {
      getDotsOcrStatus().then((r) => setDotsAlive(r.alive)).catch(() => setDotsAlive(false))
      getChandraOcrStatus().then((r) => setChandraAlive(r.alive)).catch(() => setChandraAlive(false))
    }
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    getGrobidStatus().then((r) => {
      setGrobidAlive(r.alive)
      if (r.mode) setSettings((s) => ({ ...s, grobid_mode: r.mode }))
    })
    const t = setInterval(() => getGrobidStatus().then((r) => setGrobidAlive(r.alive)), 15000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const refresh = () =>
      getOpendataloaderStatus()
        .then((r) => {
          setOdlJavaOk(r.javaOk)
          setOdlHybridAlive(r.hybridAlive)
          setOdlJavaDetail(r.javaDetail ?? '')
        })
        .catch(() => {
          setOdlJavaOk(false)
          setOdlHybridAlive(false)
        })
    refresh()
    const t = setInterval(refresh, 15000)
    return () => clearInterval(t)
  }, [settings.opendataloader_hybrid_enabled, settings.opendataloader_hybrid_url])

  useEffect(() => {
    let cancelled = false
    const refreshOllama = () => {
      getOllamaStatus()
        .then((r) => {
          if (!cancelled) setOllamaAlive(r.alive)
          if (r.alive) {
            return getOllamaModels().then((m) => {
              if (!cancelled) setOllamaModels(m.models)
            })
          }
        })
        .catch(() => {
          if (!cancelled) setOllamaAlive(false)
        })
    }
    refreshOllama()
    const t = setInterval(refreshOllama, 20000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [settings.ollama_url])

  const handleSave = () => {
    setSaving(true)
    const payload: Partial<Settings> = { ...settings }
    if (apiKeyValue) payload.openrouter_api_key = apiKeyValue
    updateSettings(payload)
      .then(() => setSaving(false))
      .catch(() => setSaving(false))
  }

  const handleStartOdlHybrid = () => {
    setOdlStartMessage(null)
    startOpendataloaderHybrid()
      .then((resp) => {
        setOdlStartMessage(resp?.message ?? (resp?.ok ? 'Hybrid server start requested.' : 'Could not start hybrid.'))
        return getOpendataloaderStatus().then((r) => {
          setOdlJavaOk(r.javaOk)
          setOdlHybridAlive(r.hybridAlive)
        })
      })
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message ||
          (e instanceof Error ? e.message : 'Failed to start hybrid server')
        setOdlStartMessage(msg)
      })
  }

  const handleStartGrobid = () => {
    setGrobidStartMessage(null)
    startGrobid()
      .then((resp) =>
        getGrobidStatus()
          .then((r) => {
            setGrobidAlive(r.alive)
            setGrobidStartMessage(
              resp?.message || (r.alive ? 'GROBID is ready.' : 'GROBID is still offline.'),
            )
          })
          .catch(() => {}),
      )
      .catch((e: unknown) => {
        const msg =
          (e as { response?: { data?: { error?: string } }; message?: string })?.response?.data?.error ||
          (e instanceof Error ? e.message : 'Failed to start GROBID with Docker')
        setGrobidStartMessage(msg)
      })
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-slate-500 dark:text-slate-400" />
          Settings
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          API keys and service configuration
        </p>
      </div>

      <div className="space-y-6">
        <SystemCheck />

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <Key className="w-4 h-4" /> OpenRouter API Key
          </h2>
          <div className="flex gap-2">
            <input
              type={apiKeyVisible ? 'text' : 'password'}
              value={apiKeyValue}
              onChange={(e) => setApiKeyValue(e.target.value)}
              placeholder={settings.openrouter_api_key ? '••••••••' : 'sk-or-v1-...'}
              className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
            />
            <button
              type="button"
              onClick={() => setApiKeyVisible((v) => !v)}
              className="text-[12px] text-slate-500 hover:text-slate-700 px-2"
            >
              {apiKeyVisible ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">openrouter.ai/keys</a>
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <Layers className="w-4 h-4" /> OpenDataLoader PDF
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
            Default parser: Java 11+ on PATH. Optional hybrid server for OCR, complex tables, formulas, and image
            descriptions (
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-[11px]">
              pip install &quot;opendataloader-pdf[hybrid]&quot;
            </code>
            ).
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  odlJavaOk === true ? 'bg-emerald-500' : odlJavaOk === false ? 'bg-red-500' : 'bg-slate-300'
                }`}
              />
              <span className="text-[12px] text-slate-600 dark:text-slate-300">
                Java {odlJavaOk === true ? 'OK (11+)' : odlJavaOk === false ? 'missing or below 11' : '…'}
              </span>
            </div>
            {settings.opendataloader_hybrid_enabled === 'true' && (
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    odlHybridAlive === true ? 'bg-emerald-500' : odlHybridAlive === false ? 'bg-red-500' : 'bg-slate-300'
                  }`}
                />
                <span className="text-[12px] text-slate-600 dark:text-slate-300">
                  Hybrid {odlHybridAlive === true ? 'reachable' : odlHybridAlive === false ? 'offline' : '…'}
                </span>
              </div>
            )}
          </div>
          {odlJavaDetail ? (
            <p className="text-[11px] text-slate-400 mb-3 font-mono break-all">{odlJavaDetail}</p>
          ) : null}
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.opendataloader_hybrid_enabled === 'true'}
              onChange={(e) =>
                setSettings((s) => ({ ...s, opendataloader_hybrid_enabled: e.target.checked ? 'true' : 'false' }))
              }
              className="rounded border-slate-300"
            />
            <span className="text-[13px] text-slate-700 dark:text-slate-200">Use hybrid backend (docling-fast)</span>
          </label>
          <label className="block mb-3">
            <span className="text-[12px] text-slate-500 block mb-1">Hybrid URL</span>
            <input
              type="text"
              value={settings.opendataloader_hybrid_url ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, opendataloader_hybrid_url: e.target.value }))}
              placeholder="http://localhost:5002"
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.opendataloader_force_ocr === 'true'}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, opendataloader_force_ocr: e.target.checked ? 'true' : 'false' }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-[12px] text-slate-700 dark:text-slate-200">Force OCR (hybrid server flags)</span>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">OCR languages</span>
              <input
                type="text"
                value={settings.opendataloader_ocr_lang ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, opendataloader_ocr_lang: e.target.value }))}
                placeholder="en or ko,en"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800"
              />
            </label>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.opendataloader_enrich_formula === 'true'}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, opendataloader_enrich_formula: e.target.checked ? 'true' : 'false' }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-[12px] text-slate-700 dark:text-slate-200">Formula enrichment (LaTeX)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.opendataloader_enrich_picture_description === 'true'}
                onChange={(e) =>
                  setSettings((s) => ({
                    ...s,
                    opendataloader_enrich_picture_description: e.target.checked ? 'true' : 'false',
                  }))
                }
                className="rounded border-slate-300"
              />
              <span className="text-[12px] text-slate-700 dark:text-slate-200">Picture / chart descriptions</span>
            </label>
          </div>
          <label className="flex items-center gap-2 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.opendataloader_use_struct_tree !== 'false'}
              onChange={(e) =>
                setSettings((s) => ({ ...s, opendataloader_use_struct_tree: e.target.checked ? 'true' : 'false' }))
              }
              className="rounded border-slate-300"
            />
            <span className="text-[12px] text-slate-700 dark:text-slate-200">Use PDF structure tree (tagged PDF)</span>
          </label>
          <button
            type="button"
            onClick={handleStartOdlHybrid}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-[12px] font-medium text-slate-700 dark:text-slate-200"
          >
            <Play className="w-3.5 h-3.5" /> Start hybrid server (CLI on PATH)
          </button>
          <p className="text-[11px] text-slate-400 mt-2">
            Port is taken from the Hybrid URL (default 5002). Save settings first so OCR/formula flags apply to the
            spawned server.
          </p>
          {odlStartMessage && (
            <p className="text-[12px] mt-2 text-slate-600 dark:text-slate-300 break-all">{odlStartMessage}</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <Server className="w-4 h-4" /> GROBID
          </h2>
          <div className="mb-3">
            <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, grobid_mode: 'docker' }))}
                className={`px-3 py-1.5 text-[12px] ${settings.grobid_mode === 'docker' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
              >
                Docker managed
              </button>
              <button
                type="button"
                onClick={() => setSettings((s) => ({ ...s, grobid_mode: 'external' }))}
                className={`px-3 py-1.5 text-[12px] border-l border-slate-200 dark:border-slate-700 ${settings.grobid_mode === 'external' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}
              >
                External URL
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              type="text"
              value={settings.grobid_url ?? ''}
              onChange={(e) => setSettings((s) => ({ ...s, grobid_url: e.target.value }))}
              placeholder="http://localhost:8070"
              className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${grobidAlive === true ? 'bg-emerald-500' : grobidAlive === false ? 'bg-red-500' : 'bg-slate-300'}`}
              />
              <span className="text-[12px] text-slate-500">
                {grobidAlive === true ? 'Connected' : grobidAlive === false ? 'Offline' : 'Checking…'}
              </span>
            </div>
            <button
              type="button"
              onClick={handleStartGrobid}
              disabled={settings.grobid_mode !== 'docker'}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-[12px] font-medium text-slate-700 dark:text-slate-200"
            >
              <Play className="w-3.5 h-3.5" /> Start with Docker
            </button>
          </div>
          <p className="text-[12px] text-slate-400 mt-2">
            Run GROBID via Docker: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded text-slate-800 dark:text-slate-200">docker run -d --name grobid -p 8070:8070 lfoppiano/grobid:0.8.1</code>
          </p>
          {grobidStartMessage && (
            <p className="text-[12px] mt-2 text-slate-600 dark:text-slate-300 break-all">{grobidStartMessage}</p>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <Layers className="w-4 h-4" /> OCR sidecars
          </h2>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4">
            Local HTTP services for Dots OCR and Chandra OCR 2. Requires GPU + vLLM; see{' '}
            <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">scripts/ocr-sidecars/README.md</code>.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Dots OCR URL
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={settings.dots_ocr_url ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, dots_ocr_url: e.target.value }))}
                  placeholder="http://127.0.0.1:8001"
                  className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${dotsAlive === true ? 'bg-emerald-500' : dotsAlive === false ? 'bg-red-500' : 'bg-slate-300'}`}
                  />
                  <span className="text-[12px] text-slate-500">
                    {dotsAlive === true ? 'Connected' : dotsAlive === false ? 'Offline' : 'Checking…'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Chandra OCR 2 URL
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  type="text"
                  value={settings.chandra_ocr2_url ?? ''}
                  onChange={(e) => setSettings((s) => ({ ...s, chandra_ocr2_url: e.target.value }))}
                  placeholder="http://127.0.0.1:8002"
                  className="flex-1 min-w-[200px] px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${chandraAlive === true ? 'bg-emerald-500' : chandraAlive === false ? 'bg-red-500' : 'bg-slate-300'}`}
                  />
                  <span className="text-[12px] text-slate-500">
                    {chandraAlive === true ? 'Connected' : chandraAlive === false ? 'Offline' : 'Checking…'}
                  </span>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                Parse timeout (ms)
              </label>
              <input
                type="number"
                min={10000}
                step={1000}
                value={settings.ocr_sidecar_timeout_ms ?? '120000'}
                onChange={(e) => setSettings((s) => ({ ...s, ocr_sidecar_timeout_ms: e.target.value }))}
                className="w-full max-w-[200px] px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <BarChart3 className="w-4 h-4" /> Models &amp; Benchmarks
          </h2>
          <ModelBenchmarks
            selectedId={settings.default_model ?? DEFAULT_MODEL_ID}
            onSelect={(id) => setSettings((s) => ({ ...s, default_model: id }))}
          />
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <Cpu className="w-4 h-4" /> Default models
          </h2>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Default (chat)</span>
              <select
                value={settings.default_model ?? DEFAULT_MODEL_ID}
                onChange={(e) => setSettings((s) => ({ ...s, default_model: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {modelOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 1 (Metadata & links)</span>
              <select
                value={settings.default_model_task1 ?? settings.default_model ?? DEFAULT_MODEL_ID}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task1: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {modelOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 2 (Section summary)</span>
              <select
                value={settings.default_model_task2 ?? settings.default_model ?? DEFAULT_MODEL_ID}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task2: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {modelOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 3 (Related work)</span>
              <select
                value={settings.default_model_task3 ?? settings.default_model ?? DEFAULT_MODEL_ID}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task3: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {modelOptions.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-card border border-slate-100 dark:border-slate-800">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100 mb-4">
            <FileSearch className="w-4 h-4" /> PDF parser
          </h2>

          <label className="block mb-3">
            <span className="text-[12px] text-slate-500 block mb-1">Default engine</span>
            <select
              value={settings.pdf_parser_default_engine ?? 'opendataloader'}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  pdf_parser_default_engine: e.target.value as ParserEngine,
                }))
              }
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              {PARSER_ENGINE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-400 block mt-1">
              Applied by default in Upload. Users can still override per-upload.
            </span>
          </label>

          <div className="mb-4 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="text-[12px] font-medium text-slate-600 dark:text-slate-300 mb-2">
              OpenRouter vision LM
            </div>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Model</span>
              <input
                list="openrouter-vlm-suggestions"
                type="text"
                value={settings.pdf_parser_openrouter_model ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, pdf_parser_openrouter_model: e.target.value }))
                }
                placeholder="qwen/qwen2.5-vl-72b-instruct:free"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <datalist id="openrouter-vlm-suggestions">
                {OPENROUTER_VLM_SUGGESTIONS.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <span className="text-[11px] text-slate-400 block mt-1">
                Leave blank to use <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">qwen/qwen2.5-vl-72b-instruct:free</code>.
                Uses your OpenRouter API key above.
              </span>
            </label>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Local Ollama vision LM
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    ollamaAlive === true
                      ? 'bg-emerald-500'
                      : ollamaAlive === false
                      ? 'bg-red-500'
                      : 'bg-slate-300'
                  }`}
                />
                <span className="text-[11px] text-slate-500">
                  {ollamaAlive === true
                    ? 'Reachable'
                    : ollamaAlive === false
                    ? 'Unreachable'
                    : 'Checking…'}
                </span>
              </div>
            </div>
            <label className="block mb-2">
              <span className="text-[12px] text-slate-500 block mb-1">Ollama URL</span>
              <input
                type="text"
                value={settings.ollama_url ?? ''}
                onChange={(e) => setSettings((s) => ({ ...s, ollama_url: e.target.value }))}
                placeholder="http://localhost:11434"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Model</span>
              <input
                list="ollama-vlm-suggestions"
                type="text"
                value={settings.pdf_parser_ollama_model ?? ''}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, pdf_parser_ollama_model: e.target.value }))
                }
                placeholder="qwen2.5vl:7b"
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
              <datalist id="ollama-vlm-suggestions">
                {ollamaModels.length > 0
                  ? ollamaModels.map((m) => <option key={m} value={m} />)
                  : ['qwen2.5vl:7b', 'minicpm-v:latest', 'llama3.2-vision:11b'].map((m) => (
                      <option key={m} value={m} />
                    ))}
              </datalist>
              <span className="text-[11px] text-slate-400 block mt-1">
                {ollamaAlive
                  ? 'Pulled models are suggested from the running Ollama instance.'
                  : 'Install Ollama and run `ollama pull qwen2.5vl:7b` to use a local vision LM.'}{' '}
                Requires <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">pdftoppm</code> (Poppler).
              </span>
            </label>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-blue-600 text-white text-[13px] font-medium rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </div>
    </div>
  )
}

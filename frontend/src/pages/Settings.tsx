import { useState, useEffect } from 'react'
import { Settings as SettingsIcon, Key, Server, Cpu, Play } from 'lucide-react'
import { getSettings, updateSettings, getModels, getGrobidStatus, startGrobid } from '@/lib/api'
import type { Settings } from '@/lib/api'

export default function Settings() {
  const [settings, setSettings] = useState<Settings>({})
  const [models, setModels] = useState<Array<{ id: string; name?: string }>>([])
  const [grobidAlive, setGrobidAlive] = useState<boolean | null>(null)
  const [grobidStartMessage, setGrobidStartMessage] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [apiKeyVisible, setApiKeyVisible] = useState(false)
  const [apiKeyValue, setApiKeyValue] = useState('')

  useEffect(() => {
    getSettings().then((s) => {
      setSettings({ ...s, grobid_mode: s.grobid_mode ?? 'docker' })
      if (s.openrouter_api_key && !s.openrouter_api_key.endsWith('****')) {
        setApiKeyValue(s.openrouter_api_key)
      }
    })
    getModels().then((r) => {
      const list = (r as { data?: Array<{ id: string; name?: string }> })?.data ?? []
      setModels(Array.isArray(list) ? list : [])
    }).catch(() => setModels([]))
  }, [])

  useEffect(() => {
    getGrobidStatus().then((r) => {
      setGrobidAlive(r.alive)
      if (r.mode) setSettings((s) => ({ ...s, grobid_mode: r.mode }))
    })
    const t = setInterval(() => getGrobidStatus().then((r) => setGrobidAlive(r.alive)), 15000)
    return () => clearInterval(t)
  }, [])

  const handleSave = () => {
    setSaving(true)
    const payload: Partial<Settings> = { ...settings }
    if (apiKeyValue) payload.openrouter_api_key = apiKeyValue
    updateSettings(payload)
      .then(() => setSaving(false))
      .catch(() => setSaving(false))
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
            <Cpu className="w-4 h-4" /> Default models
          </h2>
          <div className="space-y-3">
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Default (chat)</span>
              <select
                value={settings.default_model ?? 'openrouter/free'}
                onChange={(e) => setSettings((s) => ({ ...s, default_model: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {models.slice(0, 80).map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
                {models.length === 0 && <option value="openrouter/free">openrouter/free</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 1 (Metadata & links)</span>
              <select
                value={settings.default_model_task1 ?? settings.default_model ?? 'openrouter/free'}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task1: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {models.slice(0, 80).map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
                {models.length === 0 && <option value="openrouter/free">openrouter/free</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 2 (Section summary)</span>
              <select
                value={settings.default_model_task2 ?? settings.default_model ?? 'openrouter/free'}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task2: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {models.slice(0, 80).map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
                {models.length === 0 && <option value="openrouter/free">openrouter/free</option>}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] text-slate-500 block mb-1">Task 3 (Related work)</span>
              <select
                value={settings.default_model_task3 ?? settings.default_model ?? 'openrouter/free'}
                onChange={(e) => setSettings((s) => ({ ...s, default_model_task3: e.target.value }))}
                className="w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-xl text-[13px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {models.slice(0, 80).map((m) => (
                  <option key={m.id} value={m.id}>{m.id}</option>
                ))}
                {models.length === 0 && <option value="openrouter/free">openrouter/free</option>}
              </select>
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

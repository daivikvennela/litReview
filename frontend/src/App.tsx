import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  BookOpen,
  Database,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Upload,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/hooks/useTheme'
import Dashboard from '@/pages/Dashboard'
import Library from '@/pages/Library'
import ArticlePage from '@/pages/ArticlePage'
import Query from '@/pages/Query'
import UploadPage from '@/pages/Upload'
import SettingsPage from '@/pages/Settings'
import MetadataPage from '@/pages/Metadata'
import ApiKeyGuide from '@/pages/ApiKeyGuide'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/library', label: 'Library', icon: BookOpen },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/query', label: 'Chat', icon: MessageSquare },
  { to: '/metadata', label: 'Metadata', icon: Database },
  { to: '/api-key', label: 'Get API Key', icon: KeyRound },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar() {
  const { theme, toggle } = useTheme()

  return (
    <aside className="w-[220px] min-h-screen bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-100 flex flex-col py-6 px-3 shrink-0 relative overflow-hidden">
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -right-16 w-48 h-48 bg-violet-500/[0.06] rounded-full blur-3xl pointer-events-none" />

      <div className="mb-8 px-3 relative">
        <div className="flex items-center gap-2.5">
          <img
            src={`${import.meta.env.BASE_URL}icon.png`}
            alt="Lit Review Agent"
            className="w-9 h-9 rounded-xl shadow-glow ring-1 ring-white/10"
          />
          <div>
            <span className="font-bold text-[13px] tracking-tight text-white block leading-tight">
              Lit Review
            </span>
            <span className="text-[11px] text-slate-400 font-medium">
              Agent · OpenRouter
            </span>
          </div>
        </div>
      </div>

      <div className="mx-3 mb-4 border-t border-white/[0.06]" />
      <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
        Navigation
      </p>

      <nav className="flex flex-col gap-0.5 relative">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200 relative',
                isActive
                  ? 'bg-white/[0.08] text-white'
                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-blue-400 to-violet-500 rounded-full" />
                )}
                <Icon className={cn('w-[18px] h-[18px] transition-colors duration-200', isActive ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300')} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto px-3 pt-6 space-y-3">
        <button
          type="button"
          onClick={toggle}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 border border-white/[0.08] transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5 text-slate-300" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <div className="border-t border-white/[0.06] pt-4">
          <p className="text-[10px] text-slate-600 font-medium">v2.0.0 · Standalone</p>
        </div>
      </div>
    </aside>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  return <div key={location.pathname} className="animate-fade-in">{children}</div>
}

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[#f8fafc] dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-[#f8fafc] dark:bg-slate-950 text-slate-900 dark:text-slate-100">
        <PageWrapper>{children}</PageWrapper>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/library" element={<Library />} />
          <Route path="/library/article/:id" element={<ArticlePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/query" element={<Query />} />
          <Route path="/metadata" element={<MetadataPage />} />
          <Route path="/api-key" element={<ApiKeyGuide />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

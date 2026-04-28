import { useState, useEffect } from 'react'
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Dashboard from './pages/Dashboard'
import WorkspaceDetail from './pages/WorkspaceDetail'
import Generate from './pages/Generate'
import MasterAdmin from './pages/MasterAdmin'
import ReviewQueue from './pages/ReviewQueue'
import Settings from './pages/Settings'

// Icons
const icons = {
  dashboard: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  ),
  content: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
    </svg>
  ),
  settings: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { to: '/content/generate', label: 'Generate' },
  { to: '/content/review', label: 'Review', badge: true },
  { to: '/content/admin', label: 'Bulk Generate' },
]

export default function App() {
  const location = useLocation()
  const [pendingCount, setPendingCount] = useState(0)
  const [dark, setDark] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('content-hub-dark') === 'true'
    }
    return false
  })
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('content-hub-dark', dark)
  }, [dark])

  useEffect(() => {
    if (!supabase) return
    const fetchCounts = async () => {
      const { data } = await supabase
        .from('generated_content')
        .select('status')
        .in('status', ['draft', 'in_review'])
      setPendingCount(data?.length || 0)
    }
    fetchCounts()
    const interval = setInterval(fetchCounts, 5000)
    return () => clearInterval(interval)
  }, [location.pathname])

  const isActive = (to) => {
    return location.pathname === to || location.pathname.startsWith(to + '/')
  }

  return (
    <div className={`min-h-screen flex ${dark ? 'bg-[#0f1117] text-gray-200' : 'bg-[#f6f7f9] text-gray-900'}`}>
      {/* Sidebar */}
      <aside className={`fixed top-0 left-0 h-full z-30 flex flex-col transition-all duration-200 ${
        sidebarCollapsed ? 'w-16' : 'w-56'
      } ${dark ? 'bg-[#161922] border-r border-gray-800' : 'bg-white border-r border-gray-200/80 shadow-[1px_0_0_rgba(15,23,42,0.02)]'}`}>
        {/* Logo */}
        <div className={`flex items-center h-16 px-4 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!sidebarCollapsed && (
            <Link to="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className={`font-semibold text-sm ${dark ? 'text-white' : 'text-gray-900'}`}>Content Hub</span>
            </Link>
          )}
          {sidebarCollapsed && (
            <Link to="/">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">C</span>
              </div>
            </Link>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
          {/* Dashboard */}
          <Link
            to="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/'
                ? dark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-700'
                : dark ? 'text-gray-200 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-indigo-700 hover:bg-indigo-50/60'
            } ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? 'Dashboard' : undefined}
          >
            <span className={location.pathname === '/' ? (dark ? 'text-indigo-400' : 'text-indigo-600') : ''}>{icons.dashboard}</span>
            {!sidebarCollapsed && <span>Dashboard</span>}
          </Link>

          {/* Content section header */}
          {!sidebarCollapsed && (
            <div className="pt-4 pb-1 px-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Content</span>
            </div>
          )}

          {/* Content nav items */}
          {NAV_ITEMS.map(item => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(item.to)
                  ? dark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-700'
                  : dark ? 'text-gray-200 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-indigo-700 hover:bg-indigo-50/60'
              } ${sidebarCollapsed ? 'justify-center' : ''}`}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {sidebarCollapsed && <span className={isActive(item.to) ? (dark ? 'text-indigo-400' : 'text-indigo-600') : ''}>{icons.content}</span>}
              {!sidebarCollapsed && <span>{item.label}</span>}
              {!sidebarCollapsed && item.badge && pendingCount > 0 && (
                <span className={`ml-auto text-xs min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5 font-medium ${
                  dark ? 'bg-red-500 text-white' : 'bg-rose-100 text-rose-700 ring-1 ring-inset ring-rose-200'
                }`}>
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          ))}
        </nav>

        {/* Bottom section */}
        <div className={`px-2 py-3 space-y-1 border-t ${dark ? 'border-gray-800' : 'border-gray-200/80'}`}>
          <Link
            to="/settings"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              location.pathname === '/settings'
                ? dark ? 'bg-indigo-500/15 text-indigo-400' : 'bg-indigo-50 text-indigo-700'
                : dark ? 'text-gray-200 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-indigo-700 hover:bg-indigo-50/60'
            } ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? 'Settings' : undefined}
          >
            {icons.settings}
            {!sidebarCollapsed && <span>Settings</span>}
          </Link>

          <button
            onClick={() => setDark(!dark)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
              dark ? 'text-gray-200 hover:text-white hover:bg-white/5' : 'text-gray-700 hover:text-indigo-700 hover:bg-indigo-50/60'
            } ${sidebarCollapsed ? 'justify-center' : ''}`}
            title={sidebarCollapsed ? (dark ? 'Light mode' : 'Dark mode') : undefined}
          >
            {dark ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
              </svg>
            )}
            {!sidebarCollapsed && <span>{dark ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors w-full ${
              dark ? 'text-gray-300 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-indigo-700 hover:bg-indigo-50/60'
            } ${sidebarCollapsed ? 'justify-center' : ''}`}
          >
            <svg className={`w-5 h-5 transition-transform ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5" />
            </svg>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`flex-1 transition-all duration-200 ${sidebarCollapsed ? 'ml-16' : 'ml-56'}`}>
        <div className="max-w-6xl mx-auto px-8 py-8">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/workspaces/:id" element={<WorkspaceDetail />} />
            <Route path="/content/generate" element={<Generate />} />
            <Route path="/content/review" element={<ReviewQueue />} />
            <Route path="/content/admin" element={<MasterAdmin />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </div>
      </main>
    </div>
  )
}

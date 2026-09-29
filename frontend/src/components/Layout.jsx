import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../utils/api'
import {
  Shield, LayoutDashboard, FolderOpen, Eye, Users, Radio,
  Map, ClipboardList, LogOut, Sun, Moon, Bell,
  AlertTriangle, Key, Timer
} from 'lucide-react'
import { initials } from '../utils/helpers'

export default function Layout() {
  const { user, logout, canAdmin, canSenior, currentOrg, orgs, switchOrg } = useAuth()
  const navigate = useNavigate()
  const [counts, setCounts]     = useState({})
  const [dark, setDark]         = useState(() => localStorage.getItem('hg_dark') === 'true')
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  useEffect(() => {
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])
  
  useEffect(() => {
    if (dark) document.documentElement.classList.add('dark')
    else      document.documentElement.classList.remove('dark')
    localStorage.setItem('hg_dark', dark)
  }, [dark])

  useEffect(() => {
    const load = async () => {
  try {
    const q = currentOrg?.id ? `?org_id=${currentOrg.id}` : ''
    const { data } = await api.get('/cases/meta/stats' + q)
    setCounts(data)
  } catch {}
}
load()
const t = setInterval(load, 30000)
return () => clearInterval(t)
}, [currentOrg])

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const nav = [
    { to: '/cases',       label: 'All Cases',    icon: FolderOpen,    count: counts.total },
    { to: '/dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
    { to: '/observables', label: 'Observables',  icon: Eye },
    { to: '/siem',        label: 'SIEM Feed',    icon: Radio,         count: counts.siemPending, urgent: true },
    { to: '/mitre',       label: 'MITRE Map',    icon: Map },
    { to: '/users',       label: 'Analysts',     icon: Users,         hidden: !canSenior },
    { to: '/audit',       label: 'Audit Log',    icon: ClipboardList, hidden: !canSenior },
    { to: '/sla', label: 'SLA Monitor', icon: Timer },
    { to: '/apikeys', label: 'API Keys', icon: Key },
]

  const statusLinks = [
    { to: '/cases?status=Open',        label: 'Open',        count: counts.open,     dot: 'bg-amber-500' },
    { to: '/cases?status=In Progress', label: 'In Progress', count: counts.progress, dot: 'bg-blue-500' },
    { to: '/cases?status=Resolved',    label: 'Resolved',    count: counts.resolved, dot: 'bg-green-500' },
  ]

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="w-[220px] flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center gap-2.5 px-4 border-b border-gray-200 dark:border-gray-800">
  <img src="/logo.svg" className="w-8 h-8 rounded-lg object-cover" alt="logo" />
  <div>
    <div className="text-sm font-semibold leading-none">Case Sphere</div>
    <div className="text-xs text-gray-400 mt-0.5">SOC Platform</div>
  </div>
</div>
        {/* Nav */}
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {/* Main nav */}
          <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Navigation
          </p>
          {nav.filter(n => !n.hidden).map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link ${isActive ? 'active' : ''}`
              }
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                  ${item.urgent
                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                  {item.count}
                </span>
              )}
            </NavLink>
          ))}

          {/* Case status shortcuts */}
          <p className="px-2 pt-4 pb-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            By Status
          </p>
          {statusLinks.map(s => (
            <NavLink key={s.to} to={s.to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <span className="flex-1 truncate">{s.label}</span>
              {s.count > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-medium">
                  {s.count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="border-t border-gray-200 dark:border-gray-800 p-3">
          <div className="relative">
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ background: user?.bg || '#E6F1FB', color: user?.color || '#185FA5' }}
              >
                {initials(user?.name)}
              </div>
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm font-medium truncate">{user?.name}</div>
                <div className="text-xs text-gray-400 truncate">{user?.role?.replace('_', ' ')}</div>
              </div>
              <ChevronDown className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden z-50">
                <div className="px-3 py-2 border-b border-gray-100 dark:border-gray-700">
                  <div className="text-xs font-medium">{user?.email}</div>
                </div>
                <button
                  onClick={() => { setDark(!dark); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {dark ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  onClick={() => { handleLogout(); setUserMenuOpen(false) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 flex items-center gap-3 px-6 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
          <div className="flex-1" />
          {counts.siemPending > 0 && (
            <button
              onClick={() => navigate('/siem')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              {counts.siemPending} SIEM Alert{counts.siemPending > 1 ? 's' : ''}
            </button>
          )}
          {counts.critical > 0 && (
            <button
              onClick={() => navigate('/cases?severity=Critical')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {counts.critical} Critical
            </button>
          )}
          <button onClick={() => setDark(!dark)} className="btn btn-ghost p-1.5">
            {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ToastProvider } from './components/ui'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import CasesPage from './pages/CasesPage'
import CaseDetailPage from './pages/CaseDetailPage'
import DashboardPage from './pages/DashboardPage'
import ObservablesPage from './pages/ObservablesPage'
import UsersPage from './pages/UsersPage'
import SiemPage from './pages/SiemPage'
import MitrePage from './pages/MitrePage'
import AuditPage from './pages/AuditPage'
import SlaPage from './pages/SlaPage'
import ApiKeysPage from './pages/ApiKeysPage'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        <span className="text-sm text-gray-500">Loading…</span>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user } = useAuth()
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Navigate to="/cases" replace />} />
        <Route path="cases"       element={<CasesPage />} />
        <Route path="cases/:id"   element={<CaseDetailPage />} />
        <Route path="dashboard"   element={<DashboardPage />} />
        <Route path="observables" element={<ObservablesPage />} />
        <Route path="users"       element={<UsersPage />} />
        <Route path="siem"        element={<SiemPage />} />
        <Route path="mitre"       element={<MitrePage />} />
        <Route path="audit"       element={<AuditPage />} />
	      <Route path="sla" element={<SlaPage />} />
	      <Route path="apikeys" element={<ApiKeysPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
      <ToastProvider />
    </AuthProvider>
  )
}

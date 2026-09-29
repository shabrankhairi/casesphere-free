import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import api from '../utils/api'

const AuthCtx = createContext(null)
export const useAuth = () => useContext(AuthCtx)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [ready, setReady]     = useState(false)

  // Restore session on mount
  useEffect(() => {
    api.post('/auth/refresh')
      .then(r => { api.defaults.headers.common['Authorization'] = `Bearer ${r.data.accessToken}`; return api.get('/auth/me') })
      .then(r => setUser(r.data))
      .catch(() => {})
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password })
    api.defaults.headers.common['Authorization'] = `Bearer ${data.accessToken}`
    setUser(data.user)
    return data
  }, [])

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {})
    delete api.defaults.headers.common['Authorization']
    setUser(null)
  }, [])

  const canAdmin  = user?.role === 'admin'
  const canSenior = ['admin', 'senior_analyst'].includes(user?.role)
  const canWrite  = ['admin', 'senior_analyst', 'analyst'].includes(user?.role)

  if (!ready) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <AuthCtx.Provider value={{ user, login, logout, canAdmin, canSenior, canWrite, currentOrg: null, orgs: [], switchOrg: () => {} }}>
      {children}
    </AuthCtx.Provider>
  )
}

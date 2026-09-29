import { useState, useEffect } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, Field, toast } from '../components/ui'
import { initials } from '../utils/helpers'
import { UserPlus, UserCheck, UserX } from 'lucide-react'

export default function UsersPage() {
  const [users, setUsers]     = useState([])
  const [showNew, setShowNew] = useState(false)
  const { canAdmin }          = useAuth()

  const load = () =>
    api.get('/users').then(r => setUsers(r.data)).catch(() => {})

  useEffect(() => { load() }, [])

  const toggleActive = async (id, active) => {
    if (!confirm(`${active ? 'Activate' : 'Deactivate'} this user?`)) return
    try {
      await api.patch(`/users/${id}`, { is_active: active })
      toast(`User ${active ? 'activated' : 'deactivated'}`, 'success')
      load()
    } catch (e) { toast(e.error || 'Failed', 'error') }
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">Analysts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {users.length} team member{users.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canAdmin && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
            <UserPlus className="w-3.5 h-3.5" /> Add User
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map(u => (
          <div key={u.id} className={`card p-4 transition-opacity ${!u.is_active ? 'opacity-50' : ''}`}>
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
                style={{ background: u.bg, color: u.color }}
              >
                {initials(u.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm truncate">{u.name}</span>
                  {!u.is_active && (
                    <span className="badge badge-closed text-[10px]">inactive</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 truncate mt-0.5">{u.email}</div>
                <span className="inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 capitalize">
                  {(u.role || '').replace('_', ' ')}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-center">
                <div className="text-lg font-semibold">{u.total_cases || 0}</div>
                <div className="text-xs text-gray-400">Total cases</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 text-center">
                <div className={`text-lg font-semibold ${(u.active_cases || 0) > 2 ? 'text-amber-600' : 'text-green-600'}`}>
                  {u.active_cases || 0}
                </div>
                <div className="text-xs text-gray-400">Active</div>
              </div>
            </div>

            {/* Recent cases */}
            {(u.recent_cases || []).length > 0 && (
              <div className="space-y-1 mb-3">
                {u.recent_cases.map(c => (
                  <div key={c.id} className="flex items-center gap-2 text-xs py-1">
                    <span className={`badge ${
                      c.severity === 'Critical' ? 'badge-critical' :
                      c.severity === 'High'     ? 'badge-high'     :
                      c.severity === 'Medium'   ? 'badge-medium'   : 'badge-low'
                    }`}>{c.severity}</span>
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{c.title}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Action */}
            {canAdmin && (
              <button
                onClick={() => toggleActive(u.id, !u.is_active)}
                className={`w-full btn text-xs justify-center mt-1 ${u.is_active ? 'btn-danger' : ''}`}
              >
                {u.is_active
                  ? <><UserX className="w-3.5 h-3.5" /> Deactivate</>
                  : <><UserCheck className="w-3.5 h-3.5" /> Activate</>}
              </button>
            )}
          </div>
        ))}
      </div>

      <NewUserModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); load() }}
      />
    </div>
  )
}

function NewUserModal({ open, onClose, onCreated }) {
  const [form, setForm]   = useState({ name: '', email: '', password: '', role: 'analyst' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.name || !form.email || !form.password) {
      toast('All fields are required', 'error'); return
    }
    if (form.password.length < 8) {
      toast('Password must be at least 8 characters', 'error'); return
    }
    setLoading(true)
    try {
      await api.post('/users', form)
      toast('User created successfully', 'success')
      setForm({ name: '', email: '', password: '', role: 'analyst' })
      onCreated()
    } catch (e) { toast(e.error || 'Failed to create user', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add team member">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name" required>
          <input
            className="input"
            placeholder="Jane Doe"
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Email" required>
          <input
            className="input"
            type="email"
            placeholder="jane@company.com"
            value={form.email}
            onChange={e => set('email', e.target.value)}
          />
        </Field>
        <Field label="Password (min 8 characters)" required>
          <input
            className="input"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={e => set('password', e.target.value)}
          />
        </Field>
        <Field label="Role">
          <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
            <option value="analyst">Analyst</option>
            <option value="senior_analyst">Senior Analyst</option>
            <option value="admin">Admin</option>
            <option value="readonly">Read-only</option>
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Creating…' : 'Create User'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

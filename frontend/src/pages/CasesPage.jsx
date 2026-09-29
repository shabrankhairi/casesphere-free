import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { SevBadge, StatusBadge, MitreBadge, AnalystChip, EmptyState, Spinner, Modal, Field, toast } from '../components/ui'
import { fmtDate } from '../utils/helpers'
import { Plus, Search, FolderOpen, Filter } from 'lucide-react'

export default function CasesPage() {
  const [cases, setCases]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [users, setUsers]       = useState([])
  const [showNew, setShowNew]   = useState(false)
  const [search, setSearch]     = useState('')
  const [sevFilter, setSev]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [analystFilter, setAnalyst] = useState('')
  const navigate     = useNavigate()
  const { canEdit, currentOrg } = useAuth()
  const [params] = useSearchParams()

  useEffect(() => {
    if (params.get('status'))   setStatus(params.get('status'))
    if (params.get('severity')) setSev(params.get('severity'))
  }, [params])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams()
      if (search)       q.set('q', search)
      if (sevFilter)    q.set('severity', sevFilter)
      if (statusFilter) q.set('status', statusFilter)
      if (analystFilter)q.set('assignee', analystFilter)
      if (currentOrg?.id) q.set('org_id', currentOrg.id)
      const [{ data: c }, { data: u }] = await Promise.all([
        api.get(`/cases?${q}`),
        api.get('/users').catch(() => ({ data: [] })),
      ])
      setCases(c); setUsers(u)
    } catch { toast('Failed to load cases', 'error') }
    finally  { setLoading(false) }
  }, [search, sevFilter, statusFilter, analystFilter])

  useEffect(() => { load() }, [load])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 h-8 text-xs"
            placeholder="Search cases…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <Filter className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <select className="select h-8 text-xs" value={sevFilter} onChange={e => setSev(e.target.value)}>
          <option value="">All severities</option>
          {['Critical','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select h-8 text-xs" value={statusFilter} onChange={e => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {['Open','In Progress','Resolved','Closed'].map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="select h-8 text-xs" value={analystFilter} onChange={e => setAnalyst(e.target.value)}>
          <option value="">All analysts</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <div className="flex-1" />
        {canEdit && (
          <button onClick={() => setShowNew(true)} className="btn btn-primary h-8 text-xs">
            <Plus className="w-3.5 h-3.5" /> New Case
          </button>
        )}
      </div>

      {/* Table */}
      <div className="table-container bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Spinner /></div>
        ) : cases.length === 0 ? (
          <EmptyState icon={FolderOpen} title="No cases found" description="Try adjusting your filters" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20">ID</th>
                <th>Title</th>
                <th className="w-24">Severity</th>
                <th className="w-28">Status</th>
                <th className="w-32">Assignee</th>
                <th className="w-36">MITRE</th>
                <th className="w-28">Created</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr key={c.id} onClick={() => navigate(`/cases/${c.id}`)}>
                  <td className="font-mono text-xs text-gray-400">{c.id}</td>
                  <td>
                    <div className="font-medium text-sm truncate max-w-xs">{c.title}</div>
                    <div className="flex gap-1 mt-0.5">
                      {(c.tags || []).map(t => (
                        <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">{t}</span>
                      ))}
                    </div>
                  </td>
                  <td><SevBadge value={c.severity} /></td>
                  <td><StatusBadge value={c.status} /></td>
                  <td>
                    <AnalystChip
                      name={c.assignee_name}
                      color={c.assignee_color}
                      bg={c.assignee_bg}
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(c.mitre || []).slice(0, 2).map(m => (
                        <MitreBadge key={m.technique} technique={m.technique} name={m.name} />
                      ))}
                      {(c.mitre || []).length > 2 && (
                        <span className="badge badge-mitre">+{c.mitre.length - 2}</span>
                      )}
                    </div>
                  </td>
                  <td className="text-xs text-gray-400">{fmtDate(c.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* New case modal */}
      <NewCaseModal
        open={showNew}
        onClose={() => setShowNew(false)}
        users={users}
        onCreated={id => { setShowNew(false); navigate(`/cases/${id}`) }}
      />
    </div>
  )
}

function NewCaseModal({ open, onClose, users, onCreated }) {
  const [form, setForm] = useState({ title:'', description:'', severity:'High', tlp:'AMBER', assignee_id:'' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.title.trim()) { toast('Title is required', 'error'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/cases', { ...form, assignee_id: form.assignee_id || undefined })
      toast(`Case ${data.id} created`, 'success')
      onCreated(data.id)
    } catch (e) { toast(e.error || 'Failed to create case', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create new case">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Title" required>
          <input className="input" placeholder="Incident title…" value={form.title} onChange={e => set('title', e.target.value)} />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[72px] resize-y" placeholder="Brief description…" value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Severity">
            <select className="select" value={form.severity} onChange={e => set('severity', e.target.value)}>
              {['Critical','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="TLP">
            <select className="select" value={form.tlp} onChange={e => set('tlp', e.target.value)}>
              {['RED','AMBER','GREEN'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Assign to">
          <select className="select" value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.role.replace('_',' ')}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Creating…' : 'Create Case'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

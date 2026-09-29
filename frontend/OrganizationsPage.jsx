import { useState, useEffect } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, Field, toast } from '../components/ui'
import { fmtTs } from '../utils/helpers'
import { Building2, Plus, Users, FolderOpen, Radio, Pencil, Trash2, ChevronRight } from 'lucide-react'

export default function OrganizationsPage() {
  const [orgs, setOrgs]       = useState([])
  const [selected, setSelected] = useState(null)
  const [members, setMembers]   = useState([])
  const [cases, setCases]       = useState([])
  const [alerts, setAlerts]     = useState([])
  const [showNew, setShowNew]   = useState(false)
  const [showEdit, setShowEdit] = useState(null)
  const { canAdmin }            = useAuth()

  const load = () => api.get('/organizations').then(r => setOrgs(r.data)).catch(() => {})

  useEffect(() => { load() }, [])

  const selectOrg = async (org) => {
    setSelected(org)
    try {
      const [m, c, a] = await Promise.all([
        api.get(`/organizations/${org.id}/members`),
        api.get(`/organizations/${org.id}/cases`),
        api.get(`/organizations/${org.id}/alerts`),
      ])
      setMembers(m.data)
      setCases(c.data)
      setAlerts(a.data)
    } catch {}
  }

  const deleteOrg = async (id, name) => {
    if (!confirm(`Delete organization "${name}"?`)) return
    try {
      await api.delete('/organizations/' + id)
      toast('Organization deleted', 'success')
      setSelected(null)
      load()
    } catch (e) { toast(e.error || 'Failed', 'error') }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar list */}
      <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold">Organizations</span>
            <span className="text-xs text-gray-400">({orgs.length})</span>
          </div>
          {canAdmin && (
            <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs p-1.5">
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
          {orgs.map(org => (
            <div
              key={org.id}
              onClick={() => selectOrg(org)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${selected?.id === org.id ? 'bg-brand-50 dark:bg-brand-900/20' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {org.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{org.name}</div>
                <div className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                  <span>{org.user_count || 0} members</span>
                  <span>·</span>
                  <span>{org.case_count || 0} cases</span>
                </div>
              </div>
              {!org.is_active && (
                <span className="badge badge-closed text-[10px]">inactive</span>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
            </div>
          ))}
          {!orgs.length && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No organizations
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-950">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Building2 className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-sm">Select an organization to view details</p>
          </div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-brand-500 flex items-center justify-center text-white text-lg font-bold">
                  {selected.name.slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h1 className="text-lg font-semibold">{selected.name}</h1>
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-2">
                    <span className="font-mono">/{selected.slug}</span>
                    <span>·</span>
                    <span>Created {fmtTs(selected.created_at)}</span>
                    {!selected.is_active && <span className="badge badge-closed text-[10px]">inactive</span>}
                  </div>
                  {selected.description && (
                    <p className="text-sm text-gray-500 mt-1">{selected.description}</p>
                  )}
                </div>
              </div>
              {canAdmin && (
                <div className="flex gap-2">
                  <button onClick={() => setShowEdit(selected)} className="btn text-xs">
                    <Pencil className="w-3.5 h-3.5" /> Edit
                  </button>
                  {selected.slug !== 'default' && (
                    <button onClick={() => deleteOrg(selected.id, selected.name)} className="btn btn-danger text-xs">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Members',       value: selected.user_count  || 0, icon: Users,      color: 'text-blue-600' },
                { label: 'Total Cases',   value: selected.case_count  || 0, icon: FolderOpen,  color: 'text-green-600' },
                { label: 'SIEM Alerts',   value: selected.alert_count || 0, icon: Radio,       color: 'text-amber-600' },
              ].map(s => (
                <div key={s.label} className="card p-4 flex items-center gap-3">
                  <s.icon className={`w-5 h-5 ${s.color} opacity-70`} />
                  <div>
                    <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Members */}
            <div className="card">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Members</span>
                  <span className="text-xs text-gray-400">({members.length})</span>
                </div>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {members.length ? members.map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
                      style={{ background: m.bg || '#E6F1FB', color: m.color || '#185FA5' }}>
                      {m.name.split(' ').map(x=>x[0]).join('').slice(0,2)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{m.name}</div>
                      <div className="text-xs text-gray-400">{m.email}</div>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                      {m.role.replace('_',' ')}
                    </span>
                    {!m.is_active && <span className="badge badge-closed text-[10px]">inactive</span>}
                  </div>
                )) : <p className="text-sm text-gray-400 px-4 py-4">No members</p>}
              </div>
            </div>

            {/* Recent Cases */}
            <div className="card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <FolderOpen className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Recent Cases</span>
                <span className="text-xs text-gray-400">({cases.length})</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {cases.slice(0,10).length ? cases.slice(0,10).map(c => (
                  <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs text-gray-400 w-16 flex-shrink-0">{c.id}</span>
                    <span className="text-sm flex-1 truncate">{c.title}</span>
                    <span className={`badge ${
                      c.severity==='Critical'?'badge-critical':
                      c.severity==='High'?'badge-high':
                      c.severity==='Medium'?'badge-medium':'badge-low'
                    }`}>{c.severity}</span>
                    <span className={`badge ${
                      c.status==='Open'?'badge-open':
                      c.status==='In Progress'?'badge-progress':
                      c.status==='Resolved'?'badge-resolved':'badge-closed'
                    }`}>{c.status}</span>
                  </div>
                )) : <p className="text-sm text-gray-400 px-4 py-4">No cases</p>}
              </div>
            </div>

            {/* SIEM Alerts */}
            <div className="card">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
                <Radio className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pending SIEM Alerts</span>
                <span className="text-xs text-gray-400">({alerts.length})</span>
              </div>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {alerts.slice(0,5).length ? alerts.slice(0,5).map(a => (
                  <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="font-mono text-xs text-gray-400 w-16 flex-shrink-0">{a.id}</span>
                    <span className="text-sm flex-1 truncate">{a.title}</span>
                    <span className={`badge ${
                      a.severity==='Critical'?'badge-critical':
                      a.severity==='High'?'badge-high':
                      a.severity==='Medium'?'badge-medium':'badge-low'
                    }`}>{a.severity}</span>
                    <span className="text-xs text-gray-400">{a.source}</span>
                  </div>
                )) : <p className="text-sm text-gray-400 px-4 py-4">No pending alerts</p>}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New org modal */}
      <OrgModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onSaved={() => { setShowNew(false); load() }}
      />

      {/* Edit org modal */}
      <OrgModal
        open={!!showEdit}
        org={showEdit}
        onClose={() => setShowEdit(null)}
        onSaved={() => { setShowEdit(null); load() }}
      />
    </div>
  )
}

function OrgModal({ open, org, onClose, onSaved }) {
  const [form, setForm]     = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (org) setForm({ name: org.name, description: org.description || '' })
    else     setForm({ name: '', description: '' })
  }, [org])

  const submit = async e => {
    e.preventDefault()
    if (!form.name.trim()) { toast('Name required', 'error'); return }
    setLoading(true)
    try {
      if (org) await api.patch('/organizations/' + org.id, form)
      else     await api.post('/organizations', form)
      toast(org ? 'Organization updated' : 'Organization created', 'success')
      onSaved()
    } catch (e) { toast(e.error || 'Failed', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={org ? 'Edit Organization' : 'New Organization'}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Organization name" required>
          <input className="input" placeholder="e.g. Acme Corp SOC" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Description">
          <textarea className="input min-h-[72px] resize-none" placeholder="Brief description…" value={form.description} onChange={e => set('description', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Saving…' : org ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
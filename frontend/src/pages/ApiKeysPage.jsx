import { useState, useEffect } from 'react'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { Modal, Field, toast } from '../components/ui'
import { fmtTs } from '../utils/helpers'
import { Key, Plus, Trash2, Copy, Eye, EyeOff, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react'

export default function ApiKeysPage() {
  const [keys, setKeys]       = useState([])
  const [showNew, setShowNew] = useState(false)
  const [newKey, setNewKey]   = useState(null)
  const { canAdmin }          = useAuth()

  const load = () => api.get('/apikeys').then(r => setKeys(r.data)).catch(() => {})
  useEffect(() => { load() }, [])

  const revoke = async (id, name) => {
    if (!confirm(`Revoke key "${name}"? This cannot be undone.`)) return
    try {
      await api.delete('/apikeys/' + id)
      toast('API key revoked', 'success')
      load()
    } catch (e) { toast(e.error || 'Failed', 'error') }
  }

  const toggle = async (id) => {
    try {
      await api.patch('/apikeys/' + id + '/toggle')
      load()
      toast('Key status updated', 'success')
    } catch (e) { toast(e.error || 'Failed', 'error') }
  }

  const copyKey = (key) => {
    navigator.clipboard.writeText(key)
    toast('API key copied to clipboard', 'success')
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-lg font-semibold">API Keys</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Manage API keys for SIEM integration
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn btn-primary text-xs">
          <Plus className="w-3.5 h-3.5" /> Generate Key
        </button>
      </div>

      {/* Integration guide */}
      <div className="card p-4 mb-6 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2">
              Integration Endpoint
            </p>
            <code className="block text-xs bg-white dark:bg-gray-900 px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200 mb-2">
              POST http://{window.location.hostname}/api/ingest
            </code>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-blue-600 dark:text-blue-400">
              <div>
                <strong>Headers:</strong>
                <pre className="mt-1 bg-white dark:bg-gray-900 px-2 py-1 rounded border border-blue-200 dark:border-blue-700 text-[10px]">{`X-API-Key: your-key
X-SIEM-Source: Splunk
X-Auto-Promote: true`}</pre>
              </div>
              <div>
                <strong>Supported formats:</strong>
                <div className="mt-1 flex flex-wrap gap-1">
                  {['Splunk','Elastic','Sentinel','QRadar','Wazuh','Darktrace','CEF','LEEF','Generic'].map(f => (
                    <span key={f} className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-[10px]">{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Keys table */}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="w-36">Key Preview</th>
              <th className="w-20">Status</th>
              <th className="w-24">Uses</th>
              <th className="w-36">Last Used</th>
              <th className="w-36">Expires</th>
              <th className="w-32">Owner</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {keys.map(k => (
              <tr key={k.id} className="cursor-default">
                <td>
                  <div className="flex items-center gap-2">
                    <Key className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="font-medium text-sm">{k.name}</span>
                  </div>
                </td>
                <td className="font-mono text-xs text-gray-500">{k.key_preview}</td>
                <td>
                  {k.is_active
                    ? <span className="badge badge-resolved text-[10px]">Active</span>
                    : <span className="badge badge-closed text-[10px]">Inactive</span>}
                </td>
                <td className="text-sm text-gray-500">{k.use_count || 0}</td>
                <td className="text-xs text-gray-400">{k.last_used_at ? fmtTs(k.last_used_at) : 'Never'}</td>
                <td className="text-xs text-gray-400">{k.expires_at ? fmtTs(k.expires_at) : 'Never'}</td>
                <td className="text-xs text-gray-500">{k.owner_name || '—'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    {canAdmin && (
                      <button
                        onClick={() => toggle(k.id)}
                        className="btn btn-ghost p-1 text-gray-400 hover:text-brand-500"
                        title={k.is_active ? 'Disable' : 'Enable'}
                      >
                        {k.is_active
                          ? <ToggleRight className="w-4 h-4 text-green-500" />
                          : <ToggleLeft className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      onClick={() => revoke(k.id, k.name)}
                      className="btn btn-ghost p-1 text-gray-400 hover:text-red-500"
                      title="Revoke"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!keys.length && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                  <Key className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No API keys yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create modal */}
      <NewKeyModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={key => { setShowNew(false); setNewKey(key); load(); }}
      />

      {/* Show new key modal */}
      {newKey && (
        <div className="modal-overlay">
          <div className="modal-box max-w-lg">
            <div className="p-5 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-base font-semibold text-green-600">API Key Created!</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>Save this key now!</strong> It will not be shown again after you close this dialog.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Your API Key</label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 font-mono break-all">
                    {newKey}
                  </code>
                  <button
                    onClick={() => copyKey(newKey)}
                    className="btn btn-primary text-xs flex-shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy
                  </button>
                </div>
              </div>
              <div className="text-xs text-gray-500 space-y-1">
                <p className="font-medium">Usage example:</p>
                <pre className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 text-[11px] overflow-x-auto">{`curl -X POST http://${window.location.hostname}/api/ingest \\
  -H "X-API-Key: ${newKey}" \\
  -H "X-SIEM-Source: YourSIEM" \\
  -H "X-Auto-Promote: true" \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Alert","severity":"High","raw":"..."}'`}</pre>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                onClick={() => setNewKey(null)}
                className="w-full btn btn-primary justify-center"
              >
                I have saved the key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NewKeyModal({ open, onClose, onCreated }) {
  const [form, setForm]     = useState({ name: '', expires_in_days: '' })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.name.trim()) { toast('Name required', 'error'); return }
    setLoading(true)
    try {
      const { data } = await api.post('/apikeys', {
        name:           form.name.trim(),
        expires_in_days: form.expires_in_days ? parseInt(form.expires_in_days) : undefined,
      })
      onCreated(data.key)
    } catch (e) { toast(e.error || 'Failed', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate API Key">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Key name" required>
          <input className="input" placeholder="e.g. Splunk Production" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
        </Field>
        <Field label="Expires in (days) — leave empty for no expiry">
          <input className="input" type="number" placeholder="e.g. 365" min="1" value={form.expires_in_days} onChange={e => set('expires_in_days', e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? 'Generating…' : 'Generate Key'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

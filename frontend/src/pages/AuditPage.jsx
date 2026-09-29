import { useState, useEffect } from 'react'
import api from '../utils/api'
import { fmtTs } from '../utils/helpers'
import { ClipboardList } from 'lucide-react'

const ACTION_COLOR = {
  LOGIN:         'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400',
  LOGOUT:        'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  LOGIN_FAILED:  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
  CASE_CREATE:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400',
  CASE_UPDATE:   'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
  CASE_DELETE:   'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
  USER_CREATE:   'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400',
  USER_UPDATE:   'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300',
  SIEM_PROMOTE:  'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400',
  AI_ANALYZE:    'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400',
  OBS_ADD:       'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400',
  MITRE_ADD:     'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400',
  PASSWORD_CHANGE:'bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400',
}

export default function AuditPage() {
  const [logs, setLogs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [entityF, setEntityF] = useState('')

  useEffect(() => {
    setLoading(true)
    const qs = entityF ? `entity_type=${entityF}&` : ''
    api.get(`/audit?${qs}limit=100`)
      .then(r => setLogs(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [entityF])

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <ClipboardList className="w-4 h-4 text-gray-400" />
        <span className="text-sm font-semibold">Audit Log</span>
        <select
          className="select h-8 text-xs"
          value={entityF}
          onChange={e => setEntityF(e.target.value)}
        >
          <option value="">All entities</option>
          <option value="case">Cases</option>
          <option value="user">Users</option>
          <option value="siem_alert">SIEM</option>
          <option value="observable">Observables</option>
        </select>
        <span className="text-xs text-gray-400 ml-auto">
          {logs.length} record{logs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="table-container bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !logs.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <ClipboardList className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No audit records found</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-36">Time</th>
                <th className="w-36">User</th>
                <th className="w-40">Action</th>
                <th className="w-36">Entity</th>
                <th className="w-32">IP Address</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="cursor-default hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="font-mono text-xs text-gray-400 whitespace-nowrap">
                    {fmtTs(l.created_at)}
                  </td>
                  <td>
  <div className="text-sm">{l.user_name || l.user_email?.split('@')[0] || 'system'}</div>
  <div className="text-xs text-gray-400 truncate">{l.user_email || ''}</div>
</td>
                  <td>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ACTION_COLOR[l.action] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                      {l.action}
                    </span>
                  </td>
                  <td className="text-xs text-gray-500 dark:text-gray-400">
                    <span className="font-medium">{l.entity_type}</span>
                    {l.entity_id && <span className="text-gray-400"> #{l.entity_id}</span>}
                  </td>
                  <td className="font-mono text-xs text-gray-400">
                    {l.ip_address || '—'}
                  </td>
                  <td className="text-xs text-gray-400 max-w-[200px] truncate">
  {(() => {
    try {
      const d = typeof l.details === 'string' ? JSON.parse(l.details) : l.details
      const str = JSON.stringify(d)
      if (!d || str === '{}' || str === 'null') return '—'
      return (
        <code className="text-xs bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded">
          {str.slice(0, 80)}
        </code>
      )
    } catch {
      return '—'
    }
  })()}
</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

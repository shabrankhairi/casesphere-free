import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { SevBadge, StatusBadge, AnalystChip } from '../components/ui'
import { fmtTs } from '../utils/helpers'
import { Clock, AlertTriangle, CheckCircle, ShieldAlert, Timer, TrendingUp } from 'lucide-react'

const FILTERS = [
  { value: 'all',      label: 'All' },
  { value: 'active',   label: 'Active' },
  { value: 'breached', label: 'Breached' },
  { value: 'at_risk',  label: 'At Risk' },
]

function SLABadge({ status, remaining, label, type }) {
  const cfg = {
    breached: { cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800',    icon: <ShieldAlert className="w-3 h-3" />, text: 'BREACHED' },
    warning:  { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800', icon: <AlertTriangle className="w-3 h-3" />, text: remaining !== null ? formatRemaining(remaining) + ' left' : 'AT RISK' },
    met:      { cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800', icon: <CheckCircle className="w-3 h-3" />, text: 'MET' },
    ok:       { cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',        icon: <Clock className="w-3 h-3" />, text: remaining !== null ? formatRemaining(remaining) + ' left' : 'OK' },
  }[status] || { cls: 'bg-gray-100 text-gray-500 border-gray-200', icon: null, text: '—' }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] text-gray-400 font-medium">{type}</span>
      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${cfg.cls}`}>
        {cfg.icon}{cfg.text}
      </span>
      <span className="text-[10px] text-gray-400">Target: {label}</span>
    </div>
  )
}

function formatRemaining(minutes) {
  if (minutes < 0) {
    const abs = Math.abs(minutes)
    if (abs < 60)   return '-' + abs + 'm'
    if (abs < 1440) return '-' + Math.round(abs/60*10)/10 + 'h'
    return '-' + Math.round(abs/1440*10)/10 + 'd'
  }
  if (minutes < 60)   return minutes + 'm'
  if (minutes < 1440) return Math.round(minutes/60*10)/10 + 'h'
  return Math.round(minutes/1440*10)/10 + 'd'
}

function SLAProgressBar({ sla }) {
  if (!sla) return null

  const ttrPct = sla.ttr.met_at
    ? 100
    : sla.ttr.remaining < 0
      ? 100
      : Math.max(0, 100 - (sla.ttr.remaining / sla.ttr.target) * 100)

  const tfrPct = sla.tfr.met_at
    ? 100
    : sla.tfr.remaining < 0
      ? 100
      : Math.max(0, 100 - (sla.tfr.remaining / sla.tfr.target) * 100)

  const ttrColor = { breached:'bg-red-500', warning:'bg-amber-500', met:'bg-green-500', ok:'bg-blue-500' }[sla.ttr.status] || 'bg-gray-300'
  const tfrColor = { breached:'bg-red-500', warning:'bg-amber-500', met:'bg-green-500', ok:'bg-blue-500' }[sla.tfr.status] || 'bg-gray-300'

  return (
    <div className="space-y-1.5">
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
          <span>TTR ({sla.ttr.label})</span>
          <span>{Math.round(ttrPct)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${ttrColor}`} style={{ width: ttrPct + '%' }} />
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
          <span>TFR ({sla.tfr.label})</span>
          <span>{Math.round(tfrPct)}%</span>
        </div>
        <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${tfrColor}`} style={{ width: tfrPct + '%' }} />
        </div>
      </div>
    </div>
  )
}

export default function SlaPage() {
  const [data, setData]       = useState({ cases: [], stats: {} })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState('all')
  const navigate = useNavigate()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: d } = await api.get('/sla?filter=' + filter)
      setData(d)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  // Auto refresh every 60 seconds
  useEffect(() => {
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const { cases, stats } = data

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-lg font-semibold">SLA Monitoring</h1>
            <p className="text-xs text-gray-400 mt-0.5">Track response and resolution time against SLA targets</p>
          </div>
          <button onClick={load} className="btn text-xs">
            <Timer className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {[
            { label: 'Total Tracked', value: stats.total     || 0, color: 'text-gray-700 dark:text-gray-200', icon: TrendingUp },
            { label: 'Active',        value: stats.active    || 0, color: 'text-blue-600',    icon: Clock },
            { label: 'At Risk',       value: stats.at_risk   || 0, color: 'text-amber-600',   icon: AlertTriangle },
            { label: 'Breached',      value: stats.breached  || 0, color: 'text-red-600',     icon: ShieldAlert },
            { label: 'SLA Met',       value: stats.met       || 0, color: 'text-green-600',   icon: CheckCircle },
          ].map(s => (
            <div key={s.label} className="card p-3 flex items-center gap-3">
              <s.icon className={`w-5 h-5 flex-shrink-0 ${s.color}`} />
              <div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-xs text-gray-400">{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mt-4 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                filter === f.value
                  ? 'bg-white dark:bg-gray-700 text-brand-500 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {f.label}
              {f.value === 'breached' && stats.breached > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-[10px] font-semibold">
                  {stats.breached}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* SLA table */}
      <div className="table-container bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !cases.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Clock className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No SLA data found</p>
            <p className="text-xs mt-1">Cases created from SIEM alerts will be tracked here</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20">Case</th>
                <th>Title</th>
                <th className="w-24">Severity</th>
                <th className="w-24">Status</th>
                <th className="w-32">Assignee</th>
                <th className="w-36">Created</th>
                <th className="w-40">Time to Respond</th>
                <th className="w-40">Time for Recommendation</th>
                <th className="w-48">Progress</th>
              </tr>
            </thead>
            <tbody>
              {cases.map(c => (
                <tr
                  key={c.id}
                  onClick={() => navigate('/cases/' + c.id)}
                  className={
                    (c.ttr_breached || c.tfr_breached)
                      ? 'bg-red-50/50 dark:bg-red-900/5'
                      : c.sla?.ttr.status === 'warning' || c.sla?.tfr.status === 'warning'
                        ? 'bg-amber-50/50 dark:bg-amber-900/5'
                        : ''
                  }
                >
                  <td className="font-mono text-xs text-gray-400">{c.id}</td>
                  <td>
                    <div className="font-medium text-sm truncate max-w-[200px]">{c.title}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{fmtTs(c.created_at)}</div>
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
                  <td className="text-xs text-gray-400">{fmtTs(c.created_at)}</td>
                  <td onClick={e => e.stopPropagation()}>
                    {c.sla ? (
                      <SLABadge
                        status={c.sla.ttr.status}
                        remaining={c.sla.ttr.remaining}
                        label={c.sla.ttr.label}
                        type="TTR"
                      />
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    {c.sla ? (
                      <SLABadge
                        status={c.sla.tfr.status}
                        remaining={c.sla.tfr.remaining}
                        label={c.sla.tfr.label}
                        type="TFR"
                      />
                    ) : <span className="text-xs text-gray-400">—</span>}
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <SLAProgressBar sla={c.sla} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* SLA Legend */}
      <div className="px-6 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 flex-shrink-0">
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-400">
          <span className="font-medium text-gray-500">SLA Targets:</span>
          <span>🔴 Critical — TTR: 20m · TFR: 3h</span>
          <span>🟡 High — TTR: 45m · TFR: 4h</span>
          <span>🔵 Medium — TTR: 90m · TFR: 12h</span>
          <span>🟢 Low — TTR: 3h · TFR: 24h</span>
          <span className="ml-auto">Auto-refresh: 60s</span>
        </div>
      </div>
    </div>
  )
}

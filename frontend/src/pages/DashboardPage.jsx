import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { fmtTs } from '../utils/helpers'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, Legend, PieChart, Pie
} from 'recharts'
import {
  FolderOpen, AlertTriangle, CheckCircle, TrendingUp,
  TrendingDown, Minus, Activity, Shield, Clock, Radio
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const PERIOD_OPTIONS = [
  { value: 'day',   label: 'Today' },
  { value: 'week',  label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year',  label: 'This Year' },
]

const SEV_COLOR = {
  Critical: '#ef4444',
  High:     '#f59e0b',
  Medium:   '#3b82f6',
  Low:      '#22c55e',
}

const STATUS_COLOR = {
  Open:        '#f59e0b',
  'In Progress':'#3b82f6',
  Resolved:    '#22c55e',
  Closed:      '#6b7280',
}

function ChangeChip({ value }) {
  if (value === 0) return (
    <span className="flex items-center gap-0.5 text-xs text-gray-400">
      <Minus className="w-3 h-3" /> 0%
    </span>
  )
  const up = value > 0
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${up ? 'text-red-500' : 'text-green-500'}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
      {up ? '+' : ''}{value}%
    </span>
  )
}

function StatCard({ label, value, change, color, icon: Icon, sub }) {
  return (
    <div className="card p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</span>
        {Icon && <Icon className={`w-4 h-4 opacity-40 ${color}`} />}
      </div>
      <div className="flex items-end justify-between">
        <span className={`text-3xl font-bold ${color}`}>{value ?? 0}</span>
        {change !== undefined && <ChangeChip value={change} />}
      </div>
      {sub !== undefined && (
        <div className="text-xs text-gray-400">
          {sub >= 0 ? '+' : ''}{sub} vs previous period
        </div>
      )}
    </div>
  )
}

// Format tanggal untuk chart
function fmtChartDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })
}

// Build trend data dari raw rows
function buildTrendData(rows, groupKey) {
  const map = {}
  rows.forEach(r => {
    const date = fmtChartDate(r.date)
    if (!map[date]) map[date] = { date }
    map[date][r[groupKey]] = parseInt(r.count) || 0
  })
  return Object.values(map)
}

export default function DashboardPage() {
  const [stats, setStats]   = useState(null)
  const [period, setPeriod] = useState('week')
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { currentOrg } = useAuth()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const orgQ = currentOrg?.id ? '&org_id=' + currentOrg.id : ''
const { data } = await api.get('/cases/meta/stats?period=' + period + orgQ + '&t=' + Date.now())
      setStats(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [period, currentOrg])

  useEffect(() => { load() }, [load])

  if (!stats) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const sevTrend    = buildTrendData(stats.trendBySeverity || [], 'severity')
  const statusTrend = buildTrendData(stats.trendByStatus   || [], 'status')

  const pieData = [
    { name: 'Critical', value: parseInt(stats.critical) || 0, color: '#ef4444' },
    { name: 'High',     value: parseInt(stats.high)     || 0, color: '#f59e0b' },
    { name: 'Medium',   value: parseInt(stats.medium)   || 0, color: '#3b82f6' },
    { name: 'Low',      value: parseInt(stats.low)      || 0, color: '#22c55e' },
  ].filter(d => d.value > 0)

  const ps = stats.periodStats || {}
  const ch = stats.changes     || {}

  const tooltipStyle = {
    fontSize: 12, borderRadius: 8,
    border: '1px solid #e5e7eb',
    backgroundColor: 'var(--bg, #fff)',
  }

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">

      {/* Header + period selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Security operations overview</p>
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                period === p.value
                  ? 'bg-white dark:bg-gray-700 text-brand-500 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Cases"
          value={stats.total}
          icon={FolderOpen}
          color="text-gray-700 dark:text-gray-200"
          change={ch.cases}
          sub={ps.newCases}
        />
        <StatCard
          label="Open Cases"
          value={stats.open}
          icon={AlertTriangle}
          color="text-amber-600"
          change={ch.open}
          sub={ps.newOpen}
        />
        <StatCard
          label="Critical"
          value={stats.critical}
          icon={Shield}
          color="text-red-600"
          change={ch.critical}
          sub={ps.newCritical}
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          icon={CheckCircle}
          color="text-green-600"
          change={ch.resolved}
          sub={ps.newResolved}
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.progress || 0}</div>
            <div className="text-xs text-gray-400">In Progress</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <div className="text-2xl font-bold">{stats.closed || 0}</div>
            <div className="text-xs text-gray-400">Closed</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-4 cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => navigate('/siem')}>
          <div className="w-10 h-10 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <Radio className="w-5 h-5 text-amber-500" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-600">{stats.siemPending || 0}</div>
            <div className="text-xs text-gray-400">SIEM Pending</div>
          </div>
        </div>
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Severity trend — area chart */}
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Cases by Severity — Trend
            </h2>
            <span className="text-xs text-gray-400">{PERIOD_OPTIONS.find(p => p.value === period)?.label}</span>
          </div>
          {sevTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={sevTrend}>
                <defs>
                  {Object.entries(SEV_COLOR).map(([k, c]) => (
                    <linearGradient key={k} id={'grad-'+k} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={c} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {Object.entries(SEV_COLOR).map(([k, c]) => (
                  <Area key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={2}
                    fill={`url(#grad-${k})`} dot={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
              No data for this period
            </div>
          )}
        </div>

        {/* Pie chart severity */}
        <div className="card p-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Severity Distribution
          </h2>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v, n]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
              No cases yet
            </div>
          )}
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Status trend bar chart */}
        <div className="card p-4">
          <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
            Cases by Status — Trend
          </h2>
          {statusTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={statusTrend} barSize={12}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                {Object.entries(STATUS_COLOR).map(([k, c]) => (
                  <Bar key={k} dataKey={k} stackId="a" fill={c} radius={k === 'Closed' ? [4,4,0,0] : [0,0,0,0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[180px] text-gray-400 text-sm">
              No data for this period
            </div>
          )}
        </div>

        {/* Activity feed */}
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              Recent Activity
            </h2>
            <span className="text-xs text-gray-400">{(stats.activity || []).length} events</span>
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800/60 overflow-y-auto max-h-[220px]">
            {(stats.activity || []).length ? (stats.activity || []).map((e, i) => (
              <div
                key={i}
                onClick={() => navigate('/cases/' + e.case_id)}
                className="flex gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-gray-400 flex-shrink-0">{e.case_id}</span>
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{e.event}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {fmtTs(e.created_at)}{e.user_name && ' · ' + e.user_name}
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-400 px-4 py-6 text-center">No recent activity</p>
            )}
          </div>
        </div>
      </div>

      {/* Change summary banner */}
      <div className="card p-4">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Period Summary — {PERIOD_OPTIONS.find(p => p.value === period)?.label} vs Previous
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'New Cases',    value: ps.newCases,    change: ch.cases,    color: 'text-gray-700 dark:text-gray-200' },
            { label: 'New Open',     value: ps.newOpen,     change: ch.open,     color: 'text-amber-600' },
            { label: 'New Critical', value: ps.newCritical, change: ch.critical, color: 'text-red-600' },
            { label: 'Resolved',     value: ps.newResolved, change: ch.resolved, color: 'text-green-600' },
          ].map(s => (
            <div key={s.label} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2.5">
              <div>
                <div className="text-xs text-gray-400">{s.label}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value ?? 0}</div>
              </div>
              <ChangeChip value={s.change ?? 0} />
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          * Green % = improvement (fewer cases/open), Red % = increase
        </p>
      </div>

    </div>
  )
}

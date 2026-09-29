import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { fmtTs } from '../utils/helpers'
import { Search, Eye, ShieldAlert, ShieldCheck, ShieldQuestion, Loader2 } from 'lucide-react'

export default function ObservablesPage() {
  const [obs, setObs]         = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch]   = useState('')
  const [typeF, setTypeF]     = useState('')
  const [vtResults, setVtResults] = useState({})
  const [vtLoading, setVtLoading] = useState({})
  const navigate = useNavigate()

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data: cases } = await api.get('/cases')
        const details = await Promise.all(
          cases.map(c => api.get('/cases/' + c.id).then(r => r.data).catch(() => null))
        )
        const all = details
          .filter(Boolean)
          .flatMap(c =>
            (c.observables || []).map(o => ({
              ...o,
              caseId:    c.id,
              caseTitle: c.title,
            }))
          )
        setObs(all)
      } catch (e) {
        console.error('Failed to load observables', e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const checkVT = async (obsId, type, value) => {
    const supported = ['IP', 'Domain', 'Hash', 'URL']
    if (!supported.includes(type)) {
      alert('VT check not supported for type: ' + type)
      return
    }
    setVtLoading(prev => ({ ...prev, [obsId]: true }))
    try {
      const { data } = await api.get('/virustotal/check?type=' + encodeURIComponent(type) + '&value=' + encodeURIComponent(value))
      setVtResults(prev => ({ ...prev, [obsId]: data }))
    } catch (e) {
      alert(e.error || 'VirusTotal check failed')
    } finally {
      setVtLoading(prev => ({ ...prev, [obsId]: false }))
    }
  }

  const filtered = obs.filter(o => {
    if (typeF  && o.type !== typeF) return false
    if (search && !o.value.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Warna row berdasarkan VT verdict
  const rowBg = (obsId) => {
    const vt = vtResults[obsId]
    if (!vt || !vt.found) return ''
    return {
      malicious:  'bg-red-50 dark:bg-red-900/10',
      suspicious: 'bg-amber-50 dark:bg-amber-900/10',
      clean:      'bg-green-50 dark:bg-green-900/10',
      unknown:    '',
    }[vt.verdict] || ''
  }

  const verdictBadge = (obsId) => {
    const vt = vtResults[obsId]
    if (vtLoading[obsId]) return (
      <span className="flex items-center gap-1 text-xs text-gray-400">
        <Loader2 className="w-3 h-3 animate-spin" /> Checking...
      </span>
    )
    if (!vt) return null
    if (!vt.found) return (
      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500">
        <ShieldQuestion className="w-3 h-3" /> Not found
      </span>
    )
    const cfg = {
      malicious:  { cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400', icon: <ShieldAlert className="w-3 h-3" />, label: `Malicious (${vt.stats.malicious}/${vt.stats.total})` },
      suspicious: { cls: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400', icon: <ShieldAlert className="w-3 h-3" />, label: `Suspicious (${vt.stats.suspicious}/${vt.stats.total})` },
      clean:      { cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400', icon: <ShieldCheck className="w-3 h-3" />, label: `Clean (0/${vt.stats.total})` },
      unknown:    { cls: 'bg-gray-100 dark:bg-gray-800 text-gray-500', icon: <ShieldQuestion className="w-3 h-3" />, label: 'Unknown' },
    }[vt.verdict] || { cls: 'bg-gray-100 text-gray-500', icon: null, label: vt.verdict }

    return (
  <button
    onClick={(e) => { e.stopPropagation(); window.open(vt.vt_link, '_blank') }}
    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium hover:opacity-80 transition-opacity ${cfg.cls}`}
    title="Click to view full VT report"
  >
    {cfg.icon}
    {cfg.label}
  </button>
)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pl-9 h-8 text-xs"
            placeholder="Search observables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="select h-8 text-xs" value={typeF} onChange={e => setTypeF(e.target.value)}>
          <option value="">All types</option>
          {['IP','Domain','Hash','URL','Email','Filename','Other'].map(t => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Malicious</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Suspicious</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400" /> Clean</span>
          <span>{filtered.length} results</span>
        </div>
      </div>

      <div className="table-container bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-20">Type</th>
                <th>Value</th>
                <th className="w-16">IOC</th>
                <th className="w-40">VT Result</th>
                <th className="w-20">Check</th>
                <th className="w-24">Case</th>
                <th className="w-40">Case Title</th>
                <th className="w-32">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o, i) => {
                const supported = ['IP','Domain','Hash','URL'].includes(o.type)
                return (
                  <tr
                    key={i}
                    onClick={() => navigate('/cases/' + o.caseId)}
                    className={rowBg(o.id)}
                  >
                    <td>
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                        {o.type}
                      </span>
                    </td>
                    <td className="font-mono text-xs text-gray-700 dark:text-gray-300 max-w-[200px] truncate">
                      {o.value}
                    </td>
                    <td>
                      {o.is_ioc && <span className="badge badge-critical text-[10px]">IOC</span>}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {verdictBadge(o.id)}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {supported && (
                        <button
                          onClick={() => checkVT(o.id, o.type, o.value)}
                          disabled={vtLoading[o.id]}
                          className="btn text-[10px] px-2 py-0.5 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 disabled:opacity-50"
                        >
                          {vtLoading[o.id]
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : '🔍 VT'}
                        </button>
                      )}
                    </td>
                    <td className="text-xs text-gray-400 font-mono">{o.caseId}</td>
                    <td className="text-xs text-gray-500 truncate max-w-[160px]">{o.caseTitle}</td>
                    <td className="text-xs text-gray-400">{fmtTs(o.created_at)}</td>
                  </tr>
                )
              })}
              {!filtered.length && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    <Eye className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No observables found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

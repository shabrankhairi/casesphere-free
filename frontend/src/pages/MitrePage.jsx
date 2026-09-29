import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'

export default function MitrePage() {
  const [data, setData] = useState([])
  const navigate = useNavigate()

  useEffect(() => {
    api.get('/cases/meta/mitre').then(r => setData(r.data)).catch(() => {})
  }, [])

  const max = Math.max(...data.map(r => parseInt(r.case_count)), 1)

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-lg font-semibold">MITRE ATT&CK Map</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Techniques observed across all cases
        </p>
      </div>

      {!data.length ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm font-medium">No MITRE techniques tagged yet</p>
          <p className="text-xs mt-1">Open a case and use "Assign" to tag techniques</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map(r => (
            <div key={r.technique} className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-xs font-semibold px-2 py-1 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                  {r.technique}
                </span>
                <span className={`text-sm font-semibold ${parseInt(r.case_count) >= 2 ? 'text-red-600' : 'text-amber-600'}`}>
                  {r.case_count} case{r.case_count > 1 ? 's' : ''}
                </span>
              </div>

              <p className="text-sm font-medium mb-3">{r.name}</p>

              <div className="flex flex-wrap gap-1 mb-3">
                {(r.case_ids || []).map(cid => (
                  <button
                    key={cid}
                    onClick={() => navigate(`/cases/${cid}`)}
                    className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-600 dark:hover:text-brand-400 transition-colors font-mono"
                  >
                    {cid}
                  </button>
                ))}
              </div>

              {/* Frequency bar */}
              <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all duration-500"
                  style={{ width: `${(parseInt(r.case_count) / max) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

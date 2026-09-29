import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { SevBadge, toast } from '../components/ui'
import { fmtTs } from '../utils/helpers'
import { RefreshCw, Radio, Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function SiemPage() {
    const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const { currentOrg, orgs } = useAuth()

  const load = async () => {
  setLoading(true)
  try {
    const q = currentOrg?.id ? `?org_id=${currentOrg.id}` : ''
    const r = await api.get('/siem' + (currentOrg?.id ? `?org_id=${currentOrg.id}` : ''))
    setAlerts(r.data)
  } catch { toast('Failed to load alerts', 'error') }
  finally { setLoading(false) }
}

  useEffect(() => { load() }, [])

  const promote = async id => {
    try {
      const { data } = await api.post(`/siem/${id}/promote`)
      toast(`Case ${data.case_id} created`, 'success')
      navigate(`/cases/${data.case_id}`)
    } catch (e) { toast(e.error || 'Failed to promote', 'error') }
  }

  const ingestTest = async () => {
  const alerts = [
    {
      title:    'Suspicious PowerShell execution on DC-01',
      severity: 'High',
      source:   'Microsoft Sentinel',
      raw:      'process=powershell.exe parent=winword.exe cmd="-enc JAB..." user=DOMAIN\\john.doe',
    },
    {
      title:    'Brute force attack detected on SSH port 22',
      severity: 'High',
      source:   'Elastic SIEM',
      raw:      'event.action=ssh_failed user=root count=145 src=185.220.101.45 dst=172.20.1.10',
    },
    {
      title:    'Outbound DNS query to known C2 domain',
      severity: 'Critical',
      source:   'Splunk SIEM',
      raw:      'dns.query="update-resolver.ru" src=10.0.5.88 dst=8.8.8.8 proto=UDP bytes=128',
    },
    {
      title:    'Ransomware behavior detected — mass file encryption',
      severity: 'Critical',
      source:   'Darktrace',
      raw:      'src=10.0.12.44 action=file_rename ext=.locked count=1247 path=\\\\fileserver\\shares',
    },
    {
      title:    'Lateral movement via SMB — pass the hash detected',
      severity: 'High',
      source:   'CrowdStrike',
      raw:      'event=pass_the_hash src_host=WS-0044 dst_host=DC-01 user=DOMAIN\\svc_backup hash=aad3b435b51404ee',
    },
    {
      title:    'Data exfiltration — large HTTPS upload to unknown IP',
      severity: 'Critical',
      source:   'Palo Alto NGFW',
      raw:      'src=10.0.8.21 dst=203.0.113.99 proto=HTTPS bytes_out=2.8GB duration=1823s app=ssl',
    },
    {
      title:    'New admin account created outside business hours',
      severity: 'Medium',
      source:   'Windows Event Log',
      raw:      'EventID=4720 user=backdoor_admin creator=SYSTEM time=02:34:11 host=DC-01',
    },
    {
      title:    'Port scan detected from internal host',
      severity: 'Medium',
      source:   'Snort IDS',
      raw:      'SRC=10.0.3.55 DST=10.0.0.0/8 PROTO=TCP FLAGS=SYN ports_scanned=1024 duration=30s',
    },
    {
      title:    'Malware download via HTTP — known malicious hash',
      severity: 'High',
      source:   'Proxy Log',
      raw:      'src=10.0.9.14 url=http://malware-cdn.xyz/payload.exe hash=a3f1b2c4d5e6f789 bytes=4096000',
    },
    {
      title:    'Privilege escalation — UAC bypass detected',
      severity: 'High',
      source:   'Microsoft Defender',
      raw:      'technique=T1548.002 process=fodhelper.exe parent=cmd.exe user=DOMAIN\\user01 host=WS-0088',
    },
  ]

  // Pilih random alert yang belum pernah dipakai
 const random = alerts[Math.floor(Math.random() * alerts.length)]

  // Pilih organization random dari semua org yang ada
  const randomOrg = orgs.length
    ? orgs[Math.floor(Math.random() * orgs.length)]
    : null

  try {
  await api.post('/siem', { ...random, org_id: currentOrg?.id || null })
  toast(`Test alert ingested: ${random.title} → ${currentOrg?.name || 'No Org'}`, 'success')
    load()
  } catch (e) {
    toast(e.error || 'Failed', 'error')
  }
}

  const dotColor = {
    Critical: 'bg-red-500',
    High:     'bg-amber-500',
    Medium:   'bg-blue-500',
    Low:      'bg-green-500',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <span className="text-sm font-semibold">SIEM Feed</span>
        <span className="text-xs text-gray-400">{alerts.length} pending alert{alerts.length !== 1 ? 's' : ''}</span>
        <div className="flex-1" />
        <button onClick={ingestTest} className="btn text-xs">
          <RefreshCw className="w-3.5 h-3.5" /> Ingest Test Alert
        </button>
      </div>

      <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-900">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !alerts.length ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <Radio className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">No pending SIEM alerts</p>
            <p className="text-xs mt-1">Click "Ingest Test Alert" to simulate one</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {alerts.map(a => (
              <div key={a.id} className="flex items-start gap-4 px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-2 ${dotColor[a.severity] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <SevBadge value={a.severity} />
                    <span className="font-medium text-sm">{a.title}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-1.5">
  {a.source} · {fmtTs(a.created_at)}
  {a.org_name && (
    <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400">
      <Building2 className="w-2.5 h-2.5" />
      {a.org_name}
    </span>
  )}
</div>
                  <code className="block text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg truncate">
                    {a.raw}
                  </code>
                </div>
                <button
                  onClick={() => promote(a.id)}
                  className="btn btn-primary text-xs flex-shrink-0"
                >
                  + Create Case
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

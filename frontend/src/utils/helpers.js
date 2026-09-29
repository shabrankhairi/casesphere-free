export const SEV_CLASS = {
  Critical: 'badge-critical',
  High:     'badge-high',
  Medium:   'badge-medium',
  Low:      'badge-low',
}

export const STATUS_CLASS = {
  'Open':        'badge-open',
  'In Progress': 'badge-progress',
  'Resolved':    'badge-resolved',
  'Closed':      'badge-closed',
}

export const TLP_CLASS = {
  RED:   'badge-tlp-red',
  AMBER: 'badge-tlp-amber',
  GREEN: 'badge-tlp-green',
}

export const SEV_DOT = {
  Critical: 'bg-red-500',
  High:     'bg-amber-500',
  Medium:   'bg-blue-500',
  Low:      'bg-green-500',
}

export function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' })
}

export function fmtTs(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('id-ID', {
    day:'2-digit', month:'short', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  })
}

export function initials(name = '') {
  return name.split(' ').map(x => x[0]).join('').toUpperCase().slice(0, 2)
}

export function guessObsType(val = '') {
  if (val.match(/^\d{1,3}(\.\d{1,3}){3}/))          return 'IP'
  if (val.includes('@'))                              return 'Email'
  if (val.startsWith('http'))                         return 'URL'
  if (val.length >= 32 && /^[0-9a-f]+$/i.test(val)) return 'Hash'
  if (val.match(/^[a-zA-Z0-9._-]+\.[a-zA-Z]{2,}$/)) return 'Domain'
  return 'Other'
}

export const MITRE_TECHNIQUES = {
  'T1566': 'Phishing',
  'T1078': 'Valid Accounts',
  'T1486': 'Data Encrypted for Impact',
  'T1021': 'Remote Services',
  'T1003': 'OS Credential Dumping',
  'T1041': 'Exfiltration Over C2',
  'T1110': 'Brute Force',
  'T1059': 'Command & Scripting Interpreter',
  'T1071': 'Application Layer Protocol',
  'T1027': 'Obfuscated Files or Information',
  'T1082': 'System Information Discovery',
  'T1083': 'File and Directory Discovery',
  'T1190': 'Exploit Public-Facing Application',
  'T1133': 'External Remote Services',
  'T1068': 'Exploitation for Privilege Escalation',
  'T1055': 'Process Injection',
  'T1105': 'Ingress Tool Transfer',
  'T1053': 'Scheduled Task/Job',
}

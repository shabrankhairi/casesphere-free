import { useEffect, useRef, useState } from 'react'
import { X, AlertCircle, CheckCircle, Info } from 'lucide-react'
import { SEV_CLASS, STATUS_CLASS, TLP_CLASS } from '../utils/helpers'
import clsx from 'clsx'

export function SevBadge({ value }) {
  return <span className={`badge ${SEV_CLASS[value] || 'badge-medium'}`}>{value}</span>
}
export function StatusBadge({ value }) {
  return <span className={`badge ${STATUS_CLASS[value] || 'badge-open'}`}>{value}</span>
}
export function TlpBadge({ value }) {
  return <span className={`badge ${TLP_CLASS[value] || 'badge-tlp-amber'}`}>TLP:{value}</span>
}
export function MitreBadge({ technique, name }) {
  return <span className="badge badge-mitre font-mono text-xs" title={name}>{technique}</span>
}
export function AnalystChip({ name, color, bg }) {
  if (!name) return <span className="text-xs text-gray-400">Unassigned</span>
  const ini = name.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase()
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
      <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0" style={{ background: bg||'#E6F1FB', color: color||'#185FA5' }}>{ini}</span>
      {name}
    </span>
  )
}
export function Spinner({ className='w-6 h-6' }) {
  return <div className={clsx('border-2 border-brand-500 border-t-transparent rounded-full animate-spin', className)} />
}
export function EmptyState({ icon: Icon, title, description }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      {Icon && <Icon className="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" />}
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      {description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{description}</p>}
    </div>
  )
}
export function Modal({ open, onClose, title, children, size='md' }) {
  const ref = useRef()
  useEffect(() => {
    if (open) ref.current?.focus()
    const esc = e => e.key==='Escape' && onClose?.()
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="modal-overlay" onClick={e => e.target===e.currentTarget && onClose?.()}>
      <div ref={ref} className={clsx('modal-box', size==='lg'&&'max-w-2xl', size==='sm'&&'max-w-sm')} tabIndex={-1}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-base font-semibold">{title}</h2>
          <button onClick={onClose} className="btn btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}
export function Field({ label, children, required }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

let _setToast = null
export function ToastProvider() {
  const [t, setT] = useState(null)
  _setToast = setT
  useEffect(() => {
    if (!t) return
    const id = setTimeout(() => setT(null), t.duration||3000)
    return () => clearTimeout(id)
  }, [t])
  if (!t) return null
  const icons = { success: CheckCircle, error: AlertCircle, info: Info }
  const Icon  = icons[t.type] || Info
  const cls   = {
    success: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700 text-green-800 dark:text-green-200',
    error:   'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-800 dark:text-red-200',
    info:    'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-800 dark:text-blue-200',
  }
  return (
    <div className={`fixed bottom-5 right-5 z-[9999] flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-lg text-sm font-medium max-w-xs ${cls[t.type]||cls.info}`}>
      <Icon className="w-4 h-4 flex-shrink-0" />{t.message}
    </div>
  )
}
export function toast(message, type='info', duration=3000) { _setToast?.({ message, type, duration }) }

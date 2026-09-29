import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../utils/api'
import { useAuth } from '../context/AuthContext'
import { SevBadge, StatusBadge, TlpBadge, MitreBadge, AnalystChip, Modal, Field, Spinner, toast } from '../components/ui'
import { fmtTs, MITRE_TECHNIQUES, guessObsType, initials } from '../utils/helpers'
import { ArrowLeft, Download, UserCog, Plus, Check, Circle, Clock, Shield, Tag, MessageSquare, Trash2, Paperclip, Upload, FileText, Image, File, Building2 } from 'lucide-react'

export default function CaseDetailPage() {
  const { id }          = useParams()
  const navigate        = useNavigate()
  const { canEdit, canAdmin } = useAuth()
  const [c, setC]       = useState(null)
  const [users, setUsers] = useState([])
  const [modal, setModal] = useState(null) // 'assign' | 'obs' | 'task'
  const [vtResults, setVtResults] = useState({})
  const [vtLoading, setVtLoading] = useState({})
  const [comments, setComments]     = useState([])
  const [comment, setComment]       = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [attachments, setAttachments]     = useState([])
  const [uploading, setUploading]         = useState(false)
  const [dragOver, setDragOver]           = useState(false)

  const load = async () => {
    try {
      const [{ data: cas }, { data: u }] = await Promise.all([
        api.get(`/cases/${id}`),
        api.get('/users').catch(() => ({ data: [] })),
      ])
      setC(cas); setUsers(u)
      // Load cached AI
      loadComments()
      loadAttachments()
    } catch { toast('Failed to load case', 'error'); navigate('/cases') }
  }

  useEffect(() => { load() }, [id])

  const toggleTask = async (tid, done) => {
    await api.patch(`/cases/${id}/tasks/${tid}`, { done })
    load()
  }

  const deleteCase = async () => {
    if (!confirm(`Delete case ${id}? This cannot be undone.`)) return
    try {
      await api.delete(`/cases/${id}`)
      toast('Case deleted', 'success')
      navigate('/cases')
    } catch (e) { toast(e.error || 'Delete failed', 'error') }
  }
const checkVT = async (obsId, type, value) => {
  // Hanya support tipe ini
  const supported = ['IP', 'Domain', 'Hash', 'URL']
  if (!supported.includes(type)) {
    toast(`VirusTotal check not supported for type: ${type}`, 'info')
    return
  }
  setVtLoading(prev => ({ ...prev, [obsId]: true }))
  try {
    const { data } = await api.get(`/virustotal/check?type=${encodeURIComponent(type)}&value=${encodeURIComponent(value)}`)
    setVtResults(prev => ({ ...prev, [obsId]: data }))
  } catch (e) {
    toast(e.error || 'VirusTotal check failed', 'error')
  } finally {
    setVtLoading(prev => ({ ...prev, [obsId]: false }))
  }
}
const loadComments = async () => {
  try {
    const { data } = await api.get(`/cases/${id}/comments`)
    setComments(data)
  } catch {}
}

const submitComment = async () => {
  if (!comment.trim()) return
  setSubmitting(true)
  try {
    await api.post(`/cases/${id}/comments`, { content: comment.trim() })
    setComment('')
    loadComments()
    toast('Comment added', 'success')
  } catch (e) { toast(e.error || 'Failed', 'error') }
  finally { setSubmitting(false) }
}

const deleteComment = async (cid) => {
  if (!confirm('Delete this comment?')) return
  try {
    await api.delete(`/cases/${id}/comments/${cid}`)
    loadComments()
    toast('Comment deleted', 'success')
  } catch (e) { toast(e.error || 'Failed', 'error') }
}
const loadAttachments = async () => {
  try {
    const { data } = await api.get(`/cases/${id}/attachments`)
    setAttachments(data)
  } catch {}
}

const uploadFiles = async (files) => {
  if (!files?.length) return
  setUploading(true)
  try {
    const formData = new FormData()
    Array.from(files).forEach(f => formData.append('files', f))
    await api.post(`/cases/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    })
    loadAttachments()
    load() // refresh timeline
    toast(`${files.length} file(s) uploaded`, 'success')
  } catch (e) {
    toast(e.error || 'Upload failed', 'error')
  } finally {
    setUploading(false)
  }
}

const deleteAttachment = async (attachId, name) => {
  if (!confirm(`Delete "${name}"?`)) return
  try {
    await api.delete(`/cases/${id}/attachments/${attachId}`)
    loadAttachments()
    toast('Attachment deleted', 'success')
  } catch (e) {
    toast(e.error || 'Failed', 'error')
  }
}

const downloadAttachment = (attachId, name) => {
  const token = sessionStorage.getItem('cs_token')
  const link  = document.createElement('a')
  link.href   = `/api/cases/${id}/attachments/${attachId}/download`
  link.setAttribute('download', name)
  // Add auth header via fetch
  fetch(link.href, { headers: { Authorization: 'Bearer ' + token } })
    .then(r => r.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob)
      link.href = url
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    })
}

const getFileIcon = (mimetype) => {
  if (mimetype?.startsWith('image/'))       return <Image className="w-4 h-4 text-blue-500" />
  if (mimetype?.includes('pdf'))            return <FileText className="w-4 h-4 text-red-500" />
  if (mimetype?.includes('text'))           return <FileText className="w-4 h-4 text-gray-500" />
  return <File className="w-4 h-4 text-gray-400" />
}

const formatSize = (bytes) => {
  if (bytes < 1024)         return bytes + ' B'
  if (bytes < 1024 * 1024)  return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

  if (!c) return <div className="flex items-center justify-center h-full"><Spinner /></div>

  const done = (c.tasks || []).filter(t => t.done).length

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-6 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 flex-shrink-0">
        <button onClick={() => navigate('/cases')} className="btn btn-ghost p-1.5 mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-gray-400 font-medium">{c.id}</span>
            <h1 className="text-base font-semibold truncate">{c.title}</h1>
          </div>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
  <SevBadge value={c.severity} />
  <StatusBadge value={c.status} />
  <TlpBadge value={c.tlp} />
  <AnalystChip name={c.assignee_name} color={c.assignee_color} bg={c.assignee_bg} />
  <span className="text-xs text-gray-400">by {c.created_by_name || '—'}</span>
  {c.org_name && (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
      <Building2 className="w-3 h-3" />
      {c.org_name}
    </span>
  )}
</div>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          {canEdit && <button onClick={() => setModal('assign')} className="btn text-xs"><UserCog className="w-3.5 h-3.5" /> Assign</button>}
{canAdmin && <button onClick={deleteCase} className="btn btn-danger text-xs">Delete</button>}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Description */}
        {c.description && (
          <div className="card p-4">
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{c.description}</p>
          </div>
        )}

        {/* MITRE */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">MITRE ATT&CK</span>
          </div>
          {(c.mitre || []).length ? (
            <div className="flex flex-wrap gap-2">
              {c.mitre.map(m => (
                <div key={m.technique} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                  <span className="font-mono text-xs font-semibold text-purple-700 dark:text-purple-400">{m.technique}</span>
                  <span className="text-xs text-purple-600 dark:text-purple-300">{m.name}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">None tagged — use Assign to add techniques</p>}
        </div>

        {/* Tasks + Observables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Tasks */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tasks</span>
                <span className="text-xs text-gray-400">{done}/{(c.tasks||[]).length}</span>
              </div>
              {canEdit && <button onClick={() => setModal('task')} className="btn btn-ghost p-1"><Plus className="w-3.5 h-3.5" /></button>}
            </div>
            {/* Progress bar */}
            <div className="h-1 bg-gray-100 dark:bg-gray-800">
              <div className="h-1 bg-brand-500 transition-all" style={{ width: c.tasks?.length ? `${done/c.tasks.length*100}%` : '0%' }} />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {(c.tasks || []).length ? c.tasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => canEdit && toggleTask(t.id, !t.done)}
                    className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors
                      ${t.done
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-gray-300 dark:border-gray-600 hover:border-brand-500'}`}
                    disabled={!canEdit}
                  >
                    {t.done && <Check className="w-2.5 h-2.5" />}
                  </button>
                  <span className={`text-sm flex-1 ${t.done ? 'line-through text-gray-400' : ''}`}>{t.title}</span>
                </div>
              )) : <p className="text-sm text-gray-400 px-4 py-3">No tasks</p>}
            </div>
          </div>

          {/* Observables */}
          <div className="card">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Observables</span>
                <span className="text-xs text-gray-400">{(c.observables||[]).length}</span>
              </div>
              {canEdit && <button onClick={() => setModal('obs')} className="btn btn-ghost p-1"><Plus className="w-3.5 h-3.5" /></button>}
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {(c.observables || []).length ? c.observables.map(o => {
  const vt      = vtResults[o.id]
  const loading = vtLoading[o.id]
  const supported = ['IP','Domain','Hash','URL'].includes(o.type)

  const verdictColor = {
    malicious:  'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    suspicious: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    clean:      'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    unknown:    'text-gray-500 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700',
  }

  const verdictIcon = {
    malicious:  '🔴',
    suspicious: '🟡',
    clean:      '🟢',
    unknown:    '⚪',
  }

  return (
    <div key={o.id} className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      {/* Row utama */}
      <div className="flex items-center gap-2.5">
        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 font-mono flex-shrink-0">
          {o.type}
        </span>
        <span className="font-mono text-xs flex-1 truncate text-gray-700 dark:text-gray-300" title={o.value}>
          {o.value}
        </span>
        {o.is_ioc && <span className="badge badge-critical text-[10px]">IOC</span>}

        {/* Tombol Check VT */}
        {supported && (
          <button
            onClick={() => checkVT(o.id, o.type, o.value)}
            disabled={loading}
            className="btn text-[10px] px-2 py-0.5 flex-shrink-0 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
            title="Check on VirusTotal"
          >
            {loading
              ? <span className="w-3 h-3 border border-purple-500 border-t-transparent rounded-full animate-spin" />
              : '🔍 VT'}
          </button>
        )}
      </div>

      {/* VT Result */}
      {vt && (
        <div className={`mt-2 ml-0 p-2.5 rounded-lg border text-xs ${verdictColor[vt.verdict] || verdictColor.unknown}`}>
          {!vt.found ? (
            <span>⚪ Not found in VirusTotal database</span>
          ) : (
            <div className="space-y-1.5">
              {/* Verdict + score */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">
                  {verdictIcon[vt.verdict]} {vt.verdict?.toUpperCase()}
                </span>
                <span className="font-mono font-bold">
                  {vt.stats.malicious}/{vt.stats.total} engines detected
                </span>
                {vt.score > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-black/10 font-mono">
                    Score: {vt.score}%
                  </span>
                )}
              </div>

              {/* Stats bar */}
              {vt.stats.total > 0 && (
                <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
                  {vt.stats.malicious > 0 && (
                    <div className="bg-red-500 rounded-full" style={{ width: `${vt.stats.malicious/vt.stats.total*100}%` }} />
                  )}
                  {vt.stats.suspicious > 0 && (
                    <div className="bg-amber-500" style={{ width: `${vt.stats.suspicious/vt.stats.total*100}%` }} />
                  )}
                  {vt.stats.harmless > 0 && (
                    <div className="bg-green-500" style={{ width: `${vt.stats.harmless/vt.stats.total*100}%` }} />
                  )}
                  {vt.stats.undetected > 0 && (
                    <div className="bg-gray-300 dark:bg-gray-600" style={{ width: `${vt.stats.undetected/vt.stats.total*100}%` }} />
                  )}
                </div>
              )}

              {/* Detail info */}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] opacity-80">
                <span>🔴 Malicious: {vt.stats.malicious}</span>
                <span>🟡 Suspicious: {vt.stats.suspicious}</span>
                <span>🟢 Harmless: {vt.stats.harmless}</span>
                <span>⚪ Undetected: {vt.stats.undetected}</span>
              </div>

              {/* Extra info per tipe */}
              {vt.country  && <div className="text-[11px] opacity-80">🌍 Country: {vt.country} {vt.as_owner && `· ASN: ${vt.as_owner}`}</div>}
              {vt.registrar && <div className="text-[11px] opacity-80">📋 Registrar: {vt.registrar}</div>}
              {vt.tags?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {vt.tags.map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-black/10 text-[10px]">{tag}</span>
                  ))}
                </div>
              )}
              {vt.last_analysis && (
                <div className="text-[11px] opacity-70">
                  Last scan: {new Date(vt.last_analysis).toLocaleDateString()}
                </div>
              )}

              {/* Link ke VT */}
              
                <button
  onClick={() => window.open(vt.vt_link, '_blank')}
  className="inline-flex items-center gap-1 text-[11px] underline opacity-70 hover:opacity-100"
>
  View full report on VirusTotal
</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}) : <p className="text-sm text-gray-400 px-4 py-3">No observables</p>}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="card">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Timeline</span>
          </div>
          <div className="px-4 py-3 space-y-3">
            {(c.timeline || []).map(e => (
              <div key={e.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-brand-500 mt-1.5 flex-shrink-0" />
                  <div className="w-px flex-1 bg-gray-100 dark:bg-gray-800 mt-1" />
                </div>
                <div className="pb-3 flex-1">
                  <p className="text-sm text-gray-700 dark:text-gray-300">{e.event}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {fmtTs(e.created_at)}{e.user_name && ` · ${e.user_name}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Comments / Discussion */}
      <div className="card mt-1">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <MessageSquare className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Discussion
          </span>
          <span className="text-xs text-gray-400">({comments.length})</span>
        </div>

        {/* Comment list */}
        <div className="divide-y divide-gray-50 dark:divide-gray-800/60">
          {comments.length ? comments.map(cm => (
            <div key={cm.id} className="flex items-start gap-3 px-4 py-3 group">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-0.5"
                style={{ background: cm.user_bg || '#E6F1FB', color: cm.user_color || '#185FA5' }}
              >
                {initials(cm.user_name || '?')}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{cm.user_name || 'Unknown'}</span>
                  <span className="text-xs text-gray-400">{fmtTs(cm.created_at)}</span>
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {cm.content}
                </p>
              </div>
              <button
                onClick={() => deleteComment(cm.id)}
                className="btn btn-ghost p-1 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                title="Delete comment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )) : (
            <p className="text-sm text-gray-400 px-4 py-6 text-center">
              No comments yet — start the discussion
            </p>
          )}
        </div>

        {/* Add comment */}
        {canEdit && (
          <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex gap-3">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 mt-1"
                style={{ background: '#E6F1FB', color: '#185FA5' }}
              >
                {initials(c?.assignee_name || 'U')}
              </div>
              <div className="flex-1">
                <textarea
                  className="input min-h-[72px] resize-none text-sm"
                  placeholder="Write a comment… (Enter to submit, Shift+Enter for new line)"
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      submitComment()
                    }
                  }}
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-gray-400">Enter to submit · Shift+Enter for new line</span>
                  <button
                    onClick={submitComment}
                    disabled={submitting || !comment.trim()}
                    className="btn btn-primary text-xs"
                  >
                    {submitting ? 'Posting…' : 'Post Comment'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Attachments / Evidence */}
<div className="card mt-1">
  <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
    <Paperclip className="w-4 h-4 text-gray-400" />
    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
      Evidence & Attachments
    </span>
    <span className="text-xs text-gray-400">({attachments.length})</span>
  </div>

  {/* Upload area */}
  {canEdit && (
    <div
      className={`m-4 border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${
        dragOver
          ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
          : 'border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        uploadFiles(e.dataTransfer.files)
      }}
      onClick={() => document.getElementById('file-input-' + id).click()}
    >
      <input
        id={'file-input-' + id}
        type="file"
        multiple
        className="hidden"
        onChange={e => uploadFiles(e.target.files)}
      />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Uploading...</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="w-8 h-8 text-gray-300 dark:text-gray-600" />
          <span className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Drop files here or click to upload
          </span>
          <span className="text-xs text-gray-400">
            Max 20MB per file · Images, PDF, ZIP, Office docs, logs
          </span>
        </div>
      )}
    </div>
  )}

  {/* Attachment list */}
  {attachments.length > 0 && (
    <div className="divide-y divide-gray-100 dark:divide-gray-800 px-4 pb-4">
      {attachments.map(a => (
        <div key={a.id} className="flex items-center gap-3 py-2.5 group">
          {/* Icon */}
          <div className="w-8 h-8 rounded-lg bg-gray-50 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
            {getFileIcon(a.mimetype)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{a.original_name}</div>
            <div className="text-xs text-gray-400 mt-0.5">
              {formatSize(a.size)} · {a.uploaded_by_name || 'Unknown'} · {new Date(a.created_at).toLocaleString('id-ID')}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={() => downloadAttachment(a.id, a.original_name)}
              className="btn btn-ghost p-1.5 text-gray-400 hover:text-brand-500"
              title="Download"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {canEdit && (
              <button
                onClick={() => deleteAttachment(a.id, a.original_name)}
                className="btn btn-ghost p-1.5 text-gray-400 hover:text-red-500"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )}

  {/* Empty state */}
  {!attachments.length && !canEdit && (
    <p className="text-sm text-gray-400 px-4 py-6 text-center">No attachments</p>
  )}
</div>
      {/* Modals */}
      <AssignModal open={modal === 'assign'} onClose={() => setModal(null)} c={c} users={users} onSaved={() => { setModal(null); load() }} />
      <AddObsModal open={modal === 'obs'} onClose={() => setModal(null)} caseId={id} onSaved={() => { setModal(null); load() }} />
      <AddTaskModal open={modal === 'task'} onClose={() => setModal(null)} caseId={id} onSaved={() => { setModal(null); load() }} />
    </div>
  )
}

function AssignModal({ open, onClose, c, users, onSaved }) {
  const [form, setForm] = useState({})
  const [loading, setLoading] = useState(false)
  useEffect(() => { if (c) setForm({ assignee_id: c.assignee_id||'', status: c.status, severity: c.severity, mitre: '' }) }, [c])
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    setLoading(true)
    try {
      await api.patch(`/cases/${c.id}`, { assignee_id: form.assignee_id||null, status: form.status, severity: form.severity })
      if (form.mitre) {
        const [technique, name] = form.mitre.split('|')
        await api.post(`/cases/${c.id}/mitre`, { technique, name })
      }
      toast('Case updated', 'success'); onSaved()
    } catch (e) { toast(e.error || 'Update failed', 'error') }
    finally { setLoading(false) }
  }

  const existingMitre = (c?.mitre||[]).map(m => m.technique)

  return (
    <Modal open={open} onClose={onClose} title={`Assign — ${c?.id}`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Analyst">
          <select className="select" value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)}>
            <option value="">Unassigned</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.active_cases||0} active)</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
              {['Open','In Progress','Resolved','Closed'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select className="select" value={form.severity} onChange={e => set('severity', e.target.value)}>
              {['Critical','High','Medium','Low'].map(s => <option key={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Tag MITRE technique">
          <select className="select" value={form.mitre} onChange={e => set('mitre', e.target.value)}>
            <option value="">— Select technique —</option>
            {Object.entries(MITRE_TECHNIQUES).filter(([k]) => !existingMitre.includes(k)).map(([k, v]) => (
              <option key={k} value={`${k}|${v}`}>{k} — {v}</option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddObsModal({ open, onClose, caseId, onSaved }) {
  const [form, setForm] = useState({ type: 'IP', value: '', is_ioc: false })
  const [loading, setLoading] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const submit = async e => {
    e.preventDefault()
    if (!form.value.trim()) { toast('Value required', 'error'); return }
    setLoading(true)
    try {
      await api.post(`/cases/${caseId}/observables`, form)
      toast('Observable added', 'success'); onSaved()
    } catch (e) { toast(e.error || 'Failed', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add observable">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Type">
          <select className="select" value={form.type} onChange={e => set('type', e.target.value)}>
            {['IP','Domain','Hash','URL','Email','Filename','Other'].map(t => <option key={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Value" required>
          <input
            className="input"
            placeholder="e.g. 185.220.101.45"
            value={form.value}
            onChange={e => { set('value', e.target.value); set('type', guessObsType(e.target.value)) }}
          />
        </Field>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_ioc}
            onChange={e => set('is_ioc', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-brand-500"
          />
          <span className="text-sm">Mark as IOC (Indicator of Compromise)</span>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">{loading ? 'Adding…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  )
}

function AddTaskModal({ open, onClose, caseId, onSaved }) {
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async e => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      await api.post(`/cases/${caseId}/tasks`, { title: title.trim() })
      setTitle(''); toast('Task added', 'success'); onSaved()
    } catch (e) { toast(e.error || 'Failed', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add task" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Task description" required>
          <input className="input" placeholder="e.g. Isolate affected system" value={title} onChange={e => setTitle(e.target.value)} autoFocus />
        </Field>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" disabled={loading || !title.trim()} className="btn btn-primary">{loading ? 'Adding…' : 'Add'}</button>
        </div>
      </form>
    </Modal>
  )
}


'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import {
  Plus, X, FileText, FileImage, File as FileIcon, FolderOpen, Package,
  ExternalLink, Trash2, Pencil, Upload, AlertCircle, Loader2, ShieldCheck,
  FileBadge, FileSignature, Map, IdCard, FileCheck,
} from 'lucide-react'

const CATEGORIES = ['Insurance', 'License', 'W-9', 'Site Plans', 'ID/Legal', 'Permits', 'Other'] as const

const CATEGORY_ICONS: Record<string, any> = {
  'Insurance': ShieldCheck,
  'License': FileBadge,
  'W-9': FileSignature,
  'Site Plans': Map,
  'ID/Legal': IdCard,
  'Permits': FileCheck,
  'Other': FileIcon,
}

const CATEGORY_COLORS: Record<string, string> = {
  'Insurance': 'bg-info-tint border-info/30 text-info',
  'License': 'bg-success-tint border-success/30 text-success',
  'W-9': 'bg-special-tint border-special/30 text-special',
  'Site Plans': 'bg-warn-tint border-warn/30 text-warn',
  'ID/Legal': 'bg-danger-tint border-rose-200 text-rose-700',
  'Permits': 'bg-teal-50 border-teal-200 text-teal-700',
  'Other': 'bg-surface border-line text-muted-fg',
}

interface CompanyFile {
  id: string
  name: string
  category: string
  file_url: string
  file_type: string | null
  size_bytes: number | null
  created_at: string
}

interface Packet {
  id: string
  name: string
  description: string | null
  file_ids: string[]
  created_at: string
}

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileTypeIcon(fileType: string | null) {
  if (fileType?.startsWith('image/')) return FileImage
  if (fileType === 'application/pdf') return FileText
  return FileIcon
}

export default function FilesPage() {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const packetFileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<'files' | 'packets'>('files')
  const [files, setFiles] = useState<CompanyFile[]>([])
  const [packets, setPackets] = useState<Packet[]>([])
  const [complianceDocs, setComplianceDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('All')

  // Upload modal
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadCategory, setUploadCategory] = useState<string>('Other')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  // Edit file modal
  const [editingFile, setEditingFile] = useState<CompanyFile | null>(null)
  const [editName, setEditName] = useState('')
  const [editCategory, setEditCategory] = useState<string>('Other')
  const [savingFile, setSavingFile] = useState(false)
  const [editFileError, setEditFileError] = useState('')

  // Packet modal (create + edit)
  const [showPacketForm, setShowPacketForm] = useState(false)
  const [editingPacket, setEditingPacket] = useState<Packet | null>(null)
  const [packetName, setPacketName] = useState('')
  const [packetDescription, setPacketDescription] = useState('')
  const [packetFileIds, setPacketFileIds] = useState<string[]>([])
  const [savingPacket, setSavingPacket] = useState(false)
  const [packetError, setPacketError] = useState('')
  const [packetUploading, setPacketUploading] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchAll() {
    const token = await getToken()
    const res = await fetch('/api/files', { headers: { Authorization: `Bearer ${token}` } })
    const json = await res.json().catch(() => ({}))
    if (res.ok) {
      setFiles(json.files ?? [])
      setPackets(json.packets ?? [])
      setComplianceDocs(json.complianceDocs ?? [])
      setFetchError('')
    } else {
      setFetchError(json.error ?? `Error ${res.status}`)
    }
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  // ---------- Files ----------
  function resetUpload() {
    setUploadFile(null); setUploadName(''); setUploadCategory('Other'); setUploadError('')
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile) { setUploadError('Please choose a file'); return }
    setUploading(true)
    const token = await getToken()
    const form = new FormData()
    form.append('file', uploadFile)
    form.append('name', uploadName || uploadFile.name)
    form.append('category', uploadCategory)
    const res = await fetch('/api/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setUploadError(json.error ?? `Upload failed (${res.status})`)
      setUploading(false)
      return
    }
    setUploading(false)
    resetUpload()
    setShowUpload(false)
    fetchAll()
  }

  async function deleteFile(file: CompanyFile) {
    if (!confirm(`Delete "${file.name}"? It will also be removed from any packets.`)) return
    const token = await getToken()
    const res = await fetch(`/api/files/${file.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setFetchError(json.error ?? `Delete failed (${res.status})`)
      return
    }
    fetchAll()
  }

  function openEditFile(file: CompanyFile) {
    setEditingFile(file)
    setEditName(file.name)
    setEditCategory(file.category)
    setEditFileError('')
  }

  async function saveEditFile(e: React.FormEvent) {
    e.preventDefault()
    if (!editingFile) return
    setSavingFile(true)
    const token = await getToken()
    const res = await fetch(`/api/files/${editingFile.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: editName, category: editCategory }),
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setEditFileError(json.error ?? `Save failed (${res.status})`)
      setSavingFile(false)
      return
    }
    setSavingFile(false)
    setEditingFile(null)
    fetchAll()
  }

  // ---------- Packets ----------
  function openNewPacket() {
    setEditingPacket(null)
    setPacketName('')
    setPacketDescription('')
    setPacketFileIds([])
    setPacketError('')
    setShowPacketForm(true)
  }

  function openEditPacket(packet: Packet) {
    setEditingPacket(packet)
    setPacketName(packet.name)
    setPacketDescription(packet.description ?? '')
    setPacketFileIds(Array.isArray(packet.file_ids) ? packet.file_ids : [])
    setPacketError('')
    setShowPacketForm(true)
  }

  function togglePacketFile(fileId: string) {
    setPacketFileIds(ids => ids.includes(fileId) ? ids.filter(id => id !== fileId) : [...ids, fileId])
  }

  // Upload a brand-new file directly from the packet editor and auto-add it to the packet
  async function uploadIntoPacket(file: File) {
    setPacketUploading(true)
    setPacketError('')
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    form.append('name', file.name.replace(/\.[^.]+$/, ''))
    form.append('category', 'Other')
    const res = await fetch('/api/files', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      setPacketError(json.error ?? `Upload failed (${res.status})`)
      setPacketUploading(false)
      return
    }
    // Refresh library and auto-select the new file
    const newFile: CompanyFile | undefined = json.file
    if (newFile) {
      setFiles(prev => [newFile, ...prev])
      setPacketFileIds(ids => ids.includes(newFile.id) ? ids : [...ids, newFile.id])
    } else {
      await fetchAll()
    }
    setPacketUploading(false)
  }

  async function savePacket(e: React.FormEvent) {
    e.preventDefault()
    if (!packetName.trim()) { setPacketError('Packet name is required'); return }
    setSavingPacket(true)
    const token = await getToken()
    const payload = { name: packetName.trim(), description: packetDescription, file_ids: packetFileIds }
    const res = await fetch(
      editingPacket ? `/api/files/packets/${editingPacket.id}` : '/api/files/packets',
      {
        method: editingPacket ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      },
    )
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setPacketError(json.error ?? `Save failed (${res.status})`)
      setSavingPacket(false)
      return
    }
    setSavingPacket(false)
    setShowPacketForm(false)
    fetchAll()
  }

  async function deletePacket(packet: Packet) {
    if (!confirm(`Delete packet "${packet.name}"? Files themselves will not be deleted.`)) return
    const token = await getToken()
    const res = await fetch(`/api/files/packets/${packet.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setFetchError(json.error ?? `Delete failed (${res.status})`)
      return
    }
    fetchAll()
  }

  function packetFiles(packet: Packet): CompanyFile[] {
    const ids = Array.isArray(packet.file_ids) ? packet.file_ids : []
    return ids.map(id => files.find(f => f.id === id)).filter(Boolean) as CompanyFile[]
  }

  function openAll(packet: Packet) {
    packetFiles(packet).forEach(f => window.open(f.file_url, '_blank', 'noopener,noreferrer'))
  }

  const visibleFiles = categoryFilter === 'All' ? files : files.filter(f => f.category === categoryFilter)

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="border-b border-line-soft px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Upload File</h2>
              <button onClick={() => { setShowUpload(false); resetUpload() }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>File</Label>
                  <label className={cn('flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm cursor-pointer transition-colors',
                      uploadFile ? 'border-green-300 bg-success-tint text-success' : 'border-accent/40 bg-accent-tint/40 text-accent-fg hover:border-accent')}>
                    {uploadFile
                      ? <><FileText className="h-4 w-4" /><span className="truncate">{uploadFile.name}</span><span className="ml-auto text-xs">{formatSize(uploadFile.size)}</span></>
                      : <><Upload className="h-4 w-4" /><span className="font-medium">Choose a file to upload</span></>}
                    <input ref={fileRef} type="file" className="sr-only"
                      onChange={e => {
                        const f = e.target.files?.[0] ?? null
                        setUploadFile(f)
                        if (f && !uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ''))
                      }} />
                  </label>
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input placeholder="e.g. General Liability Certificate" value={uploadName} onChange={e => setUploadName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <SearchableSelect value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </SearchableSelect>
                </div>
              </div>
              <div className="border-t border-line-soft px-6 py-4 space-y-2">
                {uploadError && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{uploadError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => { setShowUpload(false); resetUpload() }}>Cancel</Button>
                  <Button type="submit" disabled={uploading}>
                    {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</> : 'Upload'}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit file modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="border-b border-line-soft px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit File</h2>
              <button onClick={() => setEditingFile(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEditFile}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <SearchableSelect value={editCategory} onChange={e => setEditCategory(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </SearchableSelect>
                </div>
              </div>
              <div className="border-t border-line-soft px-6 py-4 space-y-2">
                {editFileError && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{editFileError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setEditingFile(null)}>Cancel</Button>
                  <Button type="submit" disabled={savingFile}>{savingFile ? 'Saving...' : 'Save'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Packet modal */}
      {showPacketForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-panel border-b border-line-soft px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-ink">{editingPacket ? 'Edit Packet' : 'New Packet'}</h2>
              <button onClick={() => setShowPacketForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={savePacket}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Packet Name</Label>
                  <Input placeholder="e.g. Permit Submission Packet" value={packetName} onChange={e => setPacketName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <textarea rows={2} placeholder="What this packet is for..." value={packetDescription} onChange={e => setPacketDescription(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none resize-none" />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Files in this packet ({packetFileIds.length} selected)</Label>
                    <label className={cn('inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:text-accent-fg', packetUploading && 'opacity-50 pointer-events-none')}>
                      {packetUploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...</> : <><Upload className="h-3.5 w-3.5" /> Upload new file</>}
                      <input ref={packetFileRef} type="file" className="sr-only"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadIntoPacket(f); e.target.value = '' }} />
                    </label>
                  </div>
                  {files.length === 0 ? (
                    <p className="text-sm text-faint py-3">No files yet — use “Upload new file” above to add one to this packet.</p>
                  ) : (
                    <div className="rounded-lg border border-line divide-y divide-line-soft max-h-64 overflow-y-auto">
                      {files.map(file => {
                        const checked = packetFileIds.includes(file.id)
                        return (
                          <label key={file.id} className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface transition-colors', checked && 'bg-accent-tint/50')}>
                            <input type="checkbox" checked={checked} onChange={() => togglePacketFile(file.id)}
                              className="h-4 w-4 rounded border-muted2 text-accent-fg focus:ring-accent accent-[#C9F24A]" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-ink-soft truncate">{file.name}</p>
                              <p className="text-xs text-faint">{file.category}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="sticky bottom-0 bg-panel border-t border-line-soft px-6 py-4 space-y-2">
                {packetError && <p className="text-xs text-danger flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{packetError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowPacketForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={savingPacket}>{savingPacket ? 'Saving...' : editingPacket ? 'Save Changes' : 'Create Packet'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Files</h1>
          <p className="text-sm text-muted-fg mt-0.5">Company documents and ready-to-go submission packets.</p>
        </div>
        {tab === 'files'
          ? <Button onClick={() => setShowUpload(true)} className="self-start sm:self-auto"><Plus className="h-4 w-4" /> Upload File</Button>
          : <Button onClick={openNewPacket} className="self-start sm:self-auto"><Plus className="h-4 w-4" /> New Packet</Button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-line">
        {([['files', 'All Files', FolderOpen], ['packets', 'Packets', Package]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-accent text-accent-fg' : 'border-transparent text-muted-fg hover:text-ink-soft')}>
            <Icon className="h-4 w-4" />{label}
            <span className="text-xs text-faint ml-0.5">{key === 'files' ? files.length : packets.length}</span>
          </button>
        ))}
      </div>

      {fetchError && (
        <div className="rounded-lg bg-danger-tint border border-danger/30 px-4 py-3 text-sm text-danger flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Something went wrong: <strong>{fetchError}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : tab === 'files' ? (
        <>
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            {['All', ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  categoryFilter === c
                    ? 'bg-accent border-accent text-accent-ink'
                    : 'bg-panel border-line text-muted-fg hover:border-accent')}>
                {c}
              </button>
            ))}
          </div>

          {/* Compliance docs pulled from projects */}
          {complianceDocs.length > 0 && (categoryFilter === 'All' || ['Insurance', 'License', 'W-9'].includes(categoryFilter)) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">From Compliance</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {complianceDocs
                  .filter(d => {
                    if (categoryFilter === 'All') return true
                    if (categoryFilter === 'Insurance') return d.type === 'coi' || d.type === 'workers_comp'
                    if (categoryFilter === 'License') return d.type === 'license'
                    if (categoryFilter === 'W-9') return d.type === 'w9'
                    return false
                  })
                  .map((doc: any) => {
                    const typeLabel: Record<string, string> = { coi: 'COI', license: 'License', w9: 'W-9', workers_comp: "Workers' Comp", other: 'Other' }
                    const isExpired = doc.expiry_date && new Date(doc.expiry_date + 'T00:00:00') < new Date()
                    const resolvedStatus = (doc.status === 'expired' && doc.expiry_date && !isExpired) ? 'approved' : doc.status
                    const statusColor = resolvedStatus === 'approved' ? 'text-success' : resolvedStatus === 'expired' ? 'text-danger' : 'text-warn'
                    return (
                      <div key={doc.id} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-2">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-info-tint border border-blue-100 p-2 shrink-0">
                            <ShieldCheck className="h-5 w-5 text-info" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-ink-soft truncate">{typeLabel[doc.type] ?? doc.type}</p>
                            <p className="text-xs text-faint truncate">{doc.companies?.name ?? ''}</p>
                          </div>
                          <span className={cn('text-xs font-medium', statusColor)}>{resolvedStatus}</span>
                        </div>
                        {doc.expiry_date && (
                          <p className="text-xs text-faint">Exp {new Date(doc.expiry_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                        )}
                        {doc.notes && <p className="text-xs text-muted-fg line-clamp-2">{doc.notes}</p>}
                        <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                          className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                          <ExternalLink className="h-3 w-3" /> View Document
                        </a>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {visibleFiles.length === 0 && complianceDocs.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
              <FolderOpen className="h-8 w-8 text-faint mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-fg">
                {files.length === 0 ? 'No files yet. Upload your first document.' : 'No files in this category.'}
              </p>
            </div>
          ) : visibleFiles.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFiles.map(file => {
                const TypeIcon = fileTypeIcon(file.file_type)
                return (
                  <div key={file.id} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-surface border border-line-soft p-2 shrink-0">
                        <TypeIcon className="h-5 w-5 text-muted-fg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink text-sm truncate" title={file.name}>{file.name}</p>
                        <p className="text-xs text-faint mt-0.5">
                          {new Date(file.created_at).toLocaleDateString()}
                          {file.size_bytes ? ` · ${formatSize(file.size_bytes)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', CATEGORY_COLORS[file.category] ?? CATEGORY_COLORS.Other)}>
                        {file.category}
                      </span>
                      <div className="flex items-center gap-1">
                        <a href={file.file_url} target="_blank" rel="noopener noreferrer"
                          className="p-1.5 rounded-md text-faint hover:text-accent-fg hover:bg-accent-tint transition-colors" title="Open">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button onClick={() => openEditFile(file)}
                          className="p-1.5 rounded-md text-faint hover:text-muted-fg hover:bg-surface transition-colors" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteFile(file)}
                          className="p-1.5 rounded-md text-faint hover:text-danger hover:bg-danger-tint transition-colors" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </>
      ) : (
        <>
          {packets.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
              <Package className="h-8 w-8 text-faint mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-fg">No packets yet</p>
              <p className="text-xs text-faint mt-1">Bundle files into a packet — e.g. everything you need for a permit submission.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {packets.map(packet => {
                const included = packetFiles(packet)
                return (
                  <div key={packet.id} className="rounded-xl border border-line bg-panel p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-accent-tint border border-accent/20 p-2 shrink-0">
                        <Package className="h-5 w-5 text-accent-fg" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-ink text-sm truncate" title={packet.name}>{packet.name}</p>
                        <p className="text-xs text-faint mt-0.5">{included.length} file{included.length === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditPacket(packet)}
                          className="p-1.5 rounded-md text-faint hover:text-muted-fg hover:bg-surface transition-colors" title="Edit packet">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deletePacket(packet)}
                          className="p-1.5 rounded-md text-faint hover:text-danger hover:bg-danger-tint transition-colors" title="Delete packet">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {packet.description && <p className="text-xs text-muted-fg">{packet.description}</p>}
                    {included.length > 0 ? (
                      <div className="rounded-lg border border-line-soft divide-y divide-line-soft">
                        {included.map(file => (
                          <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 text-xs text-muted-fg hover:bg-surface hover:text-accent-fg transition-colors group">
                            <FileText className="h-3.5 w-3.5 text-faint shrink-0" />
                            <span className="truncate flex-1">{file.name}</span>
                            <ExternalLink className="h-3 w-3 text-faint group-hover:text-accent-fg shrink-0" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-faint">No files in this packet yet.</p>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEditPacket(packet)} className="flex-1">
                        <Plus className="h-3.5 w-3.5" /> Add / Manage Files
                      </Button>
                      {included.length > 0 && (
                        <Button size="sm" variant="outline" onClick={() => openAll(packet)} className="flex-1">
                          <ExternalLink className="h-3.5 w-3.5" /> Open All ({included.length})
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

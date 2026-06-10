'use client'

import { useEffect, useRef, useState } from 'react'
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
  'Insurance': 'bg-blue-50 border-blue-200 text-blue-700',
  'License': 'bg-green-50 border-green-200 text-green-700',
  'W-9': 'bg-purple-50 border-purple-200 text-purple-700',
  'Site Plans': 'bg-amber-50 border-amber-200 text-amber-700',
  'ID/Legal': 'bg-rose-50 border-rose-200 text-rose-700',
  'Permits': 'bg-teal-50 border-teal-200 text-teal-700',
  'Other': 'bg-slate-50 border-slate-200 text-slate-600',
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

  const [tab, setTab] = useState<'files' | 'packets'>('files')
  const [files, setFiles] = useState<CompanyFile[]>([])
  const [packets, setPackets] = useState<Packet[]>([])
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
    <div className="p-6 space-y-5">
      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Upload File</h2>
              <button onClick={() => { setShowUpload(false); resetUpload() }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleUpload}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>File</Label>
                  <div onClick={() => fileRef.current?.click()}
                    className={cn('flex items-center gap-2 rounded-lg border-2 border-dashed px-4 py-3.5 text-sm cursor-pointer transition-colors',
                      uploadFile ? 'border-green-300 bg-green-50 text-green-700' : 'border-orange-200 bg-orange-50/40 text-orange-500 hover:border-orange-400')}>
                    {uploadFile
                      ? <><FileText className="h-4 w-4" /><span className="truncate">{uploadFile.name}</span><span className="ml-auto text-xs">{formatSize(uploadFile.size)}</span></>
                      : <><Upload className="h-4 w-4" /><span className="font-medium">Choose a file to upload</span></>}
                  </div>
                  <input ref={fileRef} type="file" className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0] ?? null
                      setUploadFile(f)
                      if (f && !uploadName) setUploadName(f.name.replace(/\.[^.]+$/, ''))
                    }} />
                </div>
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input placeholder="e.g. General Liability Certificate" value={uploadName} onChange={e => setUploadName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <select value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="border-t border-slate-100 px-6 py-4 space-y-2">
                {uploadError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{uploadError}</p>}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-md">
            <div className="border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Edit File</h2>
              <button onClick={() => setEditingFile(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEditFile}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={editName} onChange={e => setEditName(e.target.value)} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Category</Label>
                  <select value={editCategory} onChange={e => setEditCategory(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="border-t border-slate-100 px-6 py-4 space-y-2">
                {editFileError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{editFileError}</p>}
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
          <div className="bg-white rounded-xl shadow-xl w-full max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">{editingPacket ? 'Edit Packet' : 'New Packet'}</h2>
              <button onClick={() => setShowPacketForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
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
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none resize-none" />
                </div>
                <div className="space-y-1.5">
                  <Label>Files in this packet ({packetFileIds.length} selected)</Label>
                  {files.length === 0 ? (
                    <p className="text-sm text-slate-400 py-3">No files in your library yet. Upload files first.</p>
                  ) : (
                    <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-64 overflow-y-auto">
                      {files.map(file => {
                        const checked = packetFileIds.includes(file.id)
                        return (
                          <label key={file.id} className={cn('flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors', checked && 'bg-orange-50/50')}>
                            <input type="checkbox" checked={checked} onChange={() => togglePacketFile(file.id)}
                              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 accent-orange-500" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                              <p className="text-xs text-slate-400">{file.category}</p>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 space-y-2">
                {packetError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{packetError}</p>}
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Files</h1>
          <p className="text-sm text-slate-500 mt-0.5">Company documents and ready-to-go submission packets.</p>
        </div>
        {tab === 'files'
          ? <Button onClick={() => setShowUpload(true)}><Plus className="h-4 w-4" /> Upload File</Button>
          : <Button onClick={openNewPacket}><Plus className="h-4 w-4" /> New Packet</Button>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {([['files', 'All Files', FolderOpen], ['packets', 'Packets', Package]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === key ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <Icon className="h-4 w-4" />{label}
            <span className="text-xs text-slate-400 ml-0.5">{key === 'files' ? files.length : packets.length}</span>
          </button>
        ))}
      </div>

      {fetchError && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Something went wrong: <strong>{fetchError}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : tab === 'files' ? (
        <>
          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2">
            {['All', ...CATEGORIES].map(c => (
              <button key={c} onClick={() => setCategoryFilter(c)}
                className={cn('rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  categoryFilter === c
                    ? 'bg-orange-500 border-orange-500 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-orange-300')}>
                {c}
              </button>
            ))}
          </div>

          {visibleFiles.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
              <FolderOpen className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">
                {files.length === 0 ? 'No files yet. Upload your first document.' : 'No files in this category.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {visibleFiles.map(file => {
                const TypeIcon = fileTypeIcon(file.file_type)
                return (
                  <div key={file.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-slate-50 border border-slate-100 p-2 shrink-0">
                        <TypeIcon className="h-5 w-5 text-slate-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate" title={file.name}>{file.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">
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
                          className="p-1.5 rounded-md text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors" title="Open">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <button onClick={() => openEditFile(file)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Edit">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deleteFile(file)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      ) : (
        <>
          {packets.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
              <Package className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-500">No packets yet</p>
              <p className="text-xs text-slate-400 mt-1">Bundle files into a packet — e.g. everything you need for a permit submission.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {packets.map(packet => {
                const included = packetFiles(packet)
                return (
                  <div key={packet.id} className="rounded-xl border border-slate-200 bg-white p-4 flex flex-col gap-3">
                    <div className="flex items-start gap-3">
                      <div className="rounded-lg bg-orange-50 border border-orange-100 p-2 shrink-0">
                        <Package className="h-5 w-5 text-orange-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900 text-sm truncate" title={packet.name}>{packet.name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{included.length} file{included.length === 1 ? '' : 's'}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => openEditPacket(packet)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Edit packet">
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button onClick={() => deletePacket(packet)}
                          className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Delete packet">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    {packet.description && <p className="text-xs text-slate-500">{packet.description}</p>}
                    {included.length > 0 ? (
                      <div className="rounded-lg border border-slate-100 divide-y divide-slate-50">
                        {included.map(file => (
                          <a key={file.id} href={file.file_url} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-2 px-3 py-2 text-xs text-slate-600 hover:bg-slate-50 hover:text-orange-600 transition-colors group">
                            <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate flex-1">{file.name}</span>
                            <ExternalLink className="h-3 w-3 text-slate-300 group-hover:text-orange-400 shrink-0" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400">No files in this packet.</p>
                    )}
                    {included.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => openAll(packet)} className="w-full">
                        <ExternalLink className="h-3.5 w-3.5" /> Open All ({included.length})
                      </Button>
                    )}
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

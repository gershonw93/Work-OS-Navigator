'use client'

import { useEffect, useRef, useState } from 'react'
import { FileText, Folder, FolderPlus, Upload, X, ChevronRight, ArrowLeft, Trash2, FolderInput, MoreVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'

interface PlanFolder { id: string; name: string; project_id: string; created_at: string }
interface Plan { id: string; name: string; plan_type: string; file_url: string; folder_id: string | null; created_at: string }

const PLAN_TYPES = [
  { value: 'architectural', label: 'Architectural' },
  { value: 'structural', label: 'Structural' },
  { value: 'mep', label: 'MEP' },
  { value: 'civil', label: 'Civil' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'other', label: 'Other' },
]

export default function PlansPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emptyFileInputRef = useRef<HTMLInputElement>(null)

  const [folders, setFolders] = useState<PlanFolder[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)

  const [movingPlan, setMovingPlan] = useState<Plan | null>(null)
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string>('__root__')
  const [moveLoading, setMoveLoading] = useState(false)

  const [showUpload, setShowUpload] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadName, setUploadName] = useState('')
  const [uploadType, setUploadType] = useState('architectural')
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadProgress, setUploadProgress] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    setLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/plans`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setFolders(data.folders)
      setPlans(data.plans)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  async function createFolder(e: React.FormEvent) {
    e.preventDefault()
    setFolderError(null)
    setFolderLoading(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/plans`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: folderName }),
    })
    if (!res.ok) {
      const body = await res.json()
      setFolderError(body.error)
      setFolderLoading(false)
      return
    }
    setFolderName('')
    setShowNewFolder(false)
    setFolderLoading(false)
    fetchData()
  }

  async function handleDeletePlan(planId: string) {
    if (!window.confirm('Delete this plan file? This cannot be undone.')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/plans/${planId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  async function handleDeleteFolder(folderId: string) {
    const filesInFolder = plans.filter(p => p.folder_id === folderId)
    if (filesInFolder.length > 0) {
      alert('Remove files first before deleting this folder.')
      return
    }
    if (!window.confirm('Delete this folder?')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/plans/folders/${folderId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    fetchData()
  }

  function openMove(plan: Plan) {
    setMovingPlan(plan)
    setMoveTargetFolderId(plan.folder_id ?? '__root__')
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault()
    if (!movingPlan) return
    setMoveLoading(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/plans/${movingPlan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ folder_id: moveTargetFolderId === '__root__' ? null : moveTargetFolderId }),
    })
    setMoveLoading(false)
    setMovingPlan(null)
    fetchData()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadFile(file)
    setUploadName(file.name.replace(/\.[^/.]+$/, ''))
    setShowUpload(true)
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!uploadFile) return
    setUploadError(null)
    setUploadLoading(true)
    setUploadProgress(true)

    const token = await getToken()
    const form = new FormData()
    form.append('file', uploadFile)
    form.append('name', uploadName)
    form.append('plan_type', uploadType)
    if (activeFolderId) form.append('folder_id', activeFolderId)

    const res = await fetch(`/api/projects/${params.id}/plans/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })

    setUploadProgress(false)
    setUploadLoading(false)

    if (!res.ok) {
      const body = await res.json()
      setUploadError(body.error)
      return
    }

    setShowUpload(false)
    setUploadFile(null)
    setUploadName('')
    setUploadType('architectural')
    if (fileInputRef.current) fileInputRef.current.value = ''
    fetchData()
  }

  const activeFolder = folders.find(f => f.id === activeFolderId)
  const visiblePlans = activeFolderId
    ? plans.filter(p => p.folder_id === activeFolderId)
    : plans // root shows all files; folder badge shows which folder each belongs to
  const visibleFolders = activeFolderId ? [] : folders

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          {activeFolderId && (
            <button onClick={() => setActiveFolderId(null)} className="text-slate-400 hover:text-slate-600">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-0.5">
              <span className="cursor-pointer hover:text-slate-700" onClick={() => setActiveFolderId(null)}>Plans</span>
              {activeFolder && <><ChevronRight className="h-3.5 w-3.5" /><span className="text-slate-700 font-medium">{activeFolder.name}</span></>}
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{activeFolder ? activeFolder.name : 'Plans'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!activeFolderId && (
            <Button variant="outline" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
          )}
          <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium cursor-pointer transition-colors">
            <Upload className="h-4 w-4" />
            Upload Plan
            <input ref={fileInputRef} type="file" className="sr-only" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg" onChange={handleFileChange} />
          </label>
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 min-w-0 px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Folder</h2>
              <button onClick={() => { setShowNewFolder(false); setFolderName(''); setFolderError(null) }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createFolder} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="folderName">Folder Name</Label>
                <Input id="folderName" placeholder="e.g. Architectural" value={folderName} onChange={e => setFolderName(e.target.value)} required autoFocus />
              </div>
              {folderError && <p className="text-sm text-red-600">{folderError}</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowNewFolder(false); setFolderName('') }}>Cancel</Button>
                <Button type="submit" disabled={folderLoading}>{folderLoading ? 'Creating...' : 'Create Folder'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 min-w-0 px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Upload Plan</h2>
              <button onClick={() => { setShowUpload(false); setUploadFile(null); setUploadError(null) }} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleUpload} className="space-y-4">
              {uploadFile && (
                <div className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
                  <FileText className="h-5 w-5 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 truncate min-w-0">{uploadFile.name}</span>
                  <span className="text-xs text-slate-400 shrink-0 ml-auto">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="uploadName">Plan Name</Label>
                <Input id="uploadName" placeholder="e.g. Floor Plan - Level 1" value={uploadName} onChange={e => setUploadName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="uploadType">Plan Type</Label>
                <Select id="uploadType" value={uploadType} onChange={e => setUploadType(e.target.value)}>
                  {PLAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>
              </div>
              {activeFolder && (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Folder className="h-4 w-4" />
                  Uploading into <span className="font-medium text-slate-700">{activeFolder.name}</span>
                </div>
              )}
              {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
              {uploadProgress && (
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 rounded-full animate-pulse w-2/3" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowUpload(false); setUploadFile(null) }}>Cancel</Button>
                <Button type="submit" disabled={uploadLoading}>{uploadLoading ? 'Uploading...' : 'Upload'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Move to Folder Modal */}
      {movingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Move File</h2>
              <button onClick={() => setMovingPlan(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4 truncate">Moving: <span className="font-medium text-slate-700">{movingPlan.name}</span></p>
            <form onSubmit={handleMove} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="moveFolder">Destination Folder</Label>
                <Select id="moveFolder" value={moveTargetFolderId} onChange={e => setMoveTargetFolderId(e.target.value)}>
                  <option value="__root__">— Root (no folder) —</option>
                  {folders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setMovingPlan(null)}>Cancel</Button>
                <Button type="submit" disabled={moveLoading}>{moveLoading ? 'Moving...' : 'Move'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : visibleFolders.length === 0 && visiblePlans.length === 0 ? (
        <>
          <input ref={emptyFileInputRef} type="file" className="sr-only" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg" onChange={handleFileChange} />
          <EmptyState
            icon={FileText}
            title={activeFolderId ? 'No plans in this folder' : 'No plans yet'}
            description={activeFolderId ? 'Upload a plan into this folder.' : 'Create folders to organize your drawings, then upload plans.'}
            action={{ label: 'Upload Plan', onClick: () => emptyFileInputRef.current?.click() }}
          />
        </>
      ) : (
        <div className="space-y-6">
          {/* Folders */}
          {visibleFolders.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {visibleFolders.map(folder => {
                  const count = plans.filter(p => p.folder_id === folder.id).length
                  return (
                    <div key={folder.id} className="relative group">
                      <button
                        onClick={() => setActiveFolderId(folder.id)}
                        className="w-full flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 hover:border-orange-300 hover:bg-orange-50 transition-colors"
                      >
                        <Folder className="h-10 w-10 text-amber-400 group-hover:text-amber-500" />
                        <span className="text-sm font-medium text-slate-700 text-center leading-tight">{folder.name}</span>
                        <span className="text-xs text-slate-400">{count} {count === 1 ? 'file' : 'files'}</span>
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                        className="absolute top-1.5 right-1.5 p-1 text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity bg-white rounded"
                        title="Delete folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plans */}
          {visiblePlans.length > 0 && (
            <div>
              {visibleFolders.length > 0 && <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Files</p>}
              {/* Desktop table */}
              <div className="hidden md:block rounded-lg border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Name</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Type</th>
                      <th className="text-left px-4 py-3 font-medium text-slate-600">Uploaded</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visiblePlans.map(plan => (
                      <tr key={plan.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-800">{plan.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-500">
                          <span className="capitalize">{plan.plan_type}</span>
                          {!activeFolderId && plan.folder_id && (
                            <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-slate-400">
                              <Folder className="h-3 w-3" />{folders.find(f => f.id === plan.folder_id)?.name}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500">{new Date(plan.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <a href={plan.file_url} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="sm">View</Button>
                            </a>
                            <button onClick={() => openMove(plan)} className="p-1 text-slate-400 hover:text-orange-500" title="Move to folder">
                              <FolderInput className="h-4 w-4" />
                            </button>
                            <button onClick={() => handleDeletePlan(plan.id)} className="p-1 text-red-400 hover:text-red-600" title="Delete plan">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile card list */}
              <div className="md:hidden rounded-lg border border-slate-200 overflow-hidden divide-y divide-slate-100 bg-white">
                {visiblePlans.map(plan => (
                  <div key={plan.id} className="flex items-center gap-3 px-4 py-3">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{plan.name}</p>
                      <p className="text-xs text-slate-500">
                        <span className="capitalize">{plan.plan_type}</span> · {new Date(plan.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <a href={plan.file_url} target="_blank" rel="noopener noreferrer">
                        <Button variant="ghost" size="sm">View</Button>
                      </a>
                      <button onClick={() => openMove(plan)} className="p-1 text-slate-400 hover:text-orange-500" title="Move to folder">
                        <FolderInput className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleDeletePlan(plan.id)} className="p-1 text-red-400 hover:text-red-600" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

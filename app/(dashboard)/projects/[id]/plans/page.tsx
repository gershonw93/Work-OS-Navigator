'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { FileText, Folder, FolderPlus, Upload, X, ChevronRight, ArrowLeft, Trash2, FolderInput, Search, ExternalLink, UploadCloud, AlertTriangle, Check, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { uploadPlan, guessPlanType, baseName } from '@/lib/upload-plan'

interface PlanFolder { id: string; name: string; project_id: string; created_at: string }
interface Plan { id: string; name: string; plan_type: string; file_url: string; folder_id: string | null; created_at: string }

interface QueuedPlan {
  id: string
  file: File
  name: string
  planType: string
  folderId: string | null
  status: 'waiting' | 'uploading' | 'done' | 'failed'
  error: string | null
}

const PLAN_TYPES = [
  { value: 'architectural', label: 'Architectural' },
  { value: 'structural', label: 'Structural' },
  { value: 'mep', label: 'MEP' },
  { value: 'civil', label: 'Civil' },
  { value: 'landscape', label: 'Landscape' },
  { value: 'other', label: 'Other' },
]

const PLAN_TYPE_TINT: Record<string, string> = {
  architectural: 'bg-accent-tint text-accent-fg',
  structural: 'bg-info-tint text-info',
  mep: 'bg-warn-tint text-warn',
  civil: 'bg-success-tint text-success',
  landscape: 'bg-success-tint text-success',
  other: 'bg-surface text-muted-fg',
}

export default function PlansPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { can } = usePermissions()
  const canAdd = can('plans', 'create')
  const canDelete = can('plans', 'delete')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const emptyFileInputRef = useRef<HTMLInputElement>(null)

  const [folders, setFolders] = useState<PlanFolder[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [showNewFolder, setShowNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [search, setSearch] = useState('')
  // Files waiting to be uploaded - one row each, named and typed before they go.
  const [queue, setQueue] = useState<QueuedPlan[]>([])
  const [queueBusy, setQueueBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  // Nested dragenter/dragleave fire constantly as the cursor crosses children,
  // so the overlay is counted in rather than toggled or it flickers.
  const dragDepth = useRef(0)
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderError, setFolderError] = useState<string | null>(null)

  const [movingPlan, setMovingPlan] = useState<Plan | null>(null)
  const [moveTargetFolderId, setMoveTargetFolderId] = useState<string>('__root__')
  const [moveLoading, setMoveLoading] = useState(false)


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

  function queueFiles(files: FileList | File[], folderId: string | null) {
    const list = Array.from(files).filter(f => f.size > 0)
    if (!list.length) return
    setQueue(prev => [
      ...prev,
      ...list.map(file => ({
        id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        name: baseName(file.name),
        planType: guessPlanType(file.name),
        folderId,
        status: 'waiting' as const,
        error: null as string | null,
      })),
    ])
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) queueFiles(e.target.files, activeFolderId)
    e.target.value = ''
  }

  /** Drop straight onto the tab - or onto a folder tile to file it as it lands. */
  function handleDrop(e: React.DragEvent, folderId: string | null) {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (!canAdd) return
    if (e.dataTransfer?.files?.length) queueFiles(e.dataTransfer.files, folderId)
  }

  async function uploadQueue() {
    setQueueBusy(true)
    // One at a time on purpose: a phone on site uploading five drawing sets at
    // once is how you get five timeouts instead of five plans.
    for (const item of queue) {
      if (item.status === 'done') continue
      setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'uploading', error: null } : q))
      try {
        await uploadPlan({
          projectId: params.id,
          file: item.file,
          name: item.name.trim() || baseName(item.file.name),
          planType: item.planType,
          folderId: item.folderId,
        })
        setQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'done' } : q))
      } catch (err: any) {
        // One bad file must not abandon the rest - it keeps its own error and
        // the run carries on.
        setQueue(prev => prev.map(q => q.id === item.id
          ? { ...q, status: 'failed', error: err?.message ?? 'Upload failed' } : q))
      }
    }
    setQueueBusy(false)
    await fetchData()
    setQueue(prev => prev.filter(q => q.status === 'failed'))
  }

  const activeFolder = folders.find(f => f.id === activeFolderId)
  // Folders step aside while searching - a result list interrupted by folder
  // tiles is not a result list.
  const visibleFolders = activeFolderId || search.trim() ? [] : folders

  // A file inside a folder belongs INSIDE it. The root used to list every plan
  // on the job as well as the folders holding them, so anything filed away
  // appeared twice - once as a count on its folder and again in the list
  // underneath, which is the opposite of what filing something is for.
  const inScope = activeFolderId
    ? plans.filter(p => p.folder_id === activeFolderId)
    : plans.filter(p => !p.folder_id)

  // Search looks across the WHOLE job, not just the folder you happen to be
  // standing in - "where is the roof detail" is the question, and having to
  // remember which folder you filed it in defeats the point of searching.
  const q = search.trim().toLowerCase()
  const searching = q.length > 0
  const visiblePlans = searching
    ? plans.filter(p =>
      p.name.toLowerCase().includes(q)
      || p.plan_type.toLowerCase().includes(q)
      || (folders.find(f => f.id === p.folder_id)?.name ?? '').toLowerCase().includes(q))
    : inScope

  const filedCount = plans.length - plans.filter(p => !p.folder_id).length

  return (
    <div className="relative p-4 sm:p-6"
      onDragEnter={e => {
        if (!canAdd || !e.dataTransfer?.types?.includes('Files')) return
        dragDepth.current += 1
        setDragging(true)
      }}
      onDragOver={e => { if (canAdd && e.dataTransfer?.types?.includes('Files')) e.preventDefault() }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setDragging(false)
      }}
      onDrop={e => handleDrop(e, activeFolderId)}
    >
      {/* Drop anywhere on the tab. Having to click Upload first, then pick one
          file, then repeat - five times - is the thing this replaces. */}
      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-40 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-tint/70 backdrop-blur-sm">
          <div className="text-center">
            <UploadCloud className="mx-auto h-10 w-10 text-accent-fg" />
            <p className="mt-2 text-sm font-semibold text-ink">
              Drop to add {activeFolder ? `to ${activeFolder.name}` : 'plans'}
            </p>
            <p className="text-xs text-muted-fg">As many at once as you like</p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          {activeFolderId && (
            <button onClick={() => setActiveFolderId(null)} className="text-faint hover:text-muted-fg">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div>
            <div className="flex items-center gap-1.5 text-sm text-muted-fg mb-0.5">
              <span className="cursor-pointer hover:text-ink-soft" onClick={() => setActiveFolderId(null)}>Plans</span>
              {activeFolder && <><ChevronRight className="h-3.5 w-3.5" /><span className="text-ink-soft font-medium">{activeFolder.name}</span></>}
            </div>
            <h1 className="text-2xl font-bold text-ink">{activeFolder ? activeFolder.name : 'Plans'}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canAdd && !activeFolderId && (
            <Button variant="outline" onClick={() => setShowNewFolder(true)}>
              <FolderPlus className="h-4 w-4" />
              New Folder
            </Button>
          )}
          {canAdd && (
            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent text-accent-ink text-sm font-medium cursor-pointer transition-colors">
              <Upload className="h-4 w-4" />
              Upload Plans
              <input ref={fileInputRef} type="file" multiple className="sr-only" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg" onChange={handleFileChange} />
            </label>
          )}
        </div>
      </div>

      {/* New Folder Modal */}
      {showNewFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm mx-4 min-w-0 px-4 sm:px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ink">New Folder</h2>
              <button onClick={() => { setShowNewFolder(false); setFolderName(''); setFolderError(null) }} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={createFolder} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="folderName">Folder Name</Label>
                <Input id="folderName" placeholder="e.g. Architectural" value={folderName} onChange={e => setFolderName(e.target.value)} required autoFocus />
              </div>
              {folderError && <p className="text-sm text-danger">{folderError}</p>}
              <div className="flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowNewFolder(false); setFolderName('') }}>Cancel</Button>
                <Button type="submit" disabled={folderLoading}>{folderLoading ? 'Creating...' : 'Create Folder'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* The upload queue. Replaces a modal that took one file at a time and
          asked for its name and type before you could pick the next one. */}
      {queue.length > 0 && (
        <div className="mb-5 rounded-xl border border-accent/40 bg-accent-tint/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">
              {queue.length} file{queue.length === 1 ? '' : 's'} ready to add
              {activeFolder && <span className="font-normal text-muted-fg"> to {activeFolder.name}</span>}
            </p>
            <div className="flex items-center gap-2">
              {!queueBusy && (
                <button onClick={() => setQueue([])} className="text-xs font-medium text-muted-fg hover:text-danger">
                  Clear
                </button>
              )}
              <Button size="sm" onClick={uploadQueue} disabled={queueBusy}>
                {queueBusy ? 'Uploading…' : `Add ${queue.length} plan${queue.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {queue.map(item => (
              <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2">
                <span className="shrink-0">
                  {item.status === 'done' ? <Check className="h-4 w-4 text-success" />
                    : item.status === 'failed' ? <AlertTriangle className="h-4 w-4 text-danger" />
                    : item.status === 'uploading' ? <Loader2 className="h-4 w-4 animate-spin text-accent-fg" />
                    : <FileText className="h-4 w-4 text-faint" />}
                </span>

                <Input
                  value={item.name}
                  disabled={queueBusy}
                  onChange={e => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, name: e.target.value } : q))}
                  className="h-8 min-w-0 flex-1 text-sm"
                />

                <Select
                  value={item.planType}
                  disabled={queueBusy}
                  onChange={e => setQueue(prev => prev.map(q => q.id === item.id ? { ...q, planType: e.target.value } : q))}
                  className="h-8 w-36 text-sm"
                >
                  {PLAN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Select>

                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-faint">
                  {(item.file.size / 1024 / 1024).toFixed(1)}MB
                </span>

                {!queueBusy && (
                  <button onClick={() => setQueue(prev => prev.filter(q => q.id !== item.id))}
                    aria-label="Remove from the queue"
                    className="shrink-0 p-1 text-faint hover:text-danger">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}

                {item.error && <p className="w-full text-xs text-danger">{item.error}</p>}
              </div>
            ))}
          </div>

          <p className="mt-2.5 text-[11px] text-faint">
            The type is guessed from the file name - change any that guessed wrong before adding.
          </p>
        </div>
      )}

      {/* Move to Folder Modal */}
      {movingPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm mx-4 px-6 py-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ink">Move File</h2>
              <button onClick={() => setMovingPlan(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-sm text-muted-fg mb-4 truncate">Moving: <span className="font-medium text-ink-soft">{movingPlan.name}</span></p>
            <form onSubmit={handleMove} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="moveFolder">Destination Folder</Label>
                <Select id="moveFolder" value={moveTargetFolderId} onChange={e => setMoveTargetFolderId(e.target.value)}>
                  <option value="__root__">- Root (no folder) -</option>
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

      {/* One line that says what is here and lets you find it. The tab had no
          search at all, so a job with forty drawings across six folders was a
          hunt through folders you had to remember the names of. */}
      {!loading && plans.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search every plan on this job…" className="h-9 pl-8" />
            {search && (
              <button onClick={() => setSearch('')} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-faint hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="text-xs text-faint">
            {searching
              ? `${visiblePlans.length} match${visiblePlans.length === 1 ? '' : 'es'}`
              : <>
                {plans.length} plan{plans.length === 1 ? '' : 's'}
                {folders.length > 0 && ` · ${folders.length} folder${folders.length === 1 ? '' : 's'}`}
                {!activeFolderId && filedCount > 0 && ` · ${filedCount} filed away`}
              </>}
          </p>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : !searching && visibleFolders.length === 0 && visiblePlans.length === 0 && plans.length === 0 ? (
        <>
          <input ref={emptyFileInputRef} type="file" multiple className="sr-only" accept=".pdf,.dwg,.dxf,.png,.jpg,.jpeg,.svg" onChange={handleFileChange} />
          <EmptyState
            icon={FileText}
            title={activeFolderId ? 'No plans in this folder' : 'No plans yet'}
            description={activeFolderId ? 'Drop drawings here, or upload them, and they land in this folder.' : 'Drag drawings straight onto this tab - as many at once as you like - or create folders first to organise them.'}
            action={{ label: 'Upload plans', onClick: () => emptyFileInputRef.current?.click() }}
          />
        </>
      ) : (
        <div className="space-y-6">
          {/* Folders */}
          {visibleFolders.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-faint uppercase tracking-wider mb-3">Folders</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {visibleFolders.map(folder => {
                  const count = plans.filter(p => p.folder_id === folder.id).length
                  return (
                    <div key={folder.id} className="relative group">
                      <button
                        onClick={() => setActiveFolderId(folder.id)}
                        // Dropping onto a folder files it as it lands, instead
                        // of dropping at root and then moving it.
                        onDragOver={e => { if (canAdd) e.preventDefault() }}
                        onDrop={e => { e.stopPropagation(); handleDrop(e, folder.id) }}
                        className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel p-3 text-left transition-colors hover:border-accent hover:bg-accent-tint/40"
                      >
                        <span className="shrink-0 rounded-lg border border-line-soft bg-surface p-2">
                          <Folder className="h-5 w-5 text-warn" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-ink-soft">{folder.name}</span>
                          <span className="block text-xs text-faint">
                            {count === 0 ? 'Empty' : `${count} ${count === 1 ? 'plan' : 'plans'}`}
                          </span>
                        </span>
                      </button>
                      {canDelete && <button
                        onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.id) }}
                        className="absolute top-1.5 right-1.5 p-1 text-danger hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity bg-panel rounded"
                        title="Delete folder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Plans. One list, not a desktop table plus a separate mobile card
              list saying the same thing twice in two different shapes. */}
          {visiblePlans.length > 0 ? (
            <div>
              {(visibleFolders.length > 0 || searching) && (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-faint">
                  {searching ? 'Matches' : activeFolderId ? 'Files' : 'Not in a folder'}
                </p>
              )}
              <div className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-panel">
                {visiblePlans.map(plan => {
                  const folder = folders.find(f => f.id === plan.folder_id)
                  return (
                    <div key={plan.id} className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface sm:px-4">
                      <span className="shrink-0 rounded-lg border border-line-soft bg-surface p-2">
                        <FileText className="h-4 w-4 text-muted-fg" />
                      </span>

                      <Link href={`/projects/${params.id}/plans/${plan.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink-soft group-hover:text-accent-fg">{plan.name}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-faint">
                          <span className={cn('rounded-full px-1.5 py-0 font-medium', PLAN_TYPE_TINT[plan.plan_type] ?? PLAN_TYPE_TINT.other)}>
                            {PLAN_TYPES.find(t => t.value === plan.plan_type)?.label ?? plan.plan_type}
                          </span>
                          <span>{new Date(plan.created_at).toLocaleDateString()}</span>
                          {/* Only while searching - search spans the whole job,
                              so where a match actually lives is the useful bit. */}
                          {searching && folder && (
                            <span className="inline-flex items-center gap-0.5">
                              <Folder className="h-3 w-3" />{folder.name}
                            </span>
                          )}
                        </p>
                      </Link>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <a href={plan.file_url} target="_blank" rel="noopener noreferrer"
                          className="rounded-md p-1.5 text-faint transition-colors hover:bg-accent-tint hover:text-accent-fg"
                          title="Open the original file">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        {canAdd && (
                          <button onClick={() => openMove(plan)}
                            className="rounded-md p-1.5 text-faint transition-colors hover:bg-accent-tint hover:text-accent-fg"
                            title="Move to a folder">
                            <FolderInput className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button onClick={() => handleDeletePlan(plan.id)}
                            className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger-tint hover:text-danger"
                            title="Delete plan">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : searching ? (
            <p className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-faint">
              Nothing on this job matches &ldquo;{search}&rdquo;.
            </p>
          ) : activeFolderId ? (
            // An opened folder with nothing in it used to render absolutely
            // nothing - a blank screen that reads as broken rather than empty.
            <p className="rounded-xl border border-dashed border-line py-10 text-center text-sm text-faint">
              This folder is empty. Upload a plan and it lands here.
            </p>
          ) : folders.length > 0 ? (
            <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-faint">
              Every plan is filed in a folder. Open one above.
            </p>
          ) : null}
        </div>
      )}
    </div>
  )
}

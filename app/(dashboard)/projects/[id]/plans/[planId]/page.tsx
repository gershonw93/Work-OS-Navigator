'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  ArrowLeft, MapPin, Plus, Minus, X, Loader2, ChevronLeft, ChevronRight, Trash2, ExternalLink,
  Maximize2, Minimize2, List,
} from 'lucide-react'

interface Plan { id: string; name: string; plan_type: string; file_url: string }
interface Pin {
  id: string; page: number; x_pct: number; y_pct: number; task_id: string
  project_tasks: { id: string; title: string; status: string; priority: string; due_date: string | null; assigned_to_name: string | null } | null
}
interface Member { id: string; name: string }

// Stable color per assignee so the crew can see whose work is where.
const PIN_COLORS = ['#2563EB', '#DC2626', '#16A34A', '#D97706', '#7C3AED', '#0891B2', '#DB2777', '#65A30D']
function colorFor(name: string | null | undefined) {
  const s = (name || 'unassigned').toLowerCase()
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return PIN_COLORS[h % PIN_COLORS.length]
}

export default function PlanViewerPage({ params }: { params: { id: string; planId: string } }) {
  const supabase = createClient()
  const [plan, setPlan] = useState<Plan | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Viewer state
  const [zoom, setZoom] = useState(1)
  const [page, setPage] = useState(1)
  const [numPages, setNumPages] = useState(1)
  const [rendering, setRendering] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isPdf = plan ? /\.pdf(\?|$)/i.test(plan.file_url) : false

  // Pin state
  const [pinMode, setPinMode] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)
  const [showList, setShowList] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null)
  const [openPin, setOpenPin] = useState<Pin | null>(null)
  const [title, setTitle] = useState('')
  const [assignee, setAssignee] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [priority, setPriority] = useState('medium')
  const [saving, setSaving] = useState(false)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const h = { Authorization: `Bearer ${t}` }
    const [plansRes, pinsRes, teamRes] = await Promise.all([
      fetch(`/api/projects/${params.id}/plans`, { headers: h }),
      fetch(`/api/projects/${params.id}/plans/${params.planId}/pins`, { headers: h }),
      fetch(`/api/projects/${params.id}/team`, { headers: h }),
    ])
    if (plansRes.ok) {
      const d = await plansRes.json()
      const p = (d.plans ?? []).find((x: Plan) => x.id === params.planId)
      if (p) setPlan(p); else setError('Plan not found.')
    }
    if (pinsRes.ok) setPins((await pinsRes.json()).pins ?? [])
    if (teamRes.ok) {
      const d = await teamRes.json()
      setMembers((d.members ?? []).map((m: any) => ({ id: m.id, name: m.name || m.email || 'Member' })))
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [params.planId])

  // Deep link: /plans/[planId]?pin=<id> jumps straight to that pin (used by
  // the "View on plan" link on tasks).
  const pendingPin = useRef<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('pin')
    if (q) pendingPin.current = q
  }, [])
  useEffect(() => {
    if (!pendingPin.current || !pins.length) return
    const target = pins.find(p => p.id === pendingPin.current)
    if (target) { pendingPin.current = null; jumpToPin(target) }
  }, [pins])

  function jumpToPin(pin: Pin) {
    setShowList(false)
    setPage(pin.page || 1)
    setHighlightId(pin.id)
    // Scroll once the pin is in the DOM (after any page render).
    let tries = 0
    const tick = () => {
      const el = document.getElementById(`pin-${pin.id}`)
      if (el) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
      else if (tries++ < 20) setTimeout(tick, 250)
    }
    setTimeout(tick, 100)
    setTimeout(() => setHighlightId(null), 4000)
  }

  // Render PDF page to canvas (pdfjs). Images render as a plain <img>.
  useEffect(() => {
    if (!plan || !isPdf) return
    let cancelled = false
    ;(async () => {
      setRendering(true)
      try {
        const pdfjs = await import('pdfjs-dist')
        // Worker served from /public — bundling the .mjs worker trips Next's parser.
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjs.getDocument({ url: plan.file_url }).promise
        if (cancelled) return
        setNumPages(doc.numPages)
        const pg = await doc.getPage(Math.min(page, doc.numPages))
        // Cap the render size so huge sheets stay fast: crisp (2x) for normal
        // pages, scaled down for monster architectural sheets (~35MP canvas max).
        const base = pg.getViewport({ scale: 1 })
        const scale = Math.min(2, 5000 / Math.max(base.width, base.height))
        const viewport = pg.getViewport({ scale })
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = viewport.width
        canvas.height = viewport.height
        await pg.render({ canvasContext: canvas.getContext('2d')!, viewport } as any).promise
      } catch {
        if (!cancelled) setError('Could not render this PDF — use View file to open it directly.')
      } finally {
        if (!cancelled) setRendering(false)
      }
    })()
    return () => { cancelled = true }
  }, [plan?.file_url, isPdf, page])

  function handleSheetClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!pinMode) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setDraft({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 })
    setTitle(''); setAssignee(''); setDueDate(''); setPriority('medium')
  }

  async function savePin() {
    if (!draft || !title.trim()) return
    setSaving(true)
    const member = members.find(m => m.id === assignee)
    const res = await fetch(`/api/projects/${params.id}/plans/${params.planId}/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({
        x_pct: draft.x, y_pct: draft.y, page,
        title: title.trim(),
        assigned_to_member_id: assignee || null,
        assigned_to_name: member?.name || null,
        due_date: dueDate || null,
        priority,
      }),
    })
    setSaving(false)
    if (res.ok) {
      const { pin } = await res.json()
      setPins(prev => [...prev, pin])
      setDraft(null); setPinMode(false)
    } else {
      alert((await res.json().catch(() => ({}))).error ?? 'Could not save pin')
    }
  }

  async function removePin(pin: Pin) {
    if (!confirm('Remove this pin? The task itself is kept.')) return
    await fetch(`/api/projects/${params.id}/plans/${params.planId}/pins?pinId=${pin.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${await token()}` },
    })
    setPins(prev => prev.filter(p => p.id !== pin.id))
    setOpenPin(null)
  }

  const pagePins = useMemo(() => pins.filter(p => (p.page || 1) === page), [pins, page])
  const legend = useMemo(() => {
    const names = new Map<string, string>()
    for (const p of pagePins) {
      const n = p.project_tasks?.assigned_to_name || 'Unassigned'
      names.set(n, colorFor(p.project_tasks?.assigned_to_name))
    }
    return Array.from(names.entries())
  }, [pagePins])

  if (loading) return <div className="p-8 text-center text-sm text-faint">Loading plan…</div>
  if (!plan) return <div className="p-8 text-center text-sm text-danger">{error || 'Plan not found.'}</div>

  return (
    <div className={cn('space-y-4', fullscreen ? 'fixed inset-0 z-40 overflow-y-auto bg-surface p-3 pb-6' : 'p-4 sm:p-6')}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/projects/${params.id}/plans`} className="inline-flex items-center gap-1.5 text-sm text-muted-fg hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> Plans
        </Link>
        <h1 className="text-lg font-bold text-ink truncate flex-1 min-w-0">{plan.name}</h1>
        <div className="flex items-center gap-1.5">
          {isPdf && numPages > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-line px-1 py-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1 text-muted-fg hover:text-ink disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-xs text-muted-fg px-1">{page}/{numPages}</span>
              <button onClick={() => setPage(p => Math.min(numPages, p + 1))} disabled={page >= numPages} className="p-1 text-muted-fg hover:text-ink disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
            </div>
          )}
          <button onClick={() => setZoom(z => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))} className="rounded-lg border border-line p-2 text-muted-fg hover:bg-surface"><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs text-muted-fg">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(4, Math.round((z + 0.25) * 100) / 100))} className="rounded-lg border border-line p-2 text-muted-fg hover:bg-surface"><Plus className="h-4 w-4" /></button>
          <a href={plan.file_url} target="_blank" rel="noreferrer" className="rounded-lg border border-line p-2 text-muted-fg hover:bg-surface" title="Open the file"><ExternalLink className="h-4 w-4" /></a>
          <button onClick={() => setShowList(true)} className="relative rounded-lg border border-line p-2 text-muted-fg hover:bg-surface" title="All pins">
            <List className="h-4 w-4" />
            {pins.length > 0 && <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">{pins.length}</span>}
          </button>
          <button onClick={() => setFullscreen(v => !v)} className="rounded-lg border border-line p-2 text-muted-fg hover:bg-surface" title={fullscreen ? 'Exit full screen' : 'Full screen'}>
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <Button size="sm" variant={pinMode ? 'default' : 'outline'} onClick={() => { setPinMode(v => !v); setDraft(null) }}>
            <MapPin className="h-4 w-4" /> {pinMode ? 'Tap the plan…' : 'Add pin'}
          </Button>
        </div>
      </div>

      {/* Legend */}
      {legend.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-fg">
          {legend.map(([name, color]) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} /> {name}
            </span>
          ))}
        </div>
      )}

      {/* Sheet */}
      <div className={cn('overflow-auto rounded-xl border border-line bg-muted/40', fullscreen ? 'max-h-[calc(100vh-7.5rem)]' : 'max-h-[75vh]')}>
        <div className="relative inline-block min-w-full" style={{ width: `${zoom * 100}%` }}>
          <div className={cn('relative', pinMode && 'cursor-crosshair')} onClick={handleSheetClick}>
            {isPdf ? (
              <canvas ref={canvasRef} className="block w-full h-auto" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={plan.file_url} alt={plan.name} className="block w-full h-auto select-none" draggable={false} />
            )}
            {rendering && <div className="absolute inset-0 flex items-center justify-center bg-surface/60"><Loader2 className="h-6 w-6 animate-spin text-accent-fg" /></div>}

            {/* Pins — % coordinates, so they ride along with zoom/pan */}
            {pagePins.map(pin => {
              const done = pin.project_tasks?.status === 'completed'
              return (
                <button key={pin.id}
                  onClick={(e) => { e.stopPropagation(); setOpenPin(pin) }}
                  style={{ left: `${pin.x_pct}%`, top: `${pin.y_pct}%` }}
                  id={`pin-${pin.id}`}
                  className="absolute -translate-x-1/2 -translate-y-full group"
                  title={pin.project_tasks?.title ?? 'Task'}>
                  {highlightId === pin.id && (
                    <span className="absolute -inset-2 animate-ping rounded-full border-2 border-accent" />
                  )}
                  <MapPin className={cn('h-7 w-7 drop-shadow-md transition-transform group-hover:scale-125', done && 'opacity-50')}
                    style={{ color: colorFor(pin.project_tasks?.assigned_to_name), fill: 'currentColor' }} strokeWidth={1} />
                </button>
              )
            })}
            {draft && (
              <span style={{ left: `${draft.x}%`, top: `${draft.y}%` }} className="absolute -translate-x-1/2 -translate-y-full animate-bounce">
                <MapPin className="h-7 w-7 text-accent-fg drop-shadow-md" style={{ fill: 'currentColor' }} strokeWidth={1} />
              </span>
            )}
          </div>
        </div>
      </div>

      {/* All pins on this file */}
      {showList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowList(false)}>
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-line bg-panel px-5 py-4">
              <h2 className="text-lg font-bold text-ink">Pins on this plan ({pins.length})</h2>
              <button onClick={() => setShowList(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-1.5 px-4 py-4">
              {pins.length === 0 && <p className="py-6 text-center text-sm text-muted-fg">No pins yet — use Add pin.</p>}
              {pins.map(pin => {
                const t = pin.project_tasks
                const done = t?.status === 'completed'
                return (
                  <button key={pin.id} onClick={() => jumpToPin(pin)}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-3.5 py-2.5 text-left hover:border-accent hover:bg-surface transition-colors">
                    <MapPin className="h-5 w-5 shrink-0" style={{ color: colorFor(t?.assigned_to_name), fill: 'currentColor' }} strokeWidth={1} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium text-ink', done && 'line-through text-muted-fg')}>{t?.title ?? 'Task'}</span>
                      <span className="block truncate text-xs text-muted-fg">
                        {t?.assigned_to_name || 'Unassigned'}{numPages > 1 ? ` · page ${pin.page || 1}` : ''} · {(t?.status ?? 'open').replace('_', ' ')}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* New-pin task form */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setDraft(null)}>
          <div className="w-full max-w-md rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold text-ink">Task at this pin</h2>
              <button onClick={() => setDraft(null)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div><Label>What needs to happen here? <span className="text-danger">*</span></Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Move this outlet 6 inches left" autoFocus /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Assign to</Label>
                  <Select value={assignee} onChange={e => setAssignee(e.target.value)}>
                    <option value="">Unassigned</option>
                    {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </Select></div>
                <div><Label>Due date</Label><Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} /></div>
              </div>
              <div><Label>Priority</Label>
                <Select value={priority} onChange={e => setPriority(e.target.value)}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </Select></div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={savePin} disabled={saving || !title.trim()}>{saving ? 'Saving…' : 'Drop pin & create task'}</Button>
            </div>
          </div>
        </div>
      )}

      {/* Pin detail */}
      {openPin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenPin(null)}>
          <div className="w-full max-w-sm rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <span className="inline-flex items-center gap-2 min-w-0">
                <MapPin className="h-5 w-5 shrink-0" style={{ color: colorFor(openPin.project_tasks?.assigned_to_name), fill: 'currentColor' }} strokeWidth={1} />
                <h2 className="truncate text-base font-bold text-ink">{openPin.project_tasks?.title ?? 'Task'}</h2>
              </span>
              <button onClick={() => setOpenPin(null)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-2 px-5 py-4 text-sm">
              <p className="text-muted-fg">Assigned to <span className="font-medium text-ink-soft">{openPin.project_tasks?.assigned_to_name || 'no one yet'}</span></p>
              <p className="text-muted-fg">Status: <span className="font-medium text-ink-soft capitalize">{(openPin.project_tasks?.status ?? 'open').replace('_', ' ')}</span>
                {openPin.project_tasks?.due_date && <> · due {new Date(openPin.project_tasks.due_date).toLocaleDateString()}</>}</p>
            </div>
            <div className="flex items-center justify-between border-t border-line px-5 py-4">
              <button onClick={() => removePin(openPin)} className="inline-flex items-center gap-1 text-xs font-medium text-muted-fg hover:text-danger"><Trash2 className="h-3.5 w-3.5" /> Remove pin</button>
              <Link href={`/projects/${params.id}/tasks`} className="rounded-lg bg-accent px-3.5 py-2 text-sm font-semibold text-accent-ink hover:bg-accent/90">Open in Tasks</Link>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

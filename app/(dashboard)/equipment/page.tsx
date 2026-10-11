'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { StatStrip } from '@/components/ui/stat-strip'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useNotice } from '@/components/ui/notice'
import { cn } from '@/lib/utils'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import {
  Plus, Wrench, Search, MapPin, User, LogOut, LogIn, X, Package,
  ChevronDown, ChevronRight, History, AlertTriangle, CheckCircle2, Archive, RotateCcw, Pencil, Trash2,
} from 'lucide-react'
import { formatDate } from '@/lib/dates'
import {
  STATUS_LABEL, EVENT_LABEL, needsRepair, repairActionProblem, checkInProblem,
  type EquipmentStatus, type RepairAction, type ReturnCondition,
} from '@/lib/equipment-state'

type Current = {
  holder_name: string | null
  project_id: string | null
  location: string
  checked_out_at: string
  note: string | null
}
type Equipment = {
  id: string
  name: string
  category: string | null
  asset_tag: string | null
  serial_number: string | null
  status: string
  notes: string | null
  repair_needed_at: string | null
  repair_note: string | null
  repair_reported_by_name: string | null
  current: Current | null
}
type ProjectOpt = { id: string; name: string }
type Teammate = { id: string; full_name: string | null }
type Assignment = {
  id: string
  holder_name: string | null
  project_id: string | null
  projects: { name: string } | null
  checked_out_at: string
  checked_in_at: string | null
  return_condition: string | null
  note: string | null
}
type EquipmentEvent = { id: string; kind: string; note: string | null; actor_name: string | null; created_at: string }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  available: 'success',
  checked_out: 'warning',
  maintenance: 'warning',
  retired: 'muted',
}

function timeAgo(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return formatDate(d, { month: 'short', day: 'numeric' })
}

const fmtDate = (iso: string) => formatDate(iso)

async function authHeaders() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
}

// ── History panel - checkouts and repairs for one item, newest first ────────
type HistoryRow =
  | { kind: 'checkout'; at: string; a: Assignment }
  | { kind: 'event'; at: string; e: EquipmentEvent }

function HistoryPanel({ equipmentId }: { equipmentId: string }) {
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(`/api/equipment/${equipmentId}/assignment`, { headers: await authHeaders() })
        if (!res.ok) { if (alive) setFailed(true); return }
        const d = await res.json()
        const merged: HistoryRow[] = [
          ...(d.history ?? []).map((a: Assignment) => ({ kind: 'checkout' as const, at: a.checked_out_at, a })),
          ...(d.events ?? []).map((e: EquipmentEvent) => ({ kind: 'event' as const, at: e.created_at, e })),
        ].sort((x, y) => y.at.localeCompare(x.at))
        if (alive) setRows(merged)
      } catch {
        if (alive) setFailed(true)
      }
    })()
    return () => { alive = false }
  }, [equipmentId])

  if (failed) return <p className="px-4 py-4 text-sm text-danger">Could not load the history. Reload to try again.</p>
  if (rows === null) return <p className="px-4 py-4 text-sm text-muted-fg">Loading history…</p>
  if (rows.length === 0) return <p className="px-4 py-4 text-sm text-muted-fg">No history yet.</p>

  return (
    <ol className="space-y-3 px-4 py-4">
      {rows.map((r) => {
        if (r.kind === 'event') {
          const bad = r.e.kind === 'repair_flagged'
          return (
            <li key={`e${r.e.id}`} className="flex gap-3">
              <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', bad ? 'bg-danger' : 'bg-line')} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-ink">
                  {EVENT_LABEL[r.e.kind] ?? r.e.kind}
                  {r.e.actor_name && <span className="font-normal text-muted-fg"> · {r.e.actor_name}</span>}
                </p>
                <p className="text-xs text-muted-fg">{fmtDate(r.e.created_at)}</p>
                {r.e.note && <p className="mt-0.5 text-xs italic text-faint">&ldquo;{r.e.note}&rdquo;</p>}
              </div>
            </li>
          )
        }
        const a = r.a
        const location = a.project_id ? (a.projects?.name ?? 'Project') : 'Shop / Yard'
        const open = !a.checked_in_at
        return (
          <li key={a.id} className="flex gap-3">
            <div className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', open ? 'bg-warn' : 'bg-line')} />
            <div className="min-w-0 text-sm">
              <p className="font-medium text-ink">
                {a.holder_name || 'Someone'}
                <span className="font-normal text-muted-fg"> · {location}</span>
              </p>
              <p className="text-xs text-muted-fg">
                Out {fmtDate(a.checked_out_at)}
                {open ? ' · still out' : ` · back ${fmtDate(a.checked_in_at!)}`}
                {a.return_condition === 'needs_repair' && <span className="text-danger"> · came back needing repair</span>}
              </p>
              {a.note && <p className="mt-0.5 text-xs italic text-faint">&ldquo;{a.note}&rdquo;</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

// ── Check-out modal - pick who + where, then Confirm ─────────────────────────
function CheckOutModal({
  item, projects, teammates, onClose, onDone,
}: {
  item: Equipment
  projects: ProjectOpt[]
  teammates: Teammate[]
  onClose: () => void
  onDone: () => void
}) {
  const [holder, setHolder] = useState('')
  const [holderId, setHolderId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  function pickTeammate(id: string) {
    setHolderId(id)
    const t = teammates.find((x) => x.id === id)
    if (t?.full_name) setHolder(t.full_name)
  }

  async function submit() {
    if (!holder.trim()) { setErr('Enter who is taking it.'); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/equipment/${item.id}/assignment`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          holder_name: holder.trim(),
          holder_profile_id: holderId || null,
          project_id: projectId || null,
          note: note.trim() || null,
        }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Could not check out.'); return }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Check out</h2>
            <p className="truncate text-sm text-muted-fg">{item.name}{item.asset_tag ? ` · ${item.asset_tag}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {/* Reported broken but still on the shelf. Taking it is allowed -
              whoever reported it may have meant "the guard is loose" - but
              nobody takes it without being told. */}
          {needsRepair(item) && (
            <div className="flex gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2.5 text-sm text-ink">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
              <p>
                <span className="font-semibold">Marked needs repair.</span>{' '}
                {item.repair_note}{item.repair_reported_by_name ? ` - ${item.repair_reported_by_name}` : ''}
              </p>
            </div>
          )}
          <div>
            <Label>Who&apos;s taking it *</Label>
            {teammates.length > 0 && (
              <Select value={holderId} onChange={(e) => pickTeammate(e.target.value)} className="mb-2">
                <option value="">Pick a teammate…</option>
                {teammates.map((t) => <option key={t.id} value={t.id}>{t.full_name || 'Unnamed'}</option>)}
              </Select>
            )}
            <Input
              placeholder="or type a name / crew"
              value={holder}
              onChange={(e) => { setHolder(e.target.value); setHolderId('') }}
            />
          </div>
          <div>
            <Label>Where&apos;s it going *</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Shop / Yard</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input placeholder="e.g. back Friday" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Confirm check-out'}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Check-in modal - and the one question a return should answer ────────────
function CheckInModal({ item, onClose, onDone }: { item: Equipment; onClose: () => void; onDone: () => void }) {
  const [condition, setCondition] = useState<ReturnCondition>('ok')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    const problem = checkInProblem(condition, note)
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/equipment/${item.id}/assignment`, {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ condition, note: note.trim() || null }),
      })
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || 'Could not check in.'); return }
      onDone()
    } finally {
      setSaving(false)
    }
  }

  const choice = (value: ReturnCondition, label: string, Icon: typeof CheckCircle2) => (
    <button
      type="button"
      onClick={() => { setCondition(value); setErr('') }}
      aria-pressed={condition === value}
      className={cn(
        'flex min-h-[44px] items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
        condition === value
          ? (value === 'ok' ? 'border-success/50 bg-success-tint text-ink' : 'border-danger/50 bg-danger-tint text-ink')
          : 'border-line text-muted-fg hover:bg-surface',
      )}
    >
      <Icon className={cn('h-4 w-4', value === 'ok' ? 'text-success' : 'text-danger')} /> {label}
    </button>
  )

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">Check in</h2>
            <p className="truncate text-sm text-muted-fg">
              {item.name}{item.current?.holder_name ? ` · from ${item.current.holder_name}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label>What shape is it in? *</Label>
            <div className="grid grid-cols-2 gap-2">
              {choice('ok', 'Good to go', CheckCircle2)}
              {choice('needs_repair', 'Needs repair', AlertTriangle)}
            </div>
          </div>
          <div>
            <Label>{condition === 'needs_repair' ? "What's wrong with it? *" : 'Note (optional)'}</Label>
            <Input
              placeholder={condition === 'needs_repair' ? 'e.g. blade guard cracked' : ''}
              value={note}
              onChange={(e) => { setNote(e.target.value); if (err) setErr('') }}
            />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Confirm check-in'}</Button>
        </div>
      </div>
    </div>
  )
}

// ── One repair / retire move, with the note that goes in the history ────────
const ACTION_COPY: Record<RepairAction, { title: string; noteLabel: string; placeholder: string; confirm: string; required?: boolean }> = {
  flag: { title: 'Mark needs repair', noteLabel: "What's wrong with it? *", placeholder: 'e.g. fence wobbles, cuts out of square', confirm: 'Mark needs repair', required: true },
  send_out: { title: 'Send for repair', noteLabel: 'Where is it going? (optional)', placeholder: 'e.g. Ace Tool Repair, quoted $120', confirm: 'Send for repair' },
  repaired: { title: 'Mark repaired', noteLabel: 'What was done? (optional)', placeholder: 'e.g. new guard fitted', confirm: 'Mark repaired' },
  retire: { title: 'Retire', noteLabel: 'Why? (optional)', placeholder: 'e.g. motor burnt out, not worth fixing', confirm: 'Retire it' },
  reactivate: { title: 'Back into service', noteLabel: 'Note (optional)', placeholder: '', confirm: 'Bring it back' },
}

function RepairModal({ item, action, onClose, onDone }: {
  item: Equipment
  action: RepairAction
  onClose: () => void
  onDone: (e: Equipment) => void
}) {
  const copy = ACTION_COPY[action]
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    const problem = repairActionProblem(item, action, note)
    if (problem) { setErr(problem); return }
    setSaving(true); setErr('')
    try {
      const res = await fetch(`/api/equipment/${item.id}/repair`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ action, note: note.trim() || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save that.'); return }
      onDone(d.equipment)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-ink">{copy.title}</h2>
            <p className="truncate text-sm text-muted-fg">{item.name}{item.asset_tag ? ` · ${item.asset_tag}` : ''}</p>
          </div>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          {action === 'repaired' && item.repair_note && (
            <p className="text-sm text-muted-fg">Reported: &ldquo;{item.repair_note}&rdquo;</p>
          )}
          <div>
            <Label>{copy.noteLabel}</Label>
            <Input
              autoFocus={autoFocusOnDesktop()}
              placeholder={copy.placeholder}
              value={note}
              onChange={(e) => { setNote(e.target.value); if (err) setErr('') }}
            />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : copy.confirm}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Add / edit modal ─────────────────────────────────────────────────────────
function DetailsModal({ item, onClose, onDone }: {
  /** Null to add a new one. */
  item: Equipment | null
  onClose: () => void
  onDone: (e: Equipment) => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState(item?.category ?? '')
  const [assetTag, setAssetTag] = useState(item?.asset_tag ?? '')
  const [serial, setSerial] = useState(item?.serial_number ?? '')
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    try {
      const fields = {
        name: name.trim(),
        category: category.trim() || null,
        asset_tag: assetTag.trim() || null,
        serial_number: serial.trim() || null,
        notes: notes.trim() || null,
      }
      const res = await fetch('/api/equipment', {
        method: item ? 'PATCH' : 'POST',
        headers: await authHeaders(),
        body: JSON.stringify(item ? { id: item.id, ...fields } : fields),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not save.'); return }
      onDone(item ? { ...item, ...d.equipment } : d.equipment)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay>
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">{item ? 'Edit equipment' : 'Add equipment'}</h2>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div><Label>Name *</Label><Input placeholder="e.g. DeWalt table saw" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category (optional)</Label><Input placeholder="Power tool" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
            <div><Label>Asset tag (optional)</Label><Input placeholder="TS-014" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} /></div>
          </div>
          <div><Label>Serial number (optional)</Label><Input value={serial} onChange={(e) => setSerial(e.target.value)} /></div>
          <div><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="row-even lg:flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : item ? 'Save' : 'Add'}</Button>
        </div>
      </div>
    </div>
  )
}

const FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'available', label: STATUS_LABEL.available },
  { value: 'checked_out', label: STATUS_LABEL.checked_out },
  { value: 'needs_repair', label: 'Needs repair' },
  { value: 'maintenance', label: STATUS_LABEL.maintenance },
  { value: 'retired', label: STATUS_LABEL.retired },
]

export default function EquipmentPage() {
  const notify = useNotice()
  const guardDelete = useDeleteGuard()
  const [items, setItems] = useState<Equipment[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [checkoutItem, setCheckoutItem] = useState<Equipment | null>(null)
  const [checkinItem, setCheckinItem] = useState<Equipment | null>(null)
  const [repair, setRepair] = useState<{ item: Equipment; action: RepairAction } | null>(null)
  // undefined = closed, null = adding, an item = editing it.
  const [details, setDetails] = useState<Equipment | null | undefined>(undefined)
  const [expanded, setExpanded] = useState<string | null>(null)
  const busy = useRef<Set<string>>(new Set())

  async function load() {
    try {
      const res = await fetch('/api/equipment', { headers: await authHeaders() })
      if (res.ok) {
        const d = await res.json()
        setItems(d.equipment); setProjects(d.projects); setTeammates(d.teammates); setLoadError('')
      } else {
        setLoadError('Could not load your equipment. Reload to try again.')
      }
    } catch {
      setLoadError('Could not load your equipment. Reload to try again.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  function replace(e: Equipment) {
    setItems((prev) => prev.map((x) => x.id === e.id ? { ...x, ...e, current: x.current } : x))
  }

  function remove(item: Equipment) {
    guardDelete(async () => {
      if (busy.current.has(item.id)) return
      busy.current.add(item.id)
      try {
        const res = await fetch(`/api/equipment?id=${item.id}`, { method: 'DELETE', headers: await authHeaders() })
        if (!res.ok) { notify((await res.json().catch(() => ({}))).error || 'Could not delete it.'); return }
        setItems((prev) => prev.filter((x) => x.id !== item.id))
      } finally {
        busy.current.delete(item.id)
      }
    }, { label: `${item.name} and its history` })
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((e) => {
      if (statusFilter === 'needs_repair') { if (!needsRepair(e)) return false }
      else if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (!q) return true
      return [e.name, e.category, e.asset_tag, e.serial_number, e.current?.holder_name, e.current?.location, e.repair_note]
        .filter(Boolean).some((s) => (s as string).toLowerCase().includes(q))
    })
  }, [items, query, statusFilter])

  const counts = useMemo(() => ({
    total: items.filter((e) => e.status !== 'retired').length,
    out: items.filter((e) => e.status === 'checked_out').length,
    available: items.filter((e) => e.status === 'available').length,
    repair: items.filter((e) => needsRepair(e) || e.status === 'maintenance').length,
  }), [items])

  // The fourth number is a filter: a count of broken tools that does not take
  // you to them is a number you then have to go and find.
  const showRepairs = () => setStatusFilter((f) => f === 'needs_repair' ? 'all' : 'needs_repair')

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Equipment"
        subtitle="Every tool and machine, who has it, where it is, and what needs fixing."
        action={<Button onClick={() => setDetails(null)}><Plus className="mr-1.5 h-4 w-4" />Add equipment</Button>}
      />

      {/* Snapshot. Phone: one card. Desktop (lg+): tiles. */}
      <StatStrip className="mb-5 lg:hidden" items={[
        { label: 'In service', value: counts.total },
        { label: 'Available', value: counts.available },
        { label: 'Out now', value: counts.out },
        { label: 'Needs repair', value: counts.repair, tone: counts.repair ? 'danger' : undefined, onClick: showRepairs, active: statusFilter === 'needs_repair' },
      ]} />
      <div className="mb-5 hidden lg:grid lg:grid-cols-4 gap-3">
        {[
          { label: 'In service', value: counts.total, icon: Package },
          { label: 'Available', value: counts.available, icon: Wrench },
          { label: 'Out now', value: counts.out, icon: MapPin },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">{s.label}</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{s.value}</p>
          </div>
        ))}
        <button
          type="button"
          onClick={showRepairs}
          aria-pressed={statusFilter === 'needs_repair'}
          className={cn('rounded-xl border border-line px-4 py-3 text-left transition-colors hover:bg-surface', statusFilter === 'needs_repair' ? 'bg-surface' : 'bg-panel')}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">Needs repair</p>
          <p className={cn('mt-0.5 text-2xl font-bold', counts.repair ? 'text-danger' : 'text-ink')}>{counts.repair}</p>
        </button>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search name, tag, serial, holder, location…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-48">
          {FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
        </Select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-fg">Loading…</p>
      ) : loadError ? (
        <p className="py-16 text-center text-sm text-danger">{loadError}</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={items.length === 0 ? 'No equipment yet' : 'Nothing matches'}
          description={items.length === 0 ? 'Add your first tool or machine to start tracking who has it.' : 'Try a different search or filter.'}
        />
      ) : (
        // ONE card, hairline rows - and no overflow-hidden on it: the row
        // menus hang off it, and a clipped menu in the last row is gone.
        <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
          {filtered.map((e) => {
            const out = e.status === 'checked_out'
            const broken = needsRepair(e)
            const isOpen = expanded === e.id
            const can = (a: RepairAction) => repairActionProblem(e, a, 'x') === null
            return (
              <div key={e.id}>
                <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', broken ? 'bg-danger-tint text-danger' : 'bg-muted text-ink-soft')}>
                      <Wrench className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <p className="truncate font-semibold text-ink">{e.name}</p>
                        <Badge variant={STATUS_VARIANT[e.status] ?? 'muted'}>{STATUS_LABEL[e.status as EquipmentStatus] ?? e.status}</Badge>
                        {broken && <Badge variant="danger">Needs repair</Badge>}
                      </div>
                      <p className="truncate text-xs text-muted-fg">
                        {[e.category, e.asset_tag, e.serial_number ? `S/N ${e.serial_number}` : null].filter(Boolean).join(' · ') || 'No category'}
                      </p>
                    </div>
                  </div>

                  {/* Current holder + location */}
                  <div className="min-w-0 sm:w-56">
                    {out && e.current ? (
                      <div className="text-sm">
                        <p className="flex items-center gap-1.5 truncate text-ink"><User className="h-3.5 w-3.5 shrink-0 text-faint" />{e.current.holder_name}</p>
                        <p className="flex items-center gap-1.5 truncate text-muted-fg"><MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />{e.current.location} · {timeAgo(e.current.checked_out_at)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-fg">
                        {e.status === 'maintenance' ? 'Away being fixed' : e.status === 'retired' ? 'Out of service' : 'In the shop'}
                      </p>
                    )}
                  </div>

                  {/* One primary action; the rest behind the dots. */}
                  <div className="row-even lg:flex shrink-0 items-center gap-2">
                    {out ? (
                      <Button variant="outline" size="sm" onClick={() => setCheckinItem(e)}>
                        <LogIn className="mr-1.5 h-4 w-4" />Check in
                      </Button>
                    ) : e.status === 'available' ? (
                      <Button size="sm" onClick={() => setCheckoutItem(e)}>
                        <LogOut className="mr-1.5 h-4 w-4" />Check out
                      </Button>
                    ) : e.status === 'maintenance' ? (
                      <Button variant="outline" size="sm" onClick={() => setRepair({ item: e, action: 'repaired' })}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />Mark repaired
                      </Button>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setRepair({ item: e, action: 'reactivate' })}>
                        <RotateCcw className="mr-1.5 h-4 w-4" />Bring back
                      </Button>
                    )}
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setExpanded(isOpen ? null : e.id)}
                        aria-label={isOpen ? 'Hide history' : 'Show history'}
                        title={isOpen ? 'Hide history' : 'Show history'}
                        aria-expanded={isOpen}
                        className="flex min-h-[36px] items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted-fg hover:bg-surface hover:text-ink transition-colors"
                      >
                        <History className="h-3.5 w-3.5" />
                        {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                      <RowMenu label={`More for ${e.name}`}>
                        {(close) => (
                          <>
                            {can('flag') && !broken && (
                              <MenuItem onClick={() => { setRepair({ item: e, action: 'flag' }); close() }}>
                                <AlertTriangle className="h-3.5 w-3.5" /> Mark needs repair
                              </MenuItem>
                            )}
                            {can('repaired') && e.status !== 'maintenance' && (
                              <MenuItem onClick={() => { setRepair({ item: e, action: 'repaired' }); close() }}>
                                <CheckCircle2 className="h-3.5 w-3.5" /> Mark repaired
                              </MenuItem>
                            )}
                            {can('send_out') && (
                              <MenuItem onClick={() => { setRepair({ item: e, action: 'send_out' }); close() }}>
                                <Wrench className="h-3.5 w-3.5" /> Send for repair
                              </MenuItem>
                            )}
                            <MenuItem onClick={() => { setDetails(e); close() }}>
                              <Pencil className="h-3.5 w-3.5" /> Edit details
                            </MenuItem>
                            {can('retire') && (
                              <MenuItem onClick={() => { setRepair({ item: e, action: 'retire' }); close() }}>
                                <Archive className="h-3.5 w-3.5" /> Retire
                              </MenuItem>
                            )}
                            <MenuItem danger onClick={() => { remove(e); close() }}>
                              <Trash2 className="h-3.5 w-3.5" /> Delete
                            </MenuItem>
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </div>
                </div>

                {/* What is wrong with it, where somebody about to take it
                    will see it. */}
                {broken && (
                  <p className="-mt-1 px-4 pb-3 text-xs text-danger">
                    <span className="font-semibold">Needs repair:</span> {e.repair_note}
                    <span className="text-muted-fg">
                      {e.repair_reported_by_name ? ` · ${e.repair_reported_by_name}` : ''}
                      {e.repair_needed_at ? ` · ${timeAgo(e.repair_needed_at)}` : ''}
                    </span>
                  </p>
                )}

                {isOpen && (
                  <div className="border-t border-line-soft">
                    <HistoryPanel key={`${e.id}-${e.status}-${e.repair_needed_at ?? ''}`} equipmentId={e.id} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {checkoutItem && (
        <CheckOutModal
          item={checkoutItem}
          projects={projects}
          teammates={teammates}
          onClose={() => setCheckoutItem(null)}
          onDone={() => { setCheckoutItem(null); load() }}
        />
      )}
      {checkinItem && (
        <CheckInModal
          item={checkinItem}
          onClose={() => setCheckinItem(null)}
          onDone={() => { setCheckinItem(null); load() }}
        />
      )}
      {repair && (
        <RepairModal
          item={repair.item}
          action={repair.action}
          onClose={() => setRepair(null)}
          onDone={(saved) => { setRepair(null); replace(saved) }}
        />
      )}
      {details !== undefined && (
        <DetailsModal
          item={details}
          onClose={() => setDetails(undefined)}
          onDone={(saved) => {
            setDetails(undefined)
            if (details) replace(saved)
            else setItems((prev) => [...prev, { ...saved, current: null }].sort((a, b) => a.name.localeCompare(b.name)))
          }}
        />
      )}
    </div>
  )
}

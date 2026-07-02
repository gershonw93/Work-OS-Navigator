'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { cn } from '@/lib/utils'
import {
  Plus, Wrench, Search, MapPin, User, LogOut, LogIn, X, Package,
} from 'lucide-react'

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
  status: string
  notes: string | null
  current: Current | null
}
type ProjectOpt = { id: string; name: string }
type Teammate = { id: string; full_name: string | null }

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'danger' | 'muted'> = {
  available: 'success',
  checked_out: 'warning',
  maintenance: 'danger',
  retired: 'muted',
}
const STATUS_LABEL: Record<string, string> = {
  available: 'Available',
  checked_out: 'Checked out',
  maintenance: 'Maintenance',
  retired: 'Retired',
}

function timeAgo(iso: string) {
  const d = new Date(iso)
  const days = Math.floor((Date.now() - d.getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

async function authHeaders() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
}

// ── Check-out modal — pick who + where, then Confirm (the 3rd click) ──────────
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
    setSaving(false)
    if (!res.ok) { setErr((await res.json()).error || 'Could not check out.'); return }
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Check out</h2>
            <p className="text-sm text-muted-fg">{item.name}{item.asset_tag ? ` · ${item.asset_tag}` : ''}</p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <Label>Who's taking it</Label>
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
            <Label>Where's it going</Label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Shop / Yard</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <Label>Note (optional)</Label>
            <Input placeholder="e.g. needs a new blade" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Confirm check-out'}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Add-equipment modal ──────────────────────────────────────────────────────
function AddModal({ onClose, onDone }: { onClose: () => void; onDone: (e: Equipment) => void }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [assetTag, setAssetTag] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function submit() {
    if (!name.trim()) { setErr('Name is required.'); return }
    setSaving(true); setErr('')
    const res = await fetch('/api/equipment', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ name: name.trim(), category: category.trim() || null, asset_tag: assetTag.trim() || null, notes: notes.trim() || null }),
    })
    setSaving(false)
    if (!res.ok) { setErr((await res.json()).error || 'Could not save.'); return }
    onDone((await res.json()).equipment)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="text-lg font-bold text-ink">Add equipment</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div><Label>Name</Label><Input placeholder="e.g. DeWalt table saw" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Category</Label><Input placeholder="Power tool" value={category} onChange={(e) => setCategory(e.target.value)} /></div>
            <div><Label>Asset tag</Label><Input placeholder="TS-014" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} /></div>
          </div>
          <div><Label>Notes (optional)</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          {err && <p className="text-sm text-danger">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add'}</Button>
        </div>
      </div>
    </div>
  )
}

export default function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([])
  const [projects, setProjects] = useState<ProjectOpt[]>([])
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [checkoutItem, setCheckoutItem] = useState<Equipment | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const busy = useRef<Set<string>>(new Set())

  async function load() {
    const res = await fetch('/api/equipment', { headers: await authHeaders() })
    if (res.ok) {
      const d = await res.json()
      setItems(d.equipment); setProjects(d.projects); setTeammates(d.teammates)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function checkIn(item: Equipment) {
    if (busy.current.has(item.id)) return
    busy.current.add(item.id)
    // Optimistic
    setItems((prev) => prev.map((e) => e.id === item.id ? { ...e, status: 'available', current: null } : e))
    await fetch(`/api/equipment/${item.id}/assignment`, { method: 'PATCH', headers: await authHeaders() })
    busy.current.delete(item.id)
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items.filter((e) => {
      if (statusFilter !== 'all' && e.status !== statusFilter) return false
      if (!q) return true
      return [e.name, e.category, e.asset_tag, e.current?.holder_name, e.current?.location]
        .filter(Boolean).some((s) => (s as string).toLowerCase().includes(q))
    })
  }, [items, query, statusFilter])

  const counts = useMemo(() => ({
    total: items.length,
    out: items.filter((e) => e.status === 'checked_out').length,
    available: items.filter((e) => e.status === 'available').length,
  }), [items])

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader
        title="Equipment"
        subtitle="Every tool and machine, who has it, and where it is."
        action={<Button onClick={() => setShowAdd(true)}><Plus className="mr-1.5 h-4 w-4" />Add equipment</Button>}
      />

      {/* Snapshot */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: counts.total, icon: Package },
          { label: 'Available', value: counts.available, icon: Wrench },
          { label: 'Out now', value: counts.out, icon: MapPin },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-line bg-panel px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-fg">{s.label}</p>
            <p className="mt-0.5 text-2xl font-bold text-ink">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <Input className="pl-9" placeholder="Search name, tag, holder, location…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:w-48">
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="checked_out">Checked out</option>
          <option value="maintenance">Maintenance</option>
          <option value="retired">Retired</option>
        </Select>
      </div>

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-fg">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={items.length === 0 ? 'No equipment yet' : 'Nothing matches'}
          description={items.length === 0 ? 'Add your first tool or machine to start tracking who has it.' : 'Try a different search or filter.'}
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((e) => {
            const out = e.status === 'checked_out'
            return (
              <div key={e.id} className="flex flex-col gap-3 rounded-xl border border-line bg-panel px-4 py-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-ink-soft">
                    <Wrench className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink">{e.name}</p>
                      <Badge variant={STATUS_VARIANT[e.status] ?? 'muted'}>{STATUS_LABEL[e.status] ?? e.status}</Badge>
                    </div>
                    <p className="truncate text-xs text-muted-fg">
                      {[e.category, e.asset_tag].filter(Boolean).join(' · ') || 'No category'}
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
                    <p className="text-sm text-muted-fg">In the shop</p>
                  )}
                </div>

                {/* Action */}
                <div className="shrink-0">
                  {out ? (
                    <Button variant="outline" size="sm" onClick={() => checkIn(e)}>
                      <LogIn className="mr-1.5 h-4 w-4" />Check in
                    </Button>
                  ) : e.status === 'available' ? (
                    <Button size="sm" onClick={() => setCheckoutItem(e)}>
                      <LogOut className="mr-1.5 h-4 w-4" />Check out
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled>Unavailable</Button>
                  )}
                </div>
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
      {showAdd && (
        <AddModal onClose={() => setShowAdd(false)} onDone={(e) => { setShowAdd(false); setItems((prev) => [...prev, e].sort((a, b) => a.name.localeCompare(b.name))) }} />
      )}
    </div>
  )
}

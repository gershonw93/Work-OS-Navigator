'use client'

import { useEffect, useState } from 'react'
import { Plus, X, CalendarDays, Pencil, Trash2, Building2, Flag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

const MILESTONE_COLORS = [
  { label: 'Blue',   value: 'blue',   bg: 'bg-blue-500',   light: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Green',  value: 'green',  bg: 'bg-green-500',  light: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Purple', value: 'purple', bg: 'bg-purple-500', light: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Red',    value: 'red',    bg: 'bg-red-500',    light: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Amber',  value: 'amber',  bg: 'bg-amber-500',  light: 'bg-amber-100 text-amber-700 border-amber-200' },
]

const SUB_BAR = 'bg-orange-500'
const SUB_LIGHT = 'bg-orange-100 text-orange-700 border-orange-200'

interface ScheduleItem {
  id: string
  label: string | null
  start_date: string
  end_date: string
  color: string | null
  subcontract_id: string | null
  subcontracts: {
    scope: string
    trade: string | null
    companies: { name: string } | null
  } | null
}

function getLabel(item: ScheduleItem) {
  if (item.label) return item.label
  if (item.subcontracts) return item.subcontracts.scope
  return 'Untitled'
}

function getSubLabel(item: ScheduleItem) {
  if (item.subcontracts?.companies?.name) return item.subcontracts.companies.name
  return null
}

function barColor(item: ScheduleItem) {
  if (item.subcontract_id) return SUB_BAR
  const c = MILESTONE_COLORS.find(c => c.value === item.color)
  return c?.bg ?? 'bg-slate-400'
}

function lightColor(item: ScheduleItem) {
  if (item.subcontract_id) return SUB_LIGHT
  const c = MILESTONE_COLORS.find(c => c.value === item.color)
  return c?.light ?? 'bg-slate-100 text-slate-700 border-slate-200'
}

function daysBetween(a: string, b: string) {
  return Math.max(1, Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000))
}

function addDays(date: string, days: number) {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateFull(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SchedulePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [addLabel, setAddLabel] = useState('')
  const [addStart, setAddStart] = useState('')
  const [addEnd, setAddEnd] = useState('')
  const [addColor, setAddColor] = useState('blue')
  const [addSaving, setAddSaving] = useState(false)

  const [editItem, setEditItem] = useState<ScheduleItem | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editColor, setEditColor] = useState('blue')
  const [editSaving, setEditSaving] = useState(false)

  const [unscheduled, setUnscheduled] = useState<{ id: string; scope: string; trade: string | null; companies: { id: string; name: string } | null }[]>([])
  const [schedulingSubId, setSchedulingSubId] = useState<string | null>(null)
  const [schedStart, setSchedStart] = useState('')
  const [schedEnd, setSchedEnd] = useState('')
  const [schedSaving, setSchedSaving] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setItems(data.items)
    }
    setLoading(false)
  }

  async function loadUnscheduled() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule/unscheduled`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const d = await res.json()
      setUnscheduled(d.subs ?? [])
    }
  }

  async function scheduleSubcontract(e: React.FormEvent) {
    e.preventDefault()
    if (!schedulingSubId) return
    setSchedSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ subcontract_id: schedulingSubId, start_date: schedStart, end_date: schedEnd }),
    })
    setSchedSaving(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(`Could not save: ${err.error ?? res.statusText}`)
      return
    }
    setSchedulingSubId(null); setSchedStart(''); setSchedEnd('')
    load(); loadUnscheduled()
  }

  useEffect(() => { load(); loadUnscheduled() }, [params.id])

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    setAddSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: addLabel, start_date: addStart, end_date: addEnd, color: addColor }),
    })
    setShowAdd(false)
    setAddLabel(''); setAddStart(''); setAddEnd(''); setAddColor('blue')
    setAddSaving(false)
    load(); loadUnscheduled()
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editItem) return
    setEditSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/schedule/${editItem.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: editLabel, start_date: editStart, end_date: editEnd, color: editColor }),
    })
    setEditItem(null)
    setEditSaving(false)
    load(); loadUnscheduled()
  }

  async function deleteItem(itemId: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/schedule/${itemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    load(); loadUnscheduled()
  }

  function openEdit(item: ScheduleItem) {
    setEditItem(item)
    setEditLabel(getLabel(item))
    setEditStart(item.start_date)
    setEditEnd(item.end_date)
    setEditColor(item.color ?? 'blue')
  }

  const sorted = [...items].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const minDate = sorted.length > 0 ? sorted[0].start_date : new Date().toISOString().split('T')[0]
  const maxDate = sorted.length > 0
    ? sorted.reduce((max, i) => i.end_date > max ? i.end_date : max, sorted[0].end_date)
    : addDays(minDate, 30)
  const totalDays = Math.max(daysBetween(minDate, maxDate), 14)

  const months: { label: string; startDay: number; days: number }[] = []
  let cursor = new Date(minDate + 'T00:00:00')
  const endCursor = new Date(maxDate + 'T00:00:00')
  while (cursor <= endCursor) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
    const clampedStart = cursor > monthStart ? cursor : monthStart
    const clampedEnd = monthEnd < endCursor ? monthEnd : endCursor
    const startDay = daysBetween(minDate, clampedStart.toISOString().split('T')[0])
    const days = daysBetween(clampedStart.toISOString().split('T')[0], clampedEnd.toISOString().split('T')[0]) + 1
    months.push({ label: cursor.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }), startDay, days })
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
  }

  return (
    <div className="space-y-6">

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add Milestone</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={addItem}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="alabel">Label <span className="text-red-500">*</span></Label>
                  <Input id="alabel" placeholder="e.g. Permits Approved" value={addLabel} onChange={e => setAddLabel(e.target.value)} required autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="astart">Start Date <span className="text-red-500">*</span></Label>
                    <Input id="astart" type="date" value={addStart} onChange={e => setAddStart(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="aend">End Date <span className="text-red-500">*</span></Label>
                    <Input id="aend" type="date" value={addEnd} onChange={e => setAddEnd(e.target.value)} required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex gap-2">
                    {MILESTONE_COLORS.map(c => (
                      <button key={c.value} type="button" onClick={() => setAddColor(c.value)}
                        className={cn('h-7 w-7 rounded-full transition-all', c.bg, addColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100')} />
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={addSaving || !addLabel || !addStart || !addEnd}>
                  {addSaving ? 'Adding...' : 'Add Milestone'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit Item</h2>
              <button onClick={() => setEditItem(null)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={saveEdit}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="elabel">Label</Label>
                  <Input id="elabel" value={editLabel} onChange={e => setEditLabel(e.target.value)} required autoFocus />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="estart">Start Date</Label>
                    <Input id="estart" type="date" value={editStart} onChange={e => setEditStart(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="eend">End Date</Label>
                    <Input id="eend" type="date" value={editEnd} onChange={e => setEditEnd(e.target.value)} required />
                  </div>
                </div>
                {!editItem.subcontract_id && (
                  <div className="space-y-1.5">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      {MILESTONE_COLORS.map(c => (
                        <button key={c.value} type="button" onClick={() => setEditColor(c.value)}
                          className={cn('h-7 w-7 rounded-full transition-all', c.bg, editColor === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'opacity-60 hover:opacity-100')} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap items-center gap-2 justify-between">
                <button type="button" onClick={() => { deleteItem(editItem.id); setEditItem(null) }}
                  className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setEditItem(null)}>Cancel</Button>
                  <Button type="submit" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Schedule</h1>
          <p className="text-sm text-slate-500 mt-0.5">Auto-populated from awarded bids. Add milestones manually.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="self-start sm:self-auto"><Plus className="h-4 w-4" />Add Milestone</Button>
      </div>

      {unscheduled.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold text-amber-800">
              {unscheduled.length} subcontractor{unscheduled.length > 1 ? 's' : ''} not yet scheduled
            </span>
          </div>
          <div className="space-y-2">
            {unscheduled.map(sub => (
              <div key={sub.id} className="flex flex-wrap items-center gap-3 bg-white rounded-lg border border-amber-100 px-3 py-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-800">{sub.companies?.name ?? 'Unknown'}</p>
                  <p className="text-xs text-slate-400 truncate">{sub.trade ? `${sub.trade} · ` : ''}{sub.scope}</p>
                </div>
                {schedulingSubId === sub.id ? (
                  <form onSubmit={scheduleSubcontract} className="flex items-center gap-2 flex-wrap">
                    <Input type="date" className="w-36 h-8 text-xs" value={schedStart} onChange={e => setSchedStart(e.target.value)} required />
                    <span className="text-slate-400 text-xs">to</span>
                    <Input type="date" className="w-36 h-8 text-xs" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} required />
                    <Button size="sm" type="submit" disabled={schedSaving} className="h-8">{schedSaving ? 'Saving…' : 'Add'}</Button>
                    <button type="button" onClick={() => setSchedulingSubId(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
                  </form>
                ) : (
                  <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => { setSchedulingSubId(sub.id); setSchedStart(''); setSchedEnd('') }}>
                    <CalendarDays className="h-3.5 w-3.5" /> Set Dates
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <CalendarDays className="h-10 w-10 text-slate-200 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No schedule yet</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">Add subcontractors with dates on the Team tab, or add milestones manually.</p>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4" />Add Milestone</Button>
        </div>
      ) : (
        <div className="space-y-5">

          {/* Gantt */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-w-0">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-700">Timeline</span>
              <span className="text-xs text-slate-400 ml-1">{formatDateFull(minDate)} — {formatDateFull(maxDate)}</span>
            </div>
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(700, totalDays * 18) + 220 }}>
                <div className="flex border-b border-slate-100" style={{ paddingLeft: 220 }}>
                  {months.map((m, i) => (
                    <div key={i} className="text-xs font-medium text-slate-400 px-2 py-2 border-r border-slate-100 shrink-0" style={{ width: m.days * 18 }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                <div className="divide-y divide-slate-50">
                  {sorted.map(item => {
                    const offsetDays = daysBetween(minDate, item.start_date)
                    const spanDays = daysBetween(item.start_date, item.end_date) + 1
                    return (
                      <div key={item.id} className="flex items-center hover:bg-slate-50 group">
                        <div className="w-[220px] shrink-0 px-4 py-2.5 flex items-center gap-2.5">
                          <div className={cn('h-6 w-6 rounded flex items-center justify-center shrink-0', item.subcontract_id ? 'bg-orange-100' : 'bg-slate-100')}>
                            {item.subcontract_id ? <Building2 className="h-3.5 w-3.5 text-orange-500" /> : <Flag className="h-3.5 w-3.5 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-800 truncate">{getLabel(item)}</p>
                            {getSubLabel(item) && <p className="text-xs text-slate-400 truncate">{getSubLabel(item)}</p>}
                          </div>
                        </div>
                        <div className="flex-1 relative py-2.5 pr-4" style={{ paddingLeft: Math.max(0, offsetDays - 1) * 18 }}>
                          <div
                            className={cn('h-7 rounded-md flex items-center px-2 cursor-pointer transition-opacity hover:opacity-80', barColor(item))}
                            style={{ width: Math.max(spanDays * 18, 36) }}
                            onClick={() => openEdit(item)}
                          >
                            <span className="text-xs text-white font-medium truncate">{spanDays}d</span>
                          </div>
                        </div>
                        <div className="pr-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-slate-600 p-1 rounded">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* List */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <span className="text-sm font-semibold text-slate-700">All Items</span>
            </div>
            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-100">
              {sorted.map(item => {
                const duration = daysBetween(item.start_date, item.end_date) + 1
                return (
                  <div key={item.id} className="px-4 py-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn('h-2 w-2 rounded-full shrink-0', barColor(item))} />
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{getLabel(item)}</p>
                          {getSubLabel(item) && <p className="text-xs text-slate-400 truncate">{getSubLabel(item)}</p>}
                        </div>
                      </div>
                      <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-slate-600 p-1 rounded shrink-0">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                      <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', lightColor(item))}>
                        {item.subcontract_id ? 'Sub Work' : 'Milestone'}
                      </span>
                      <span>{formatDate(item.start_date)} – {formatDate(item.end_date)}</span>
                      <span className="text-slate-400">{duration} day{duration !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop table */}
            <table className="w-full text-sm hidden md:table">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Item</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Type</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Start</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">End</th>
                  <th className="text-left px-5 py-3 font-medium text-slate-600">Duration</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sorted.map(item => {
                  const duration = daysBetween(item.start_date, item.end_date) + 1
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={cn('h-2 w-2 rounded-full shrink-0', barColor(item))} />
                          <span className="font-medium text-slate-800">{getLabel(item)}</span>
                        </div>
                        {getSubLabel(item) && <p className="text-xs text-slate-400 ml-4 mt-0.5">{getSubLabel(item)}</p>}
                      </td>
                      <td className="px-5 py-3">
                        <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full border', lightColor(item))}>
                          {item.subcontract_id ? 'Sub Work' : 'Milestone'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(item.start_date)}</td>
                      <td className="px-5 py-3 text-slate-600">{formatDate(item.end_date)}</td>
                      <td className="px-5 py-3 text-slate-600">{duration} day{duration !== 1 ? 's' : ''}</td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-slate-600 p-1 rounded">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

        </div>
      )}
    </div>
  )
}

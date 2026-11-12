'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Link2, ListChecks, Lock, Plus, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { usePermissions } from '@/lib/use-permissions'
import { useLandOnParam } from '@/lib/use-land-on'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { fetchProblem } from '@/lib/fetch-error'
import { todayDateInput, dayWords } from '@/lib/dates'
import { cn } from '@/lib/utils'
import {
  attentionDate, boardLabels, calendarEntries, cardDue, cardsIn, checklistProgress, columnProblem, filterCards, monthGrid, placeAt, pmAllowedRole,
  PM_LABEL, PM_MONTHS, PM_PRIORITY_LABEL, PM_TONE_CLASS,
  type PmCalendarEntry, type PmCard, type PmColumn,
} from '@/lib/project-management'
import { getImpersonation } from '@/components/layout/impersonate-switcher'
import { CardDrawer, type PmApi } from './card-drawer'

// ─────────────────────────────────────────────────────────────────────────────
// Project Management: the signed-in person's OWN board for this job.
//
// Three views of the same cards - Board, Table, Calendar - and one drawer that
// edits a card. Below `lg` the board is one column at a time with a "Move to"
// menu on each card, because dragging a card across columns that are off the
// screen is not something a thumb can do; from `lg` up the columns sit side by
// side and a card is dragged.
//
// Every request goes to /api/projects/[id]/project-management, which answers
// only for the caller's own rows. Nothing on this screen can show anybody
// else's board - an admin previewing another person still sees their own.
// ─────────────────────────────────────────────────────────────────────────────

type View = 'board' | 'table' | 'calendar'
type Sort = 'board' | 'due' | 'priority'
const VIEWS: { key: View; label: string }[] = [
  { key: 'board', label: 'Board' }, { key: 'table', label: 'Table' }, { key: 'calendar', label: 'Calendar' },
]
const VIEW_KEY = 'sytenav_pm_view'
const PRIORITY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 }
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function sorted(cards: PmCard[], sort: Sort): PmCard[] {
  if (sort === 'board') return cards
  const copy = [...cards]
  if (sort === 'priority') return copy.sort((a, b) => (PRIORITY_RANK[a.priority] ?? 1) - (PRIORITY_RANK[b.priority] ?? 1))
  // Undated cards go LAST: an empty string sorts before every real date.
  return copy.sort((a, b) => (attentionDate(a) || '9999').localeCompare(attentionDate(b) || '9999'))
}

// ── Pieces, hoisted: a component declared inside a component is a new type on
// every render, and takes the state inside it with it. ───────────────────────

function LabelChips({ card }: { card: PmCard }) {
  if (!card.labels.length && card.priority !== 'high') return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {card.labels.map(l => (
        <span key={l.name} className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', PM_TONE_CLASS[l.tone])}>{l.name}</span>
      ))}
      {card.priority === 'high' && (
        <span className="whitespace-nowrap rounded-full bg-danger-tint px-2 py-0.5 text-[11px] font-semibold text-danger">High priority</span>
      )}
    </div>
  )
}

function CardMeta({ card, today }: { card: PmCard; today: string }) {
  const due = cardDue(card, today)
  const progress = checklistProgress(card.checklist)
  if (!due && !progress && !card.link_label) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-fg">
      {due && (
        <span className={cn(
          due.subtask ? 'min-w-0 break-words' : 'whitespace-nowrap',
          due.tone === 'overdue' && 'font-semibold text-danger',
          due.tone === 'today' && 'font-semibold text-ink',
          due.tone === 'done' && 'font-semibold text-success',
        )}>{due.text}</span>
      )}
      {progress && (
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <ListChecks className="h-3.5 w-3.5" />{progress.done} of {progress.total}
        </span>
      )}
      {card.link_label && (
        <span className="inline-flex min-w-0 items-center gap-1 text-info">
          <Link2 className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{card.link_label}</span>
        </span>
      )}
    </div>
  )
}

function CardTitle({ card }: { card: PmCard }) {
  return (
    <span className={cn('block break-words text-sm leading-snug', card.completed_at ? 'font-medium text-muted-fg line-through' : 'font-semibold text-ink')}>
      {card.title}
    </span>
  )
}

interface ColumnDialogState { mode: 'add' | 'rename'; column?: PmColumn }

function ColumnDialog({ state, columns, onClose, onSubmit }: {
  state: ColumnDialogState
  columns: PmColumn[]
  onClose: () => void
  onSubmit: (name: string) => Promise<string | null>
}) {
  const [name, setName] = useState(state.column?.name ?? '')
  const [problem, setProblem] = useState('')
  const [saving, setSaving] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const wrong = columnProblem(name, columns.filter(c => c.id !== state.column?.id).map(c => c.name))
    if (wrong) { setProblem(wrong); return }
    setSaving(true)
    const failed = await onSubmit(name.trim())
    setSaving(false)
    if (failed) setProblem(failed)
  }

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <form onSubmit={submit} onClick={e => e.stopPropagation()}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-panel p-5 shadow-2xl">
        <h2 className="text-base font-bold text-ink">{state.mode === 'add' ? 'Add a column' : 'Rename the column'}</h2>
        <div className="space-y-1.5">
          <Label htmlFor="pm-column-name">Name *</Label>
          <Input id="pm-column-name" value={name} maxLength={40} autoFocus={autoFocusOnDesktop()}
            onChange={e => setName(e.target.value)} placeholder="Waiting on the client" />
          {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
        </div>
        <div className="row-even gap-2 lg:flex lg:justify-end">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : state.mode === 'add' ? 'Add column' : 'Save'}</Button>
        </div>
      </form>
    </div>
  )
}

function ColumnMenu({ column, index, count, onRename, onToggleDone, onShift, onDelete }: {
  column: PmColumn; index: number; count: number
  onRename: () => void; onToggleDone: () => void; onShift: (by: number) => void; onDelete: () => void
}) {
  return (
    <RowMenu label={`Options for ${column.name}`}>
      {close => (
        <>
          <MenuItem onClick={() => { close(); onRename() }}>Rename</MenuItem>
          <MenuItem onClick={() => { close(); onToggleDone() }}>
            {column.is_done ? 'Stop treating its cards as done' : 'Cards here are done'}
          </MenuItem>
          {index > 0 && <MenuItem onClick={() => { close(); onShift(-1) }}>Move left</MenuItem>}
          {index < count - 1 && <MenuItem onClick={() => { close(); onShift(1) }}>Move right</MenuItem>}
          <MenuItem danger onClick={() => { close(); onDelete() }}>Delete column</MenuItem>
        </>
      )}
    </RowMenu>
  )
}

// ── The screen ───────────────────────────────────────────────────────────────

export function PmBoard({ projectId }: { projectId: string }) {
  const notice = useNotice()
  const guardDelete = useDeleteGuard()
  const { role, loading: permsLoading, previewing } = usePermissions()

  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [failure, setFailure] = useState('')
  const [columns, setColumns] = useState<PmColumn[]>([])
  const [cards, setCards] = useState<PmCard[]>([])
  const [linkTypes, setLinkTypes] = useState<string[]>([])

  const [view, setView] = useState<View>('board')
  const [sort, setSort] = useState<Sort>('board')
  const [query, setQuery] = useState('')
  const [label, setLabel] = useState('')
  const [phoneColumn, setPhoneColumn] = useState('')
  const [drawer, setDrawer] = useState<{ card: PmCard | null; columnId: string | null } | null>(null)
  const [columnDialog, setColumnDialog] = useState<ColumnDialogState | null>(null)
  const [dragId, setDragId] = useState('')
  const [over, setOver] = useState<{ columnId: string; beforeId: string | null } | null>(null)

  const today = todayDateInput()
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [day, setDay] = useState(today)

  const api: PmApi = useCallback(async (path, init) => {
    const { data: { session } } = await createClient().auth.getSession()
    const res = await fetch(`/api/projects/${projectId}/project-management${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${session?.access_token ?? ''}`,
        ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || `That did not work (${res.status}).`)
    return data
  }, [projectId])

  const load = useCallback(async () => {
    try {
      const d = await api('')
      setColumns(d.columns ?? []); setCards(d.cards ?? []); setLinkTypes(d.linkTypes ?? [])
      setState('ready'); setFailure('')
    } catch (e) {
      setFailure(fetchProblem(e, 'loading your board')); setState('failed')
    }
  }, [api])

  const allowed = pmAllowedRole(role)
  // The platform console can sign in AS somebody to support them. That session
  // is theirs in every way the server can see, so the screen is what declines:
  // a private board is not something support looks at. `null` until asked.
  const [impersonating, setImpersonating] = useState<boolean | null>(null)
  useEffect(() => { setImpersonating(!!getImpersonation()) }, [])
  useEffect(() => { if (!permsLoading && allowed && impersonating === false) load() }, [permsLoading, allowed, impersonating, load])

  // The view is a per-device convenience; the board works without it.
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_KEY)
      if (v === 'board' || v === 'table' || v === 'calendar') setView(v)
    } catch { /* private window */ }
  }, [])
  function pickView(v: View) {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private window */ }
  }

  // My Work links here with ?card=<id>: open that card, once.
  useLandOnParam('card', state === 'ready', id => {
    const card = cards.find(c => c.id === id)
    if (card) setDrawer({ card, columnId: card.column_id })
  })

  const shown = useMemo(() => filterCards(cards, query, label), [cards, query, label])
  const labels = useMemo(() => boardLabels(cards), [cards])
  const activePhoneColumn = columns.find(c => c.id === phoneColumn) ?? columns[0]

  // ── Writes. Each one re-reads the board on failure, so the screen never
  // keeps showing a move the server refused. ────────────────────────────────
  async function moveCard(card: PmCard, columnId: string, beforeId: string | null) {
    const target = columns.find(c => c.id === columnId)
    if (!target) return
    const there = cardsIn(cards, columnId).map(c => c.id).filter(id => id !== card.id)
    const index = beforeId ? there.indexOf(beforeId) : -1
    const order = placeAt(there, card.id, index < 0 ? null : index)
    if (card.column_id === columnId && cardsIn(cards, columnId).map(c => c.id).join() === order.join()) return
    setCards(prev => prev.map(c => {
      const at = order.indexOf(c.id)
      if (c.id === card.id) {
        return { ...c, column_id: columnId, position: at, completed_at: target.is_done ? (c.completed_at ?? new Date().toISOString()) : null }
      }
      return at >= 0 ? { ...c, position: at } : c
    }))
    try {
      await api(`/cards/${card.id}`, { method: 'PATCH', body: { column_id: columnId, position: order.indexOf(card.id) } })
    } catch (e) {
      notice(fetchProblem(e, 'moving the card'))
      load()
    }
  }

  async function submitColumn(name: string): Promise<string | null> {
    try {
      if (columnDialog?.mode === 'rename' && columnDialog.column) {
        await api(`/columns/${columnDialog.column.id}`, { method: 'PATCH', body: { name } })
      } else {
        await api('/columns', { method: 'POST', body: { name } })
      }
      setColumnDialog(null)
      await load()
      return null
    } catch (e) {
      return fetchProblem(e, 'saving the column')
    }
  }

  async function toggleDone(column: PmColumn) {
    try {
      await api(`/columns/${column.id}`, { method: 'PATCH', body: { is_done: !column.is_done } })
      await load()
    } catch (e) { notice(fetchProblem(e, 'changing the column')) }
  }

  async function shiftColumn(column: PmColumn, by: number) {
    const ids = columns.map(c => c.id)
    const from = ids.indexOf(column.id)
    const order = placeAt(ids, column.id, from + by)
    setColumns(order.map((id, i) => ({ ...columns.find(c => c.id === id)!, position: i })))
    try {
      await api('/columns', { method: 'PUT', body: { order } })
    } catch (e) {
      notice(fetchProblem(e, 'moving the column'))
      load()
    }
  }

  function deleteColumn(column: PmColumn) {
    // The route refuses a column with cards in it (they would go with it), so
    // the answer is given here rather than arriving as a failed request.
    const inside = cards.filter(c => c.column_id === column.id).length
    if (inside) {
      notice(`${column.name} still holds ${inside} ${inside === 1 ? 'card' : 'cards'}. Move or delete ${inside === 1 ? 'it' : 'them'} first.`)
      return
    }
    guardDelete(async () => {
      try {
        await api(`/columns/${column.id}`, { method: 'DELETE' })
        await load()
      } catch (e) { notice(fetchProblem(e, 'deleting the column')) }
    }, { title: `Delete the ${column.name} column?`, body: 'It is empty, so nothing else goes with it.', confirmLabel: 'Delete column' })
  }

  function deleteCard(card: PmCard) {
    guardDelete(async () => {
      try {
        await api(`/cards/${card.id}`, { method: 'DELETE' })
        await load()
      } catch (e) { notice(fetchProblem(e, 'deleting the card')) }
    }, { title: 'Delete this card?', body: 'Its notes and checklist go with it, and it cannot be undone.', confirmLabel: 'Delete card' })
  }

  const open = (card: PmCard) => setDrawer({ card, columnId: card.column_id })
  const columnMenu = (c: PmColumn, i: number) => (
    <ColumnMenu column={c} index={i} count={columns.length}
      onRename={() => setColumnDialog({ mode: 'rename', column: c })}
      onToggleDone={() => toggleDone(c)} onShift={by => shiftColumn(c, by)} onDelete={() => deleteColumn(c)} />
  )

  // ── What the page says before there is a board to show ─────────────────────
  const heading = (
    <div className="min-w-0 flex-1">
      <h1 className="text-2xl font-bold tracking-tight text-ink">{PM_LABEL}</h1>
      <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-fg">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Yours alone. Nobody else on this job can see it, your admin included.</span>
      </p>
    </div>
  )

  if (permsLoading || impersonating === null) return <div className="p-0 lg:p-6"><p className="py-16 text-center text-sm text-faint">Loading…</p></div>
  if (impersonating) {
    return (
      <div className="p-0 lg:p-6">
        <div className="py-16 text-center">
          <Lock className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-3 text-sm font-medium text-ink-soft">Private boards are not shown while you are signed in as somebody else</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-fg">{PM_LABEL} belongs to the person, so the support console does not open it.</p>
        </div>
      </div>
    )
  }
  if (!allowed) {
    return (
      <div className="p-0 lg:p-6">
        <div className="py-16 text-center">
          <Lock className="mx-auto h-6 w-6 text-faint" />
          <p className="mt-3 text-sm font-medium text-ink-soft">{PM_LABEL} is not part of Field Mode</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-muted-fg">It is a private board for every role except Worker.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-0 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
        {heading}
        {state === 'ready' && (
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="View" className="inline-flex rounded-xl bg-muted p-1">
              {VIEWS.map(v => (
                <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => pickView(v.key)}
                  className={cn('min-h-9 whitespace-nowrap rounded-lg px-3.5 text-sm', view === v.key ? 'bg-panel font-semibold text-ink' : 'font-medium text-ink-soft')}>
                  {v.label}
                </button>
              ))}
            </div>
            <Button type="button" className={cn(view === 'board' && 'hidden lg:inline-flex')} onClick={() => setDrawer({ card: null, columnId: null })}>
              <Plus className="mr-1.5 h-4 w-4" />Add card
            </Button>
          </div>
        )}
      </div>

      {previewing && (
        <p className="rounded-xl border border-warn/30 bg-warn-tint px-3.5 py-2.5 text-sm text-warn">
          You are previewing somebody else&apos;s access. This is still YOUR board - nobody, in any role, can open another person&apos;s.
        </p>
      )}

      {state === 'loading' && <p className="py-16 text-center text-sm text-faint">Loading your board…</p>}
      {state === 'failed' && (
        <div className="py-16 text-center">
          <p className="text-sm font-medium text-ink-soft">Your board could not be loaded.</p>
          <p className="mx-auto mt-1 max-w-md text-xs text-muted-fg">{failure}</p>
          <Button type="button" variant="outline" className="mt-4" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
            <div className="relative min-w-0 flex-1 lg:max-w-xs">
              <Label htmlFor="pm-search" className="sr-only">Search your cards</Label>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
              <Input id="pm-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search your cards" className="pl-9" />
            </div>
            {labels.length > 0 && (
              <div className="lg:w-44">
                <Label htmlFor="pm-label-filter" className="sr-only">Label</Label>
                <Select id="pm-label-filter" value={label} onChange={e => setLabel(e.target.value)}>
                  <option value="">Every label</option>
                  {labels.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                </Select>
              </div>
            )}
            {view === 'table' && (
              <div className="lg:w-44">
                <Label htmlFor="pm-sort" className="sr-only">Sort</Label>
                <Select id="pm-sort" value={sort} onChange={e => setSort(e.target.value as Sort)}>
                  <option value="board">Board order</option>
                  <option value="due">By due date</option>
                  <option value="priority">By priority</option>
                </Select>
              </div>
            )}
          </div>

          {(query || label) && (
            <p className="text-xs text-muted-fg">
              Showing {shown.length} of {cards.length} {cards.length === 1 ? 'card' : 'cards'}.{' '}
              <button type="button" className="font-medium text-accent-fg hover:underline" onClick={() => { setQuery(''); setLabel('') }}>Show all</button>
            </p>
          )}

          {/* ── BOARD, desktop: columns side by side, cards dragged ───────── */}
          {view === 'board' && (
            <div className="hidden min-h-[26rem] items-start gap-4 overflow-x-auto pb-4 lg:flex">
              {columns.map((c, i) => {
                const list = cardsIn(shown, c.id)
                const isOver = over?.columnId === c.id
                return (
                  <section key={c.id} aria-label={c.name}
                    className={cn('flex w-64 shrink-0 flex-col gap-2.5 rounded-xl p-1', isOver && dragId && 'bg-muted')}
                    onDragOver={e => { if (dragId) { e.preventDefault(); if (!isOver || over?.beforeId !== null) setOver({ columnId: c.id, beforeId: null }) } }}
                    onDrop={e => {
                      e.preventDefault()
                      const card = cards.find(x => x.id === dragId)
                      const beforeId = over?.columnId === c.id ? over.beforeId : null
                      setDragId(''); setOver(null)
                      if (card) moveCard(card, c.id, beforeId)
                    }}>
                    <div className="flex items-center gap-2 px-1">
                      <h2 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-ink">{c.name}</h2>
                      <span className="text-xs text-muted-fg">{list.length}</span>
                      <span className="flex-1" />
                      {columnMenu(c, i)}
                    </div>
                    {list.map(card => (
                      <div key={card.id} role="button" tabIndex={0} draggable
                        onDragStart={e => { setDragId(card.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id) }}
                        onDragEnd={() => { setDragId(''); setOver(null) }}
                        onDragOver={e => {
                          if (!dragId || dragId === card.id) return
                          e.preventDefault(); e.stopPropagation()
                          if (over?.columnId !== c.id || over.beforeId !== card.id) setOver({ columnId: c.id, beforeId: card.id })
                        }}
                        onClick={() => open(card)}
                        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(card) } }}
                        className={cn(
                          'flex cursor-pointer flex-col gap-2 rounded-xl border border-line bg-panel p-3 text-left hover:border-muted2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                          dragId === card.id && 'opacity-40',
                          isOver && over?.beforeId === card.id && dragId && 'border-t-2 border-t-accent-fg',
                        )}>
                        <LabelChips card={card} />
                        <CardTitle card={card} />
                        <CardMeta card={card} today={today} />
                      </div>
                    ))}
                    <button type="button" onClick={() => setDrawer({ card: null, columnId: c.id })}
                      className="rounded-xl border border-dashed border-muted2 px-3 py-2.5 text-left text-sm font-medium text-ink-soft hover:bg-panel">
                      + Add card
                    </button>
                  </section>
                )
              })}
              <button type="button" onClick={() => setColumnDialog({ mode: 'add' })}
                className="shrink-0 whitespace-nowrap rounded-xl border border-dashed border-muted2 px-3.5 py-2.5 text-sm font-medium text-ink-soft hover:bg-panel">
                + Add column
              </button>
            </div>
          )}

          {/* ── BOARD, phone: one column at a time ───────────────────────── */}
          {view === 'board' && activePhoneColumn && (
            <div className="space-y-4 lg:hidden">
              <div className="flex items-center gap-2">
                <div role="tablist" aria-label="Columns" className="scroll-fade -mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 scrollbar-hide">
                  {columns.map(c => {
                    const on = c.id === activePhoneColumn.id
                    return (
                      <button key={c.id} type="button" role="tab" aria-selected={on} onClick={() => setPhoneColumn(c.id)}
                        className={cn('min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm',
                          on ? 'border-ink bg-ink font-semibold text-panel' : 'border-line bg-panel font-medium text-ink')}>
                        {c.name} {cardsIn(shown, c.id).length}
                      </button>
                    )
                  })}
                </div>
                {columnMenu(activePhoneColumn, columns.findIndex(c => c.id === activePhoneColumn.id))}
              </div>

              {cardsIn(shown, activePhoneColumn.id).length === 0 ? (
                <p className="rounded-2xl border border-line bg-panel px-4 py-8 text-center text-sm text-muted-fg">
                  Nothing in {activePhoneColumn.name}.
                </p>
              ) : (
                <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
                  {cardsIn(shown, activePhoneColumn.id).map(card => (
                    <div key={card.id} className="flex items-start gap-1 py-1 pl-4 pr-2">
                      <button type="button" onClick={() => open(card)} className="flex min-w-0 flex-1 flex-col gap-1.5 py-3 text-left">
                        <CardTitle card={card} />
                        <LabelChips card={card} />
                        <CardMeta card={card} today={today} />
                      </button>
                      <div className="pt-1.5">
                        <RowMenu label={`Move or edit ${card.title}`}>
                          {close => (
                            <>
                              {columns.filter(c => c.id !== card.column_id).map(c => (
                                <MenuItem key={c.id} onClick={() => { close(); moveCard(card, c.id, null) }}>Move to {c.name}</MenuItem>
                              ))}
                              <MenuItem onClick={() => { close(); open(card) }}>Edit</MenuItem>
                              <MenuItem danger onClick={() => { close(); deleteCard(card) }}>Delete</MenuItem>
                            </>
                          )}
                        </RowMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="row-even gap-2">
                <Button type="button" className="h-12" onClick={() => setDrawer({ card: null, columnId: activePhoneColumn.id })}>
                  <Plus className="mr-1.5 h-4 w-4" />Add card
                </Button>
                <Button type="button" variant="outline" className="h-12" onClick={() => setColumnDialog({ mode: 'add' })}>Add column</Button>
              </div>
            </div>
          )}

          {/* ── TABLE, desktop ───────────────────────────────────────────── */}
          {view === 'table' && (
            <div className="hidden lg:block overflow-x-auto rounded-2xl border border-line bg-panel">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-fg">
                    {['Card', 'Labels', 'Priority', 'Due', 'Subtasks', 'Linked to'].map(h => (
                      <th key={h} scope="col" className="border-b border-line px-4 py-3 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {columns.map(c => {
                    const list = sorted(cardsIn(shown, c.id), sort)
                    return [
                      <tr key={c.id}>
                        <th scope="colgroup" colSpan={6} className="border-b border-line bg-surface px-4 pb-2 pt-3.5 text-left text-xs font-bold uppercase tracking-wider text-ink">
                          {c.name} <span className="font-medium text-muted-fg">{list.length}</span>
                        </th>
                      </tr>,
                      ...list.map(card => {
                        const due = cardDue(card, today)
                        const progress = checklistProgress(card.checklist)
                        return (
                          <tr key={card.id} onClick={() => open(card)} className="cursor-pointer border-b border-line-soft hover:bg-surface">
                            <td className="px-4 py-3">
                              <button type="button" className="text-left" onClick={e => { e.stopPropagation(); open(card) }}><CardTitle card={card} /></button>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1.5">
                                {card.labels.map(l => (
                                  <span key={l.name} className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', PM_TONE_CLASS[l.tone])}>{l.name}</span>
                                ))}
                                {!card.labels.length && '-'}
                              </div>
                            </td>
                            <td className={cn('whitespace-nowrap px-4 py-3', card.priority === 'high' && 'font-semibold text-danger')}>{PM_PRIORITY_LABEL[card.priority] ?? '-'}</td>
                            <td className={cn('px-4 py-3', !due?.subtask && 'whitespace-nowrap',
                              due?.tone === 'overdue' && 'font-semibold text-danger',
                              due?.tone === 'today' && 'font-semibold',
                              due?.tone === 'done' && 'font-semibold text-success')}>{due?.text ?? '-'}</td>
                            <td className="whitespace-nowrap px-4 py-3">{progress ? `${progress.done} of ${progress.total}` : '-'}</td>
                            <td className="px-4 py-3 text-info">{card.link_label ?? <span className="text-ink">-</span>}</td>
                          </tr>
                        )
                      }),
                    ]
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TABLE, phone: the same groups as lists ───────────────────── */}
          {view === 'table' && (
            <div className="space-y-5 lg:hidden">
              {columns.map(c => {
                const list = sorted(cardsIn(shown, c.id), sort)
                return (
                  <section key={c.id} aria-label={c.name} className="space-y-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-ink">{c.name} <span className="font-medium text-muted-fg">{list.length}</span></h2>
                    {list.length > 0 && (
                      <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
                        {list.map(card => (
                          <button key={card.id} type="button" onClick={() => open(card)} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left">
                            <CardTitle card={card} />
                            <LabelChips card={card} />
                            <CardMeta card={card} today={today} />
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          )}

          {/* ── CALENDAR: cards by due date ──────────────────────────────── */}
          {view === 'calendar' && (() => {
            const entries = calendarEntries(shown)
            const byDay = new Map<string, PmCalendarEntry[]>()
            for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
            const onCalendar = new Set(entries.map(e => e.card.id))
            const undated = shown.filter(c => !onCalendar.has(c.id)).length
            const picked = byDay.get(day) ?? []
            const step = (by: number) => {
              const d = new Date(Date.UTC(month.y, month.m + by, 1))
              setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
            }
            return (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 text-base font-bold text-ink">{PM_MONTHS[month.m]} {month.y}</h2>
                  <Button type="button" variant="outline" size="sm" onClick={() => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setDay(today) }}>Today</Button>
                  <button type="button" aria-label="Previous month" title="Previous month" onClick={() => step(-1)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface lg:h-9 lg:w-9"><ChevronLeft className="h-4 w-4" /></button>
                  <button type="button" aria-label="Next month" title="Next month" onClick={() => step(1)}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-line text-ink-soft hover:bg-surface lg:h-9 lg:w-9"><ChevronRight className="h-4 w-4" /></button>
                </div>

                <div className="rounded-2xl border border-line bg-panel">
                  <div className="grid grid-cols-7 border-b border-line">
                    {WEEKDAYS.map(w => <div key={w} className="px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-fg">{w}</div>)}
                  </div>
                  {monthGrid(month.y, month.m).map((week, wi) => (
                    <div key={wi} className="grid grid-cols-7 border-b border-line-soft last:border-b-0">
                      {week.map((iso, di) => {
                        if (!iso) return <div key={di} className="min-h-[3.25rem] border-r border-line-soft last:border-r-0 lg:min-h-[6.5rem]" />
                        const list = byDay.get(iso) ?? []
                        const late = iso < today && list.some(e => !e.done)
                        return (
                          <button key={di} type="button" onClick={() => setDay(iso)} aria-pressed={day === iso}
                            aria-label={`${dayWords(iso, { weekday: true })}, ${list.length} due`}
                            className={cn('flex min-h-[3.25rem] min-w-0 flex-col items-stretch gap-1 border-r border-line-soft p-1.5 text-left last:border-r-0 lg:min-h-[6.5rem]',
                              day === iso ? 'bg-surface' : 'hover:bg-surface')}>
                            <span className={cn('flex h-6 w-6 items-center justify-center self-start whitespace-nowrap rounded-full text-xs',
                              iso === today ? 'bg-accent font-bold text-accent-ink' : 'font-medium text-ink-soft')}>{Number(iso.slice(8))}</span>
                            {/* A phone cell is ~50px wide: a dot, and the day itself is the control. */}
                            {list.length > 0 && (
                              <span className="flex items-center gap-1 lg:hidden">
                                <span className={cn('h-1.5 w-1.5 rounded-full', late ? 'bg-danger-solid' : 'bg-info-solid')} />
                                <span className="text-[11px] text-muted-fg">{list.length}</span>
                              </span>
                            )}
                            <span className="hidden min-w-0 flex-col gap-1 lg:flex">
                              {list.slice(0, 3).map(e => (
                                <span key={e.card.id + (e.subtask?.id ?? '')} className={cn('truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                                  e.done ? 'bg-muted text-muted-fg line-through' : iso < today ? 'bg-danger-tint text-danger' : 'bg-info-tint text-info')}>{e.subtask?.text ?? e.card.title}</span>
                              ))}
                              {list.length > 3 && <span className="text-[11px] text-muted-fg">+{list.length - 3} more</span>}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>

                <section aria-label="Cards on the chosen day" className="space-y-2">
                  <h2 className="text-sm font-bold text-ink">{dayWords(day, { weekday: true }) ?? 'Pick a day'}</h2>
                  {picked.length === 0 ? (
                    <p className="text-sm text-muted-fg">Nothing due that day.</p>
                  ) : (
                    <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
                      {picked.map(e => (
                        <button key={e.card.id + (e.subtask?.id ?? '')} type="button" onClick={() => open(e.card)} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left">
                          {e.subtask
                            ? <span className="block break-words text-sm font-semibold leading-snug text-ink">{e.subtask.text}</span>
                            : <CardTitle card={e.card} />}
                          <span className="text-xs text-muted-fg">
                            {e.subtask ? `Subtask of ${e.card.title}` : columns.find(c => c.id === e.card.column_id)?.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {undated > 0 && (
                    <p className="text-xs text-muted-fg">
                      {undated} {undated === 1 ? 'card has' : 'cards have'} no due date and no dated subtask, so {undated === 1 ? 'it is' : 'they are'} not on the calendar.
                    </p>
                  )}
                </section>
              </div>
            )
          })()}
        </>
      )}

      {drawer && (
        <CardDrawer
          key={drawer.card?.id ?? 'new'}
          projectId={projectId} columns={columns} card={drawer.card} startColumnId={drawer.columnId}
          linkTypes={linkTypes} boardLabels={labels} today={today} api={api}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); load() }}
        />
      )}
      {columnDialog && (
        <ColumnDialog state={columnDialog} columns={columns} onClose={() => setColumnDialog(null)} onSubmit={submitColumn} />
      )}
    </div>
  )
}

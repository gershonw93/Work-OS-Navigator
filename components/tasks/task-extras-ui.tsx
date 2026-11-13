'use client'

import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { dayWords } from '@/lib/dates'
import { monthGrid, subtaskDue, PM_MONTHS, PM_TONE_CLASS } from '@/lib/project-management'
import {
  presetLabel, suggestLabels, TASK_LABEL_PRESETS,
  type TaskLabel, type TaskSubtask,
} from '@/lib/task-extras'

// ─────────────────────────────────────────────────────────────────────────────
// The pieces the shared Tasks screen took from Project Management: label
// chips and their picker, the subtask editor and list, and the month calendar.
// Hoisted here, at module level, because a component declared inside the page
// is a new type on every render and loses what is typed into it.
// ─────────────────────────────────────────────────────────────────────────────

export function LabelChips({ labels, className }: { labels?: TaskLabel[] | null; className?: string }) {
  if (!labels?.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {labels.map(l => (
        <span key={l.name} className={cn('whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', PM_TONE_CLASS[l.tone] ?? PM_TONE_CLASS.neutral)}>{l.name}</span>
      ))}
    </div>
  )
}

/**
 * Pick labels from the company-wide list. Typing narrows it; a word that is
 * not on the list is answered with the nearest ones FIRST, and only then with
 * "use it as it is" - so "sheetrock" becomes Drywall instead of a second
 * label for the same trade.
 */
export function LabelPicker({ value, onChange }: { value: TaskLabel[]; onChange: (next: TaskLabel[]) => void }) {
  const [text, setText] = useState('')
  const [browse, setBrowse] = useState(false)
  const [hint, setHint] = useState('')
  const taken = value.map(l => l.name)
  const typed = text.trim().replace(/\s+/g, ' ')
  const exact = presetLabel(typed)
  const near = suggestLabels(typed, taken)
  const full = value.length >= 8

  function add(l: TaskLabel) {
    if (full) { setHint('A task holds 8 labels. Take one off to add another.'); return }
    if (!taken.some(n => n.toLowerCase() === l.name.toLowerCase())) onChange([...value, l])
    setText(''); setHint('')
  }

  function enter() {
    if (!typed) return
    if (exact) { add(exact); return }
    // Not on the list: say what is close before making a new one.
    setHint(near.length
      ? 'That is not on the list. Pick the closest one below, or use your own wording.'
      : 'That is not on the list. Use your own wording if nothing below fits.')
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="task-label-input">Labels <span className="font-normal text-faint">(optional)</span></Label>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(l => (
            <span key={l.name} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full py-1 pl-2.5 pr-1 text-xs font-semibold', PM_TONE_CLASS[l.tone] ?? PM_TONE_CLASS.neutral)}>
              {l.name}
              <button type="button" aria-label={`Remove the ${l.name} label`} title="Remove"
                onClick={() => onChange(value.filter(x => x.name !== l.name))}
                className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-black/10">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input id="task-label-input" value={text} maxLength={28} placeholder="Type a trade or a topic - Framing, Permit, Client"
        onChange={e => { setText(e.target.value); setHint('') }}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); enter() } }} />
      {hint && <p role="alert" className="text-xs text-danger">{hint}</p>}

      {typed && (
        <div className="flex flex-wrap items-center gap-1.5">
          {near.length > 0 && <span className="text-xs text-muted-fg">{exact ? 'On the list:' : 'Closest on the list:'}</span>}
          {near.map(l => (
            <button key={l.name} type="button" onClick={() => add(l)}
              className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', PM_TONE_CLASS[l.tone])}>
              + {l.name}
            </button>
          ))}
          {!exact && (
            <button type="button" onClick={() => add({ name: typed.slice(0, 28), tone: 'neutral' })}
              className="whitespace-nowrap rounded-full border border-dashed border-muted2 px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-surface">
              Use &quot;{typed}&quot; as it is
            </button>
          )}
        </div>
      )}

      {!typed && (
        <div>
          <button type="button" aria-expanded={browse} onClick={() => setBrowse(b => !b)}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-ink-soft lg:min-h-0 lg:text-xs">
            {browse ? 'Hide the list' : `See all ${TASK_LABEL_PRESETS.length} labels`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', browse && 'rotate-180')} />
          </button>
          {browse && (
            <div className="mt-1.5 flex max-h-44 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-line p-2.5">
              {TASK_LABEL_PRESETS.filter(p => !taken.includes(p.name)).map(l => (
                <button key={l.name} type="button" onClick={() => add(l)}
                  className={cn('whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', PM_TONE_CLASS[l.tone])}>
                  {l.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export interface SubtaskPerson { key: string; name: string; member_id?: string; company_id?: string }

/**
 * The subtasks of the task being added or edited. STAGED: nothing here saves
 * on its own - the form's one Save sends the list. Each row carries its date;
 * the person and the note sit behind the arrow.
 */
export function SubtaskEditor({ value, onChange, people, today }: {
  value: TaskSubtask[]
  onChange: (next: TaskSubtask[]) => void
  people: SubtaskPerson[]
  today: string
}) {
  const [text, setText] = useState('')
  const [open, setOpen] = useState('')
  const [problem, setProblem] = useState('')
  const patch = (id: string, p: Partial<TaskSubtask>) => onChange(value.map(s => s.id === id ? { ...s, ...p } : s))

  function add() {
    const t = text.trim()
    if (!t) { setProblem('Type the subtask first.'); return }
    onChange([...value, { id: `s${Date.now().toString(36)}${value.length}`, text: t.slice(0, 200), done: false, due: null, note: null }])
    setText(''); setProblem('')
  }

  const done = value.filter(s => s.done).length

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-ink-soft">Subtasks <span className="font-normal text-faint">(optional)</span></span>
        {value.length > 0 && <span className="text-xs text-muted-fg">{done} of {value.length} done</span>}
      </div>
      {value.length > 0 && (
        <div className="divide-y divide-line-soft rounded-xl border border-line">
          {value.map(item => {
            const says = subtaskDue(item, today)
            const isOpen = open === item.id
            const who = item.assignee_member_id ? `m:${item.assignee_member_id}` : item.assignee_company_id ? `c:${item.assignee_company_id}` : ''
            return (
              <div key={item.id} className={cn(isOpen && 'bg-surface')}>
                <div className="flex flex-wrap items-center gap-x-1 pl-3 pr-1">
                  <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 text-sm">
                    <input type="checkbox" checked={item.done} className="h-5 w-5 shrink-0 accent-[rgb(var(--accent-fg))]"
                      onChange={() => patch(item.id, { done: !item.done })} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block break-words', item.done ? 'text-muted-fg line-through' : 'text-ink')}>{item.text}</span>
                      {(item.assignee_name || says?.tone === 'overdue' || (item.note && !isOpen)) && (
                        <span className="block truncate text-xs text-muted-fg">
                          {says?.tone === 'overdue' && <span className="font-semibold text-danger">{says.text} </span>}
                          {[item.assignee_name, !isOpen ? item.note : null].filter(Boolean).join(' - ')}
                        </span>
                      )}
                    </span>
                  </label>
                  <div className="order-last w-full pb-2.5 pl-8 pr-2 lg:order-none lg:w-40 lg:shrink-0 lg:p-0">
                    <Label htmlFor={`st-due-${item.id}`} className="sr-only">Due date for {item.text} (optional)</Label>
                    <Input id={`st-due-${item.id}`} type="date" value={item.due ?? ''} title="Due date (optional)"
                      onChange={e => patch(item.id, { due: e.target.value || null })} />
                  </div>
                  <button type="button" aria-expanded={isOpen}
                    aria-label={`Who and a note for "${item.text}"`} title="Who and a note"
                    onClick={() => setOpen(isOpen ? '' : item.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-ink">
                    <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
                  </button>
                  <button type="button" aria-label={`Remove "${item.text}"`} title="Remove"
                    onClick={() => onChange(value.filter(s => s.id !== item.id))}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-fg hover:bg-surface hover:text-danger">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label htmlFor={`st-who-${item.id}`} className="lg:text-xs">Given to (optional)</Label>
                      <Select id={`st-who-${item.id}`} value={who}
                        onChange={e => {
                          const p = people.find(x => x.key === e.target.value)
                          patch(item.id, {
                            assignee_member_id: p?.member_id ?? null,
                            assignee_company_id: p?.company_id ?? null,
                            assignee_name: p?.name ?? null,
                          })
                        }}>
                        <option value="">Nobody in particular</option>
                        {people.map(p => <option key={p.key} value={p.key}>{p.name}</option>)}
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`st-note-${item.id}`} className="lg:text-xs">Note (optional)</Label>
                      <Input id={`st-note-${item.id}`} value={item.note ?? ''} maxLength={500}
                        onChange={e => patch(item.id, { note: e.target.value })} />
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="st-new" className="lg:text-xs">New subtask</Label>
          <Input id="st-new" value={text} maxLength={200} placeholder="One step of this task"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
        </div>
        <Button type="button" variant="outline" onClick={add}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>
      {problem && <p role="alert" className="text-xs text-danger">{problem}</p>}
    </div>
  )
}

/** A task's subtasks, tickable where they are listed. Each tick saves on its own. */
export function SubtaskList({ items, today, onToggle, className }: {
  items: TaskSubtask[]
  today: string
  onToggle?: (id: string) => void
  className?: string
}) {
  if (!items.length) return null
  return (
    <div className={cn('divide-y divide-line-soft rounded-xl border border-line', className)}>
      {items.map(item => {
        const says = subtaskDue(item, today)
        const finished = item.done && item.done_by_name
          ? `Done by ${item.done_by_name}${dayWords(item.done_at) ? `, ${dayWords(item.done_at)}` : ''}`
          : null
        return (
          <label key={item.id} className={cn('flex min-h-11 items-start gap-3 px-3 py-2 text-sm', onToggle && 'cursor-pointer')}>
            <input type="checkbox" checked={item.done} disabled={!onToggle}
              onChange={() => onToggle?.(item.id)} onClick={e => e.stopPropagation()}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[rgb(var(--accent-fg))] lg:h-4 lg:w-4" />
            <span className="min-w-0 flex-1">
              <span className={cn('block break-words', item.done ? 'text-muted-fg line-through' : 'text-ink')}>{item.text}</span>
              {item.note && <span className="block break-words text-xs text-muted-fg">{item.note}</span>}
              {(item.assignee_name || finished) && (
                <span className="block text-xs text-muted-fg">{[item.assignee_name, finished].filter(Boolean).join(' - ')}</span>
              )}
            </span>
            {says && (
              <span className={cn('shrink-0 whitespace-nowrap text-xs',
                says.tone === 'overdue' && 'font-semibold text-danger',
                says.tone === 'today' && 'font-semibold text-ink',
                says.tone === 'done' && 'text-muted-fg line-through',
                says.tone === 'plain' && 'text-muted-fg')}>{says.text}</span>
            )}
          </label>
        )
      })}
    </div>
  )
}

export interface CalendarEntry { key: string; date: string; label: string; sub?: string; done: boolean; onOpen: () => void }

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * A month of due dates. A phone cell is ~50px wide, so it shows a dot and a
 * count and the DAY is the control: tap it and that day's items list under the
 * grid. From lg up the cell also carries the first three titles.
 */
export function MonthCalendar({ entries, today, footnote }: { entries: CalendarEntry[]; today: string; footnote?: string }) {
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [day, setDay] = useState(today)
  const byDay = new Map<string, CalendarEntry[]>()
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e])
  const picked = byDay.get(day) ?? []
  const step = (by: number) => {
    const d = new Date(Date.UTC(month.y, month.m + by, 1))
    setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-base font-bold text-ink">{PM_MONTHS[month.m]} {month.y}</h2>
        <Button type="button" variant="outline" size="sm"
          onClick={() => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setDay(today) }}>Today</Button>
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
                  {list.length > 0 && (
                    <span className="flex items-center gap-1 lg:hidden">
                      <span className={cn('h-1.5 w-1.5 rounded-full', late ? 'bg-danger-solid' : 'bg-info-solid')} />
                      <span className="text-[11px] text-muted-fg">{list.length}</span>
                    </span>
                  )}
                  <span className="hidden min-w-0 flex-col gap-1 lg:flex">
                    {list.slice(0, 3).map(e => (
                      <span key={e.key} className={cn('truncate rounded px-1.5 py-0.5 text-[11px] font-medium',
                        e.done ? 'bg-muted text-muted-fg line-through' : iso < today ? 'bg-danger-tint text-danger' : 'bg-info-tint text-info')}>{e.label}</span>
                    ))}
                    {list.length > 3 && <span className="text-[11px] text-muted-fg">+{list.length - 3} more</span>}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <section aria-label="Due on the chosen day" className="space-y-2">
        <h2 className="text-sm font-bold text-ink">{dayWords(day, { weekday: true }) ?? 'Pick a day'}</h2>
        {picked.length === 0 ? (
          <p className="text-sm text-muted-fg">Nothing due that day.</p>
        ) : (
          <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
            {picked.map(e => (
              <button key={e.key} type="button" onClick={e.onOpen} className="flex w-full flex-col gap-1 px-4 py-3.5 text-left">
                <span className={cn('block break-words text-sm font-semibold leading-snug', e.done ? 'text-muted-fg line-through' : 'text-ink')}>{e.label}</span>
                {e.sub && <span className="text-xs text-muted-fg">{e.sub}</span>}
              </button>
            ))}
          </div>
        )}
        {footnote && <p className="text-xs text-muted-fg">{footnote}</p>}
      </section>
    </div>
  )
}

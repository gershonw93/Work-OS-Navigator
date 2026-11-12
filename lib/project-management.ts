// ─────────────────────────────────────────────────────────────────────────────
// Project Management: one person's PRIVATE board on one job.
//
// The pure half - names, shapes and rules. Asked by the screen AND the routes,
// so a rule cannot exist on one door and not the other. Nothing here touches a
// database (lib/project-management-server.ts does).
//
// WHAT MAKES IT PRIVATE is not in this file: every row carries `owner_id` and
// every query filters on the caller's own id. It is deliberately NOT a
// permission resource - a permission is something an admin can grant, and the
// promise on the screen is that an admin cannot see it.
// ─────────────────────────────────────────────────────────────────────────────

import { isFieldRole } from './permissions'
import { dayWords } from './dates'

export const PM_SLUG = 'project-management'
export const PM_LABEL = 'Project Management'

/** Everyone but the Field Mode roles. The owner's rule, in one place. */
export function pmAllowedRole(role: string | null | undefined): boolean {
  return !!role && !isFieldRole(role)
}

export const PM_DEFAULT_COLUMNS: { name: string; is_done: boolean }[] = [
  { name: 'To do', is_done: false },
  { name: 'This week', is_done: false },
  { name: 'Waiting on someone', is_done: false },
  { name: 'Done', is_done: true },
]

export const PM_PRIORITIES = ['low', 'normal', 'high'] as const
export type PmPriority = typeof PM_PRIORITIES[number]
export const PM_PRIORITY_LABEL: Record<PmPriority, string> = { low: 'Low', normal: 'Normal', high: 'High' }

export const PM_TONES = ['info', 'warn', 'special', 'success', 'danger', 'neutral'] as const
export type PmTone = typeof PM_TONES[number]
export const PM_TONE_LABEL: Record<PmTone, string> = {
  info: 'Blue', warn: 'Amber', special: 'Purple', success: 'Green', danger: 'Red', neutral: 'Grey',
}
export const PM_TONE_CLASS: Record<PmTone, string> = {
  info: 'bg-info-tint text-info',
  warn: 'bg-warn-tint text-warn',
  special: 'bg-special-tint text-special',
  success: 'bg-success-tint text-success',
  danger: 'bg-danger-tint text-danger',
  neutral: 'bg-muted text-ink-soft',
}

export interface PmLabel { name: string; tone: PmTone }
export interface PmChecklistItem { id: string; text: string; done: boolean }

export interface PmColumn {
  id: string
  name: string
  position: number
  is_done: boolean
}

export interface PmCard {
  id: string
  project_id: string
  column_id: string
  title: string
  notes: string | null
  due_date: string | null
  priority: PmPriority
  labels: PmLabel[]
  checklist: PmChecklistItem[]
  link_type: string | null
  link_id: string | null
  link_label: string | null
  position: number
  completed_at: string | null
  created_at?: string
}

// ── Links to a record on the job ─────────────────────────────────────────────
// A card may POINT AT one real record. One way: nothing about the card is
// written to, or shown on, the record. `resource` is the permission the picker
// asks before it lists anything; `tab` is where the link opens.
export const PM_LINK_TYPES: Record<string, { label: string; resource: string; tab: string }> = {
  task: { label: 'Task', resource: 'tasks', tab: 'tasks' },
  inspection: { label: 'Inspection', resource: 'inspections', tab: 'inspections' },
  permit: { label: 'Permit', resource: 'permits', tab: 'permits' },
  rfi: { label: 'RFI', resource: 'rfis', tab: 'rfis' },
  bill: { label: 'Bill from a sub', resource: 'invoices', tab: 'invoices' },
}

export function pmLinkHref(projectId: string, type: string | null | undefined): string | null {
  const t = type ? PM_LINK_TYPES[type] : null
  return t ? `/projects/${projectId}/${t.tab}` : null
}

// ── Cleaning what a request sends ────────────────────────────────────────────
const MAX_LABELS = 8
const MAX_CHECKLIST = 60
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v)

export function cleanLabels(input: unknown): PmLabel[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: PmLabel[] = []
  for (const raw of input) {
    const name = String((raw as any)?.name ?? '').trim().slice(0, 24)
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    const tone = (PM_TONES as readonly string[]).includes((raw as any)?.tone) ? (raw as any).tone as PmTone : 'neutral'
    out.push({ name, tone })
    if (out.length >= MAX_LABELS) break
  }
  return out
}

export function cleanChecklist(input: unknown): PmChecklistItem[] {
  if (!Array.isArray(input)) return []
  const out: PmChecklistItem[] = []
  for (const raw of input) {
    const text = String((raw as any)?.text ?? '').trim().slice(0, 200)
    if (!text) continue
    const id = String((raw as any)?.id ?? '').slice(0, 40) || `i${out.length}-${text.length}`
    out.push({ id, text, done: (raw as any)?.done === true })
    if (out.length >= MAX_CHECKLIST) break
  }
  return out
}

/**
 * What is wrong with a card as sent, in words - or null. Asked by the form
 * before it sends and by the route before it writes. `partial` is an edit:
 * only the fields present are checked.
 */
export function cardProblem(body: Record<string, unknown>, opts: { partial?: boolean } = {}): string | null {
  if (!opts.partial || 'title' in body) {
    const title = String(body.title ?? '').trim()
    if (!title) return 'Give the card a title.'
    if (title.length > 200) return 'Keep the title under 200 characters - the rest belongs in the notes.'
  }
  if (!opts.partial && !isUuid(body.column_id)) return 'Pick a column for the card.'
  if ('column_id' in body && !isUuid(body.column_id)) return 'Pick a column for the card.'
  if ('due_date' in body && body.due_date != null && body.due_date !== '' && !DATE_ONLY.test(String(body.due_date))) {
    return 'That due date is not a date.'
  }
  if ('priority' in body && !(PM_PRIORITIES as readonly string[]).includes(String(body.priority))) {
    return 'Priority is Low, Normal or High.'
  }
  if ('link_type' in body && body.link_type != null && body.link_type !== '') {
    if (!PM_LINK_TYPES[String(body.link_type)]) return 'That is not something a card can link to.'
    if (!isUuid(body.link_id)) return 'Pick the record to link to.'
  }
  return null
}

/** What is wrong with a column name - or null. `others` are the board's other names. */
export function columnProblem(name: unknown, others: string[]): string | null {
  const n = String(name ?? '').trim()
  if (!n) return 'Give the column a name.'
  if (n.length > 40) return 'Keep the column name under 40 characters.'
  if (others.some(o => o.trim().toLowerCase() === n.toLowerCase())) return `You already have a column called "${n}".`
  return null
}

// ── What a card says about its date ──────────────────────────────────────────
export type PmDueTone = 'overdue' | 'today' | 'done' | 'plain'

/**
 * One answer for the date on a card, on every view. `today` is the reader's
 * own YYYY-MM-DD. A finished card never says overdue - finished work is not
 * late - and a card with no date says nothing rather than "No date" in red.
 */
export function cardDue(
  card: Pick<PmCard, 'due_date' | 'completed_at'>,
  today: string,
): { text: string; tone: PmDueTone } | null {
  if (card.completed_at) {
    const when = dayWords(card.completed_at, { weekday: true })
    return { text: when ? `Done ${when}` : 'Done', tone: 'done' }
  }
  const due = card.due_date ? String(card.due_date).slice(0, 10) : ''
  const words = dayWords(due, { weekday: true })
  if (!words) return null
  if (due < today) return { text: `Overdue - ${words}`, tone: 'overdue' }
  if (due === today) return { text: 'Today', tone: 'today' }
  return { text: words, tone: 'plain' }
}

export function checklistProgress(list: PmChecklistItem[] | null | undefined): { done: number; total: number } | null {
  const items = list ?? []
  if (!items.length) return null
  return { done: items.filter(i => i.done).length, total: items.length }
}

// ── Ordering ─────────────────────────────────────────────────────────────────
/** `ids` with `id` moved (or inserted) to `index`. Out-of-range lands at the end. */
export function placeAt(ids: string[], id: string, index: number | null | undefined): string[] {
  const rest = ids.filter(x => x !== id)
  const at = index == null || !Number.isInteger(index) || index < 0 || index > rest.length ? rest.length : index
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

export function cardsIn(cards: PmCard[], columnId: string): PmCard[] {
  return cards.filter(c => c.column_id === columnId).sort((a, b) => a.position - b.position || a.title.localeCompare(b.title))
}

/** Text search over title, notes and label names; a label filter on top. */
export function filterCards(cards: PmCard[], query: string, label: string): PmCard[] {
  const q = query.trim().toLowerCase()
  const l = label.trim().toLowerCase()
  return cards.filter(c => {
    if (l && !c.labels.some(x => x.name.toLowerCase() === l)) return false
    if (!q) return true
    return c.title.toLowerCase().includes(q)
      || (c.notes ?? '').toLowerCase().includes(q)
      || c.labels.some(x => x.name.toLowerCase().includes(q))
  })
}

/** Every label used on a board, once each, by name. */
export function boardLabels(cards: PmCard[]): PmLabel[] {
  const seen = new Map<string, PmLabel>()
  for (const c of cards) for (const l of c.labels) if (!seen.has(l.name.toLowerCase())) seen.set(l.name.toLowerCase(), l)
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
}

// ── The month grid ───────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')

/** The weeks of a month as YYYY-MM-DD, Sunday first; null outside the month. */
export function monthGrid(year: number, month0: number): (string | null)[][] {
  const first = new Date(Date.UTC(year, month0, 1))
  const days = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate()
  const cells: (string | null)[] = Array(first.getUTCDay()).fill(null)
  for (let d = 1; d <= days; d++) cells.push(`${year}-${pad(month0 + 1)}-${pad(d)}`)
  while (cells.length % 7) cells.push(null)
  const weeks: (string | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))
  return weeks
}

export const PM_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// ─────────────────────────────────────────────────────────────────────────────
// Labels and subtasks on the SHARED Tasks (project_tasks.labels / .subtasks,
// migration 167). Pure: asked by the screen and by lib/writes/task.ts, so a
// rule cannot be on one door and not the other.
//
// The look and the subtask idea came from Project Management, but these are
// the team's tasks: a subtask here can be given to a person, and it records
// who ticked it. That record is DERIVED on the server (`stampSubtasks`) from
// the move itself - a request cannot date a subtask finished last month.
// ─────────────────────────────────────────────────────────────────────────────

import { PM_TONES, type PmChecklistItem, type PmTone } from './project-management'

export interface TaskLabel { name: string; tone: PmTone }

export interface TaskSubtask extends PmChecklistItem {
  /** Who it is given to - one person or one sub, optional. */
  assignee_name?: string | null
  assignee_member_id?: string | null
  assignee_company_id?: string | null
  /** Written by the route when it is ticked; cleared when it is unticked. */
  done_at?: string | null
  done_by_name?: string | null
}

// ── The label list ───────────────────────────────────────────────────────────
// ONE LIST FOR EVERYBODY. On a shared board two people inventing "Framing" and
// "framing crew" is two filters for one thing, so the picker offers these
// first and, when somebody types their own, suggests the nearest ones
// (`suggestLabels`). `also` is how "sheetrock" finds Drywall. A custom label
// is still allowed - a list that refuses the word a company actually uses gets
// worked around in the title.
interface Preset extends TaskLabel { also?: string[] }

const trade = (name: string, ...also: string[]): Preset => ({ name, tone: 'info', also })
const paper = (name: string, ...also: string[]): Preset => ({ name, tone: 'special', also })
const money = (name: string, ...also: string[]): Preset => ({ name, tone: 'success', also })
const people = (name: string, ...also: string[]): Preset => ({ name, tone: 'warn', also })
const site = (name: string, ...also: string[]): Preset => ({ name, tone: 'neutral', also })

const PRESETS: Preset[] = [
  trade('Demolition', 'demo', 'tear out'), trade('Excavation', 'dig', 'sitework', 'grading'),
  trade('Foundation', 'footing', 'footings'), trade('Concrete', 'slab', 'flatwork', 'pour'),
  trade('Masonry', 'brick', 'block', 'stone'), trade('Framing', 'framer', 'rough carpentry'),
  trade('Roofing', 'roof', 'shingles'), trade('Siding', 'cladding'),
  trade('Windows & Doors', 'window', 'windows', 'door', 'doors'), trade('Insulation', 'spray foam'),
  trade('Drywall', 'sheetrock', 'gypsum', 'taping', 'mud'), trade('Painting', 'paint', 'painter'),
  trade('Flooring', 'floor', 'floors', 'hardwood', 'carpet', 'lvp'), trade('Tile', 'tiling'),
  trade('Cabinets', 'cabinetry', 'millwork', 'kitchen'), trade('Countertops', 'counters', 'granite', 'quartz'),
  trade('Trim', 'finish carpentry', 'molding', 'moulding', 'baseboard'), trade('Plumbing', 'plumber', 'pipes'),
  trade('Electrical', 'electrician', 'electric', 'wiring'), trade('HVAC', 'heating', 'cooling', 'mechanical', 'air conditioning', 'ductwork'),
  trade('Fire Protection', 'sprinkler', 'sprinklers'), trade('Low Voltage', 'data', 'security', 'audio', 'cameras'),
  trade('Appliances', 'appliance'), trade('Landscaping', 'landscape', 'sod', 'planting'),
  trade('Paving', 'driveway', 'asphalt'), trade('Fencing', 'fence'), trade('Decks', 'deck', 'porch', 'patio'),
  trade('Gutters', 'downspouts'), trade('Stairs & Railings', 'stairs', 'railing', 'railings'),
  trade('Garage Door'), trade('Septic'), trade('Well'), trade('Waterproofing'), trade('Stucco'),
  trade('Glazing', 'glass', 'mirrors', 'shower door'), trade('Elevator'), trade('Pool'),
  paper('Permit', 'permits'), paper('Inspection', 'inspections', 'inspector'), paper('RFI', 'question for the architect'),
  paper('Submittal', 'submittals', 'shop drawings'), paper('Change Order', 'co', 'extra'),
  paper('Plans', 'drawings', 'blueprints'), paper('Survey'), paper('Engineering', 'engineer'),
  paper('Closeout', 'turnover', 'handover'), paper('Warranty', 'callback'),
  money('Billing', 'invoice', 'invoicing', 'bill'), money('Payment', 'pay', 'check'), money('Budget'),
  money('Estimate', 'quote', 'bid', 'pricing'), money('Purchase Order', 'po', 'order'),
  money('Insurance', 'coi', 'certificate'), money('Lien Waiver', 'waiver', 'lien'),
  people('Client', 'owner', 'homeowner', 'customer'), people('Architect'), people('Designer', 'interior designer'),
  people('Supplier', 'vendor', 'lumber yard'), people('Subcontractor', 'sub', 'subs'),
  people('Township', 'city', 'municipality', 'building department'), people('Utility', 'power company', 'gas company', 'water company'),
  people('Neighbor', 'neighbour'), people('Lender', 'bank', 'draw'),
  site('Delivery', 'deliveries'), site('Materials', 'material', 'material order'), site('Equipment', 'rental', 'machine'),
  site('Safety'), site('Cleanup', 'clean up', 'dumpster', 'trash'), site('Site Meeting', 'meeting', 'walkthrough', 'walk through'),
  site('Punch List', 'punch'), site('Weather', 'rain'), site('Schedule', 'delay', 'delayed'),
  site('Quality', 'qc', 'rework', 'defect'), { name: 'Urgent', tone: 'danger', also: ['rush', 'asap', 'emergency'] },
]

export const TASK_LABEL_PRESETS: TaskLabel[] = PRESETS.map(({ name, tone }) => ({ name, tone }))

const fold = (v: unknown): string => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/** The preset this exactly names (any case), or null. */
export function presetLabel(name: unknown): TaskLabel | null {
  const n = fold(name)
  const hit = PRESETS.find(p => fold(p.name) === n)
  return hit ? { name: hit.name, tone: hit.tone } : null
}

/** Edit distance, capped: only "one or two letters off" is ever asked. */
function near(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 2 || Math.min(a.length, b.length) < 4) return false
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const keep = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = keep
    }
  }
  return prev[b.length] <= 2
}

/**
 * The presets nearest to what somebody typed, best first, leaving out ones the
 * task already has. Empty input lists nothing - the picker shows the whole
 * list itself. A name, another word for it, the start of either, a word inside
 * either, or a near miss in spelling all count.
 */
export function suggestLabels(input: unknown, taken: string[] = [], max = 6): TaskLabel[] {
  const q = fold(input)
  if (!q) return []
  const has = new Set(taken.map(fold))
  const scored: { p: Preset; score: number }[] = []
  for (const p of PRESETS) {
    if (has.has(fold(p.name))) continue
    const words = [p.name, ...(p.also ?? [])].map(fold)
    let score = 0
    for (const w of words) {
      if (w === q) score = Math.max(score, 100)
      else if (w.startsWith(q) || q.startsWith(w)) score = Math.max(score, 80)
      else if (q.length >= 3 && (w.includes(q) || q.includes(w))) score = Math.max(score, 60)
      else if (near(w, q)) score = Math.max(score, 40)
    }
    if (score) scored.push({ p, score })
  }
  return scored.sort((a, b) => b.score - a.score || a.p.name.localeCompare(b.p.name))
    .slice(0, max).map(({ p }) => ({ name: p.name, tone: p.tone }))
}

const MAX_LABELS = 8
const MAX_SUBTASKS = 60
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** What is stored. A name that IS a preset takes the preset's spelling and colour. */
export function cleanTaskLabels(input: unknown): TaskLabel[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: TaskLabel[] = []
  for (const raw of input) {
    const typed = String((raw as any)?.name ?? raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 28)
    if (!typed || typed === '[object Object]') continue
    const preset = presetLabel(typed)
    const name = preset?.name ?? typed
    if (seen.has(fold(name))) continue
    seen.add(fold(name))
    const tone = preset?.tone
      ?? ((PM_TONES as readonly string[]).includes((raw as any)?.tone) ? (raw as any).tone as PmTone : 'neutral')
    out.push({ name, tone })
    if (out.length >= MAX_LABELS) break
  }
  return out
}

/**
 * The subtasks to store, from what a request sent and what the task holds now.
 *
 * `done_at` / `done_by_name` are NEVER read from the request: a subtask that
 * was not done and now is gets them stamped here; one that is unticked loses
 * them; one that was already done keeps the stamp it has.
 */
export function stampSubtasks(sent: unknown, held: unknown, actorName: string, nowIso: string): TaskSubtask[] {
  if (!Array.isArray(sent)) return []
  const before = new Map<string, TaskSubtask>(
    (Array.isArray(held) ? held : []).map((h: any) => [String(h?.id ?? ''), h as TaskSubtask]),
  )
  const out: TaskSubtask[] = []
  for (const raw of sent) {
    const text = String((raw as any)?.text ?? '').trim().slice(0, 200)
    if (!text) continue
    const id = String((raw as any)?.id ?? '').slice(0, 40) || `s${out.length}-${text.length}`
    const done = (raw as any)?.done === true
    const was = before.get(id)
    const memberId = UUID.test(String((raw as any)?.assignee_member_id ?? '')) ? String((raw as any).assignee_member_id) : null
    const companyId = !memberId && UUID.test(String((raw as any)?.assignee_company_id ?? '')) ? String((raw as any).assignee_company_id) : null
    out.push({
      id, text, done,
      due: DATE_ONLY.test(String((raw as any)?.due ?? '')) ? String((raw as any).due) : null,
      note: String((raw as any)?.note ?? '').trim().slice(0, 500) || null,
      assignee_member_id: memberId,
      assignee_company_id: companyId,
      assignee_name: memberId || companyId ? String((raw as any)?.assignee_name ?? '').trim().slice(0, 80) || null : null,
      done_at: done ? (was?.done && was.done_at ? was.done_at : nowIso) : null,
      done_by_name: done ? (was?.done && was.done_by_name ? was.done_by_name : actorName) : null,
    })
    if (out.length >= MAX_SUBTASKS) break
  }
  return out
}

/** The texts of subtasks that went from not done to done between two lists. */
export function newlyDone(before: unknown, after: TaskSubtask[]): string[] {
  const was = new Map<string, boolean>((Array.isArray(before) ? before : []).map((h: any) => [String(h?.id ?? ''), h?.done === true]))
  return after.filter(s => s.done && !was.get(s.id)).map(s => s.text)
}

const whoKey = (s: Partial<TaskSubtask> | undefined): string =>
  s?.assignee_member_id ? `m:${s.assignee_member_id}` : s?.assignee_company_id ? `c:${s.assignee_company_id}` : ''

/**
 * The subtasks that were just GIVEN to somebody: a new one with a person on
 * it, or one whose person changed. Not one that kept its person (a tick or a
 * date edit is not a new assignment), and not one that is already done.
 */
export function newlyAssigned(before: unknown, after: TaskSubtask[]): TaskSubtask[] {
  const was = new Map<string, string>((Array.isArray(before) ? before : []).map((h: any) => [String(h?.id ?? ''), whoKey(h)]))
  return after.filter(s => !s.done && whoKey(s) && whoKey(s) !== (was.get(s.id) ?? ''))
}

// ── Reading them ─────────────────────────────────────────────────────────────
interface HasSubtasks { status: string; due_date: string | null; subtasks?: TaskSubtask[] | null }

/** Unticked subtasks with a date, soonest first. A completed task has none. */
export function openTaskSubtasks(task: HasSubtasks): TaskSubtask[] {
  if (task.status === 'completed') return []
  return (task.subtasks ?? [])
    .filter(s => !s.done && !!s.due && DATE_ONLY.test(String(s.due)))
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))
}

/** Late on its own date OR on a subtask's. Finished work is never late. */
export function taskIsOverdue(task: HasSubtasks, today: string): boolean {
  if (task.status === 'completed') return false
  if (task.due_date && String(task.due_date).slice(0, 10) < today) return true
  return openTaskSubtasks(task).some(s => String(s.due) < today)
}

export function subtaskCount(task: { subtasks?: TaskSubtask[] | null }): { done: number; total: number } | null {
  const list = task.subtasks ?? []
  return list.length ? { done: list.filter(s => s.done).length, total: list.length } : null
}

export interface TaskCalendarEntry<T> { date: string; task: T; subtask: TaskSubtask | null; done: boolean }

/** A task on its own due date, and each open dated subtask on its own. */
export function taskCalendarEntries<T extends HasSubtasks>(tasks: T[]): TaskCalendarEntry<T>[] {
  const out: TaskCalendarEntry<T>[] = []
  for (const task of tasks) {
    if (task.due_date) out.push({ date: String(task.due_date).slice(0, 10), task, subtask: null, done: task.status === 'completed' })
    for (const s of openTaskSubtasks(task)) out.push({ date: String(s.due), task, subtask: s, done: false })
  }
  return out
}

/** Text search over a task's title, description, labels, subtasks and people. */
export function taskMatches(
  task: { title: string; description?: string | null; labels?: TaskLabel[] | null; subtasks?: TaskSubtask[] | null; assignees?: { name?: string | null }[] },
  query: string,
  label: string,
): boolean {
  const l = fold(label)
  if (l && !(task.labels ?? []).some(x => fold(x.name) === l)) return false
  const q = fold(query)
  if (!q) return true
  return fold(task.title).includes(q)
    || fold(task.description).includes(q)
    || (task.labels ?? []).some(x => fold(x.name).includes(q))
    || (task.subtasks ?? []).some(s => fold(s.text).includes(q) || fold(s.assignee_name).includes(q))
    || (task.assignees ?? []).some(a => fold(a.name).includes(q))
}

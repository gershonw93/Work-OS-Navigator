import type { FeedScope } from './calendar-feed'

/**
 * WHAT GOES ON A PERSON'S CALENDAR - pure, one rule for the Calendar page and
 * the calendar-app feed, so the screen and the phone cannot disagree.
 *
 * Two kinds of job, two rules (the owner's decision, Oct 2026):
 *
 *   - A job the company OWNS shows everything the person's permissions allow:
 *     every schedule line, task and inspection - narrowed by `FeedScope`, so
 *     crew see only the jobs they are on and the tasks that are theirs.
 *   - A job a GC AWARDED them shows ONLY THEIR OWN WORK: schedule lines on
 *     their own subcontract, tasks assigned to their company, and inspections
 *     for their trade. The GC's other trades and private dates stay the GC's -
 *     a sub's calendar must not become a window onto who else is on the job
 *     and when.
 *
 * A row that matches neither rule is DROPPED, never shown "just in case": the
 * failure is a GC's private date on a stranger's phone.
 */
export type CalendarKind = 'schedule' | 'task' | 'inspection'

export interface CalendarItem {
  id: string
  kind: CalendarKind
  project_id: string
  project_name: string
  title: string
  start: string
  end: string
  color: string
  done?: boolean
  href: string
  /** Which rule let it in - the page labels awarded work. */
  source: 'own' | 'awarded'
}

export interface CalendarInput {
  ownProjects: { id: string; name: string }[]
  /** The company's subcontracts on GC jobs it does not own. */
  awarded: { id: string; project_id: string; project_name: string; trade: string | null }[]
  schedule: {
    id: string; project_id: string; start_date: string | null; end_date: string | null
    label: string | null; color?: string | null; subcontract_id: string | null
    subcontracts?: { scope?: string | null; trade?: string | null; companies?: { name?: string | null } | null } | null
  }[]
  tasks: { id: string; project_id: string; title: string; due_date: string | null; status: string | null }[]
  inspections: { id: string; project_id: string; type: string | null; trade: string | null; status: string | null; scheduled_date: string | null }[]
  /** Task ids assigned to the person's COMPANY (the awarded-job rule). */
  companyTaskIds: string[]
  scope: FeedScope
}

const fold = (v: string | null | undefined) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function calendarItems(input: CalendarInput): CalendarItem[] {
  const { scope } = input
  const allowed = scope.projectIds === null ? null : new Set(scope.projectIds)
  const onJob = (id: string) => allowed === null || allowed.has(id)

  const own = new Map(input.ownProjects.filter(p => onJob(p.id)).map(p => [p.id, p.name]))
  // An awarded job the company ALSO owns is its own job - the wider rule wins.
  const awardedByProject = new Map<string, { name: string; subIds: Set<string>; trades: Set<string> }>()
  for (const a of input.awarded) {
    if (own.has(a.project_id) || !onJob(a.project_id)) continue
    const entry = awardedByProject.get(a.project_id) ?? { name: a.project_name, subIds: new Set<string>(), trades: new Set<string>() }
    entry.subIds.add(a.id)
    if (fold(a.trade)) entry.trades.add(fold(a.trade))
    awardedByProject.set(a.project_id, entry)
  }

  const personalTasks = scope.taskIds === null ? null : new Set(scope.taskIds)
  const companyTasks = new Set(input.companyTaskIds)
  const items: CalendarItem[] = []

  if (scope.schedule) {
    for (const s of input.schedule) {
      if (!s.start_date) continue
      const ownName = own.get(s.project_id)
      const aw = awardedByProject.get(s.project_id)
      // Awarded: only a line on one of THEIR subcontracts.
      if (ownName === undefined && !(aw && s.subcontract_id && aw.subIds.has(s.subcontract_id))) continue
      const sub = s.subcontracts
      items.push({
        id: `s_${s.id}`, kind: 'schedule', project_id: s.project_id,
        project_name: ownName ?? aw!.name,
        title: s.label || sub?.companies?.name || sub?.scope || sub?.trade || 'Scheduled',
        start: s.start_date, end: s.end_date ?? s.start_date, color: s.color ?? 'blue',
        href: ownName !== undefined ? `/projects/${s.project_id}/schedule` : `/my-jobs/${s.project_id}`,
        source: ownName !== undefined ? 'own' : 'awarded',
      })
    }
  }

  if (scope.tasks) {
    for (const t of input.tasks) {
      if (!t.due_date) continue
      const ownName = own.get(t.project_id)
      const aw = awardedByProject.get(t.project_id)
      if (ownName === undefined && !aw) continue
      // Crew: only their own tasks, on either kind of job.
      if (personalTasks && !personalTasks.has(t.id)) continue
      // Awarded: only tasks assigned to their company.
      if (ownName === undefined && !companyTasks.has(t.id)) continue
      items.push({
        id: `t_${t.id}`, kind: 'task', project_id: t.project_id,
        project_name: ownName ?? aw!.name,
        title: t.title, start: t.due_date, end: t.due_date,
        color: t.status === 'completed' ? 'green' : 'amber', done: t.status === 'completed',
        href: ownName !== undefined ? `/projects/${t.project_id}/tasks` : `/my-jobs/${t.project_id}`,
        source: ownName !== undefined ? 'own' : 'awarded',
      })
    }
  }

  if (scope.inspections) {
    for (const ins of input.inspections) {
      if (!ins.scheduled_date) continue
      const ownName = own.get(ins.project_id)
      const aw = awardedByProject.get(ins.project_id)
      // Awarded: only an inspection for THEIR trade, matched exactly (folded).
      // A blank trade is nobody's in particular, so it is not theirs.
      if (ownName === undefined && !(aw && fold(ins.trade) && aw.trades.has(fold(ins.trade)))) continue
      const done = ins.status === 'passed' || ins.status === 'failed'
      items.push({
        id: `i_${ins.id}`, kind: 'inspection', project_id: ins.project_id,
        project_name: ownName ?? aw!.name,
        title: `${ins.type ?? 'Inspection'}${ins.trade ? ` (${ins.trade})` : ''}`,
        start: ins.scheduled_date, end: ins.scheduled_date,
        color: ins.status === 'failed' ? 'red' : ins.status === 'passed' ? 'green' : 'purple', done,
        href: ownName !== undefined ? `/projects/${ins.project_id}/inspections` : `/my-jobs/${ins.project_id}`,
        source: ownName !== undefined ? 'own' : 'awarded',
      })
    }
  }

  return items
}

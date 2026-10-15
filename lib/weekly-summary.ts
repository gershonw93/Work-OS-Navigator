// The Friday summary: what got done this week, which jobs moved, what slipped.
//
// "a weekly summary for the gc and ppl at the company of what was done -
// generates every friday ... just in numbers, what was done, which project
// moved forward, any delays etc."
//
// PURE. The cron (`app/api/cron/weekly-summary`) reads the rows and hands them
// here; everything that decides what the letter SAYS lives in this file, so the
// tests and the send ask one function.
//
// THREE RULES IT KEEPS:
//   * A COUNT IS OF THINGS THAT HAPPENED IN THE WINDOW, by the date the record
//     itself carries (`completed_at`, `log_date`, `completed_date`,
//     `responded_at`, `selected_at`) - never `created_at` standing in for "done".
//   * "MOVED FORWARD" IS EARNED, NOT ASSUMED. A job moved if something was
//     finished on it this week; a job with nothing recorded is listed as quiet
//     rather than left out, because an absent job reads as a job that is fine.
//   * NO MONEY. It goes to everybody the company routes it to, and margin and
//     payments have their own permissions - a digest is not a way round them.

/** Inclusive date range, 'YYYY-MM-DD'. */
export interface Week { start: string; end: string }

/** The seven days ending on `today`, Saturday to Friday when run on a Friday. */
export function weekEnding(today: string): Week {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 6)
  return { start: d.toISOString().slice(0, 10), end: today }
}

const day = (v: string | null | undefined): string | null => (v ? String(v).slice(0, 10) : null)
const inWeek = (v: string | null | undefined, w: Week) => {
  const d = day(v)
  return !!d && d >= w.start && d <= w.end
}

export interface SummaryInput {
  week: Week
  projects: { id: string; name: string }[]
  tasks: { project_id: string; status: string; completed_at: string | null; due_date: string | null }[]
  dailyLogs: { project_id: string; log_date: string | null }[]
  inspections: { project_id: string; status: string; completed_date: string | null }[]
  rfis: { project_id: string; responded_at: string | null }[]
  selections: { project_id: string; status: string; selected_at: string | null; needed_by: string | null }[]
  delayReports: { project_id: string; days: number | null; reason: string | null; created_at: string; reported_by_name: string | null }[]
  /** Schedule lines, with progress already resolved (`lineProgress`) - null when nobody has said. */
  scheduleLines: { project_id: string; label: string; end_date: string; pct: number | null }[]
}

export interface ProjectWeek {
  id: string
  name: string
  tasksDone: number
  logs: number
  inspectionsPassed: number
  inspectionsFailed: number
  rfisAnswered: number
  selectionsDecided: number
  /** Things that are behind, as sentences: "3 tasks overdue". */
  watch: string[]
  /** Sub-reported delays this week: "Framing: 3 days - rain". */
  delays: string[]
}

export interface WeekSummary {
  week: Week
  totals: { tasksDone: number; logs: number; inspectionsPassed: number; rfisAnswered: number; selectionsDecided: number; delays: number }
  /** Jobs where something was finished, busiest first. */
  moved: ProjectWeek[]
  /** Jobs with something behind or delayed, whether or not they moved. */
  attention: ProjectWeek[]
  /** Active jobs with nothing recorded all week. */
  quiet: ProjectWeek[]
}

const FAILED = new Set(['failed', 'pending_reinspection'])
const OPEN_TASK = (s: string) => s !== 'completed' && s !== 'cancelled'
const OUTSTANDING_SELECTION = (s: string) => s === 'pending' || s === 'waiting'

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** How much got finished on a job, for ordering and for "moved". */
export function doneCount(p: ProjectWeek): number {
  return p.tasksDone + p.logs + p.inspectionsPassed + p.rfisAnswered + p.selectionsDecided
}

export function summarizeWeek(input: SummaryInput): WeekSummary {
  const w = input.week
  const today = w.end
  const of = <T extends { project_id: string }>(rows: T[], id: string) => rows.filter(r => r.project_id === id)

  const projects: ProjectWeek[] = input.projects.map(pr => {
    const tasks = of(input.tasks, pr.id)
    const insp = of(input.inspections, pr.id)
    const sels = of(input.selections, pr.id)

    const overdueTasks = tasks.filter(t => OPEN_TASK(t.status) && t.due_date && t.due_date < today).length
    const lateSelections = sels.filter(s => OUTSTANDING_SELECTION(s.status) && s.needed_by && s.needed_by < today).length
    // Behind = its finish date has passed and somebody has SAID it is not done.
    // An unknown percent is not "behind": nobody has said, and a digest that
    // calls every untracked line late teaches people to skip the section.
    const behind = of(input.scheduleLines, pr.id).filter(l => l.end_date < today && l.pct != null && l.pct < 100)
    const failed = insp.filter(i => FAILED.has(i.status) && inWeek(i.completed_date, w)).length

    const watch: string[] = []
    if (behind.length) watch.push(`${plural(behind.length, 'schedule line')} past its finish date (${behind.slice(0, 3).map(b => b.label).join(', ')}${behind.length > 3 ? '…' : ''})`)
    if (failed) watch.push(`${plural(failed, 'inspection')} failed`)
    if (overdueTasks) watch.push(`${plural(overdueTasks, 'task')} overdue`)
    if (lateSelections) watch.push(`${plural(lateSelections, 'selection')} past its decide-by date`)

    const delays = of(input.delayReports, pr.id)
      .filter(d => inWeek(d.created_at, w))
      .map(d => [d.reported_by_name || 'A sub', d.days ? `${plural(d.days, 'day')}` : null, d.reason?.trim() || null]
        .filter(Boolean).join(' - '))

    return {
      id: pr.id,
      name: pr.name,
      tasksDone: tasks.filter(t => t.status === 'completed' && inWeek(t.completed_at, w)).length,
      logs: of(input.dailyLogs, pr.id).filter(l => inWeek(l.log_date, w)).length,
      inspectionsPassed: insp.filter(i => i.status === 'passed' && inWeek(i.completed_date, w)).length,
      inspectionsFailed: failed,
      rfisAnswered: of(input.rfis, pr.id).filter(r => inWeek(r.responded_at, w)).length,
      selectionsDecided: sels.filter(s => inWeek(s.selected_at, w)).length,
      watch,
      delays,
    }
  })

  const sum = (k: keyof ProjectWeek) => projects.reduce((n, p) => n + (p[k] as number), 0)
  const moved = projects.filter(p => doneCount(p) > 0).sort((a, b) => doneCount(b) - doneCount(a))
  return {
    week: w,
    totals: {
      tasksDone: sum('tasksDone'),
      logs: sum('logs'),
      inspectionsPassed: sum('inspectionsPassed'),
      rfisAnswered: sum('rfisAnswered'),
      selectionsDecided: sum('selectionsDecided'),
      delays: projects.reduce((n, p) => n + p.delays.length, 0),
    },
    moved,
    attention: projects.filter(p => p.watch.length || p.delays.length),
    quiet: projects.filter(p => doneCount(p) === 0 && !p.delays.length),
  }
}

/** "5 tasks done, 2 daily logs, 1 inspection passed" - only the non-zero parts. */
export function movedLine(p: ProjectWeek): string {
  return [
    p.tasksDone && `${plural(p.tasksDone, 'task')} done`,
    p.logs && plural(p.logs, 'daily log'),
    p.inspectionsPassed && `${plural(p.inspectionsPassed, 'inspection')} passed`,
    p.rfisAnswered && `${plural(p.rfisAnswered, 'RFI')} answered`,
    p.selectionsDecided && `${plural(p.selectionsDecided, 'selection')} decided`,
  ].filter(Boolean).join(', ')
}

/** Nothing happened and nothing is wrong: the letter is not worth sending. */
export function isEmptyWeek(s: WeekSummary): boolean {
  return !s.moved.length && !s.attention.length
}

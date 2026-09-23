/**
 * WHO IS ON A TASK - one home, whatever shape they are.
 *
 * A task used to carry ONE assignee, spread over three columns on
 * `project_tasks`: `assigned_to_member_id` (somebody on the job roster),
 * `assigned_to_company_id` (a whole sub), and `assigned_to_name` (a bare name
 * for somebody with no account - 104 of the 134 live tasks, so the common
 * case rather than an edge).
 *
 * `project_task_assignees` is the home now. The three columns are backfilled
 * into it by migration 116 and app code stops reading them; they stay on the
 * table so a rolled-back deploy still meets a schema it can serve.
 *
 * Pure. Every screen and route that needs to name the people on a task asks
 * the same functions, because "assigned to" appears on the board, the card,
 * My Jobs, the dashboard count and two notification paths, and five spellings
 * of one label is how they come to disagree about who is on the job.
 */

export interface TaskAssignee {
  id?: string
  /** Somebody on this job's roster. */
  member_id?: string | null
  /** A whole company - a sub, rather than a person. */
  company_id?: string | null
  /** What to call them. Always set for a name-only assignee, and kept
   *  alongside an id so the row still answers after that id is SET NULL. */
  name?: string | null
}

/** What to call one assignee. Never empty - an unnamed row is still a row. */
export function assigneeName(a: TaskAssignee | null | undefined): string {
  return (a?.name ?? '').trim() || 'Unnamed'
}

/**
 * THE LABEL, AND IT DOES NOT GROW WITHOUT LIMIT.
 *
 * One name reads as one name. Two read as both. Beyond that a card would give
 * a list of five people the whole row, so it names the first and counts the
 * rest - the detail panel is where the full list belongs. `max` is the number
 * of names PRINTED, not the number allowed.
 */
export function assigneeLabel(list: TaskAssignee[] | null | undefined, max = 1): string {
  const names = (list ?? []).map(assigneeName)
  if (!names.length) return 'Unassigned'
  if (names.length <= max) return names.join(', ')
  const shown = names.slice(0, max).join(', ')
  return `${shown} +${names.length - max}`
}

/** Everyone on it, for a detail panel or an email. */
export function assigneeNames(list: TaskAssignee[] | null | undefined): string[] {
  return (list ?? []).map(assigneeName)
}

/**
 * IS THIS TASK MINE?
 *
 * Asked by My Jobs and the dashboard count. It takes every handle a person
 * has - their roster row on this job, their company, and their name - because
 * the same human is a `member_id` on one task and a typed `name` on another,
 * and a check on one of the three answers "not yours" for the other two.
 *
 * The name comparison is folded the way every other exact-match rule here
 * folds, and NEVER partial: "Mike" must not match "Mike Torres", because a
 * task list that quietly includes somebody else's work is worse than one that
 * misses your own - you act on what is in front of you.
 */
export function isAssignedTo(
  list: TaskAssignee[] | null | undefined,
  who: { memberIds?: (string | null | undefined)[]; companyId?: string | null; name?: string | null },
): boolean {
  const members = new Set((who.memberIds ?? []).filter(Boolean) as string[])
  const fold = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  const myName = fold(who.name)

  return (list ?? []).some(a => {
    if (a.member_id && members.has(a.member_id)) return true
    if (a.company_id && who.companyId && a.company_id === who.companyId) return true
    if (myName && fold(a.name) === myName) return true
    return false
  })
}

/**
 * The set to write, cleaned up.
 *
 * THE SAME PERSON MUST NOT LAND TWICE - the picker can hand back a duplicate
 * after an edit, and the unique indexes would refuse the whole write rather
 * than the one row. Deduped by id where there is one and by folded name where
 * there is not, which is the same key the indexes use.
 *
 * An entry with no id and no name is DROPPED, never written as an empty row:
 * a blank assignee renders as "Unnamed" on a card for ever and means nothing.
 */
export function normalizeAssignees(list: TaskAssignee[] | null | undefined): TaskAssignee[] {
  const out: TaskAssignee[] = []
  const seen = new Set<string>()
  const fold = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

  for (const a of list ?? []) {
    const member = a.member_id || null
    const company = a.company_id || null
    const name = (a.name ?? '').trim() || null
    if (!member && !company && !name) continue

    const key = member ? `m:${member}` : company ? `c:${company}` : `n:${fold(name)}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ member_id: member, company_id: company, name })
  }
  return out
}

/**
 * WHO FINISHED IT, as a sentence.
 *
 * Null when it is not finished, and null when it IS finished but nobody is
 * recorded - every task completed before migration 116 is in that second
 * group, and inventing "completed by somebody" for them would be a claim. A
 * missing name says less, which is the honest side of that fence.
 */
export function completedByLabel(task: {
  status?: string | null
  completed_at?: string | null
  completed_by_name?: string | null
}): string | null {
  if (task.status !== 'completed' && !task.completed_at) return null
  const who = (task.completed_by_name ?? '').trim()
  return who ? `Completed by ${who}` : null
}

/**
 * THE TASK IDS A PERSON IS ON, straight out of the join table.
 *
 * Every "my tasks" surface needs this: My Jobs, the dashboard count, the
 * field task list and the project board's sub-view. They each used to filter
 * `project_tasks` on one of the three `assigned_to_*` columns, which stopped
 * working the moment a task could carry several people - a task assigned to
 * two crew would be nobody's.
 *
 * Returns null when the lookup FAILED, which is not the same as an empty
 * array. An empty list means "you are on nothing"; null means "we could not
 * ask", and a caller that renders those the same way tells somebody their
 * work has gone.
 */
export async function taskIdsFor(
  db: { from: (t: string) => any },
  who: { memberIds?: (string | null | undefined)[]; companyId?: string | null; name?: string | null },
): Promise<string[] | null> {
  const memberIds = (who.memberIds ?? []).filter(Boolean) as string[]
  const name = (who.name ?? '').trim()

  const ors: string[] = []
  if (memberIds.length) ors.push(`member_id.in.(${memberIds.join(',')})`)
  if (who.companyId) ors.push(`company_id.eq.${who.companyId}`)
  // Name is the fallback for somebody with no account, which is most of them.
  if (name) ors.push(`name.ilike.${name.replace(/[(),*]/g, ' ')}`)
  if (!ors.length) return []

  const { data, error } = await db
    .from('project_task_assignees')
    .select('task_id')
    .or(ors.join(','))

  if (error) {
    console.error('[task-assignees] lookup failed:', error.message)
    return null
  }
  return Array.from(new Set((data ?? []).map((r: any) => r.task_id).filter(Boolean)))
}

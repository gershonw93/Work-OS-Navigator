// WHO A HOUSE MODEL'S PUNCH ITEM GOES TO - "who does it get assigned to?".
//
// A punch item on a model becomes a task on every house the model is applied
// to. With nobody on it, thirty houses get thirty "Unassigned" tasks and
// somebody assigns them one at a time. So the model says who, once: a
// teammate, a sub from the Directory, or just a typed name.
//
// A TEAMMATE IS A PROFILE, NOT A ROSTER ROW. `project_team_members` is per job
// and a model belongs to the development, so the roster id cannot be known
// until the item lands on a particular house - `taskAssigneeFor` answers
// that, and asks for a roster row to be made when the house has none.
//
// Pure. The editor and the route both ask `modelAssigneeProblem`.

import type { TaskAssignee } from './task-assignees'

/** What is stored on `site_model_items`. At most one id; the name always rides along. */
export interface ModelAssignee {
  assignee_profile_id?: string | null
  assignee_company_id?: string | null
  assignee_name?: string | null
}

/** What the editor sends. `none` takes the assignee off. */
export type ModelAssigneeInput =
  | { kind: 'teammate'; id: string }
  | { kind: 'company'; id: string }
  | { kind: 'name'; name: string }
  | { kind: 'none' }

export const NAME_MAX = 120

/** Why this assignee cannot be saved, or null. */
export function modelAssigneeProblem(input: unknown): string | null {
  const a = input as Partial<{ kind: string; id: unknown; name: unknown }> | null
  if (!a || typeof a !== 'object') return 'Say who it goes to.'
  if (a.kind === 'none') return null
  if (a.kind === 'teammate' || a.kind === 'company') {
    return String(a.id ?? '').trim() ? null : (a.kind === 'teammate' ? 'Pick a teammate.' : 'Pick a sub.')
  }
  if (a.kind === 'name') {
    const n = String(a.name ?? '').trim()
    if (!n) return 'Type a name.'
    if (n.length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters.`
    return null
  }
  return 'Say who it goes to.'
}

/** The columns to write, given what the editor sent and the name the route looked up. */
export function modelAssigneeRow(input: ModelAssigneeInput, resolvedName?: string | null): Required<ModelAssignee> {
  if (input.kind === 'teammate') return { assignee_profile_id: input.id, assignee_company_id: null, assignee_name: resolvedName ?? null }
  if (input.kind === 'company') return { assignee_profile_id: null, assignee_company_id: input.id, assignee_name: resolvedName ?? null }
  if (input.kind === 'name') return { assignee_profile_id: null, assignee_company_id: null, assignee_name: input.name.trim() }
  return { assignee_profile_id: null, assignee_company_id: null, assignee_name: null }
}

/** Has this item got anybody on it? */
export function hasModelAssignee(a: ModelAssignee | null | undefined): boolean {
  return !!(a?.assignee_profile_id || a?.assignee_company_id || String(a?.assignee_name ?? '').trim())
}

/**
 * The one value a `<select>` holds for an item: `p:<id>`, `c:<id>`, `n` for a
 * typed name, `` for nobody. A profile or company that has since gone (SET
 * NULL) leaves only the name, which reads back as a typed name - still true.
 */
export function pickerValue(a: ModelAssignee | null | undefined): string {
  if (a?.assignee_profile_id) return `p:${a.assignee_profile_id}`
  if (a?.assignee_company_id) return `c:${a.assignee_company_id}`
  if (String(a?.assignee_name ?? '').trim()) return 'n'
  return ''
}

/** What a picked value means. `n` needs the typed name supplied separately. */
export function parsePickerValue(v: string, typedName = ''): ModelAssigneeInput {
  if (v.startsWith('p:')) return { kind: 'teammate', id: v.slice(2) }
  if (v.startsWith('c:')) return { kind: 'company', id: v.slice(2) }
  if (v === 'n') return { kind: 'name', name: typedName }
  return { kind: 'none' }
}

/**
 * The task assignee this item becomes on ONE house.
 *
 * - A sub: the company, on any house.
 * - A typed name: the name, on any house.
 * - A teammate: that house's roster row for them. When the house has none,
 *   `addMember` says so - the apply puts them on the house's team first,
 *   because a task assigned to somebody not on the job does not show in
 *   their My Jobs (which reads the roster), and assigning them IS putting
 *   them on the job.
 */
export function taskAssigneeFor(
  item: ModelAssignee,
  roster: readonly { id: string; profile_id?: string | null }[],
): { assignee: TaskAssignee } | { addMember: string } | null {
  const name = String(item.assignee_name ?? '').trim() || null
  if (item.assignee_company_id) return { assignee: { company_id: item.assignee_company_id, name } }
  if (item.assignee_profile_id) {
    const row = roster.find(r => r.profile_id === item.assignee_profile_id)
    return row ? { assignee: { member_id: row.id, name } } : { addMember: item.assignee_profile_id }
  }
  if (name) return { assignee: { name } }
  return null
}

/**
 * ONE NOTIFICATION PER PERSON PER APPLY, not one per task. Applying a model to
 * thirty houses with three punch items each is ninety tasks; ninety bells (and
 * ninety emails) for one press is how notifications get switched off.
 *
 * The link goes where THEY can open it: a teammate to the house's tasks or the
 * development's job list, a sub to My Jobs - a sub cannot open the GC's
 * development page.
 */
export function punchNotice(args: {
  count: number
  houses: readonly { id: string; name: string }[]
  siteId: string
  siteName: string | null
  sub: boolean
}): { message: string; link: string } {
  const items = `${args.count} punch item${args.count === 1 ? '' : 's'}`
  if (args.houses.length === 1) {
    const h = args.houses[0]
    return {
      message: `You have ${items} on ${h.name}`,
      link: args.sub ? `/my-jobs/${h.id}` : `/projects/${h.id}/tasks`,
    }
  }
  const where = args.siteName ? ` in ${args.siteName}` : ''
  return {
    message: `You have ${items} across ${args.houses.length} houses${where}`,
    link: args.sub ? '/my-jobs' : `/projects/${args.siteId}/units`,
  }
}

import { can, isAssignedOnly, type PermMap } from './permissions'

/**
 * WHAT A PERSON'S CALENDAR FEED MAY CARRY - pure, so the rule can be tested on
 * behaviour rather than on the shape of a route.
 *
 * The feed (`/api/calendar/<token>`) is a standing, unauthenticated URL a
 * calendar app polls, so it is the one read in the product that nobody's
 * screen gates. It used to answer every holder with every schedule line, task
 * and inspection on every job the COMPANY owned: a worker - `schedule: N`,
 * `inspections: N`, assigned-only everywhere else - was handed all of it, for
 * jobs they had never been put on. Same answer the app gives, now:
 *
 *   - each kind of event only with `view` on its resource;
 *   - an assigned-only role only on the jobs they are ON, and only the tasks
 *     that are THEIRS (the Tasks tab's rule for those roles);
 *   - an assignment that could not be READ refuses the feed (`null`), never a
 *     smaller calendar - a feed missing half its events is one somebody plans
 *     a week from.
 */
export interface FeedScope {
  schedule: boolean
  tasks: boolean
  inspections: boolean
  /** null = every job the company owns; otherwise only these. */
  projectIds: string[] | null
  /** null = every task on those jobs; otherwise only these task ids. */
  taskIds: string[] | null
}

export interface FeedAssignment {
  projectIds: string[]
  /** null when the lookup FAILED - see `taskIdsFor`. */
  taskIds: string[] | null
}

export function feedScope(
  actor: { role: string | null; permissions: PermMap },
  assignment: FeedAssignment | null,
): FeedScope | null {
  const kinds = {
    schedule: can(actor.permissions, 'schedule', 'view'),
    tasks: can(actor.permissions, 'tasks', 'view'),
    inspections: can(actor.permissions, 'inspections', 'view'),
  }
  if (!isAssignedOnly(actor.role)) return { ...kinds, projectIds: null, taskIds: null }
  if (!assignment || (kinds.tasks && assignment.taskIds === null)) return null
  return { ...kinds, projectIds: assignment.projectIds, taskIds: assignment.taskIds ?? [] }
}

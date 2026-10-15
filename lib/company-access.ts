import { can, type PermMap } from './permissions'

// ─────────────────────────────────────────────────────────────────────────────
// Company-wide questions the API asks, answered once.
//
// These routes are not under a job, so `ownedProject` has nothing to ask - the
// company is the actor's own, and the question is only WHICH of its people may
// do the thing. Pure, so the lockdown suite can call them with role defaults
// rather than reading their source.
// ─────────────────────────────────────────────────────────────────────────────

export interface ActorLike {
  role: string
  permissions: PermMap
}

/**
 * May this person change a company-level CONNECTION or brand - QuickBooks,
 * the logo, delete protection?
 *
 * The routes said `['admin', 'manager'].includes(role)` and nothing else, so a
 * company that granted a custom role `settings_company: edit` got the Security
 * tab and a route that refused it, while a manager - `settings_company: view`
 * in the map - kept a power the screen also offers them (the QuickBooks card's
 * buttons read the same role list through `canManage`). Both halves stay:
 * nobody who has it today loses it, and the map can now grant it too.
 */
export function mayManageCompanySetting(actor: ActorLike | null | undefined): boolean {
  if (!actor) return false
  return ['admin', 'manager'].includes(actor.role) || can(actor.permissions, 'settings_company', 'edit')
}

/**
 * How much of the Directory this person may read.
 *
 *   'full'  - `directory: view`. The Directory page, the pickers on the job
 *             screens, Quick Add.
 *   'share' - no `directory`, but `files: view`: the Files page's "Share
 *             documents" box suggests names and addresses from the Directory
 *             and a Worker can open it. They get exactly what that box reads
 *             (name, address, kind) and nothing else - not phones, insurance,
 *             notes or who has an account.
 *   null    - neither, refused.
 */
export function directoryReadLevel(actor: ActorLike | null | undefined): 'full' | 'share' | null {
  if (!actor) return null
  if (can(actor.permissions, 'directory', 'view')) return 'full'
  if (can(actor.permissions, 'files', 'view')) return 'share'
  return null
}

/** The fields the share box reads, and the only ones a 'share' reader gets. */
export const DIRECTORY_SHARE_FIELDS = ['id', 'name', 'contact_email', 'type'] as const

/**
 * Global search: which permission each result group needs.
 *
 * A search box is a window onto every table it searches, so a group the
 * person could not open as a screen must not come back as a hit either -
 * budget lines to somebody with `budget: N` is the same leak as the Budget
 * tab, one input field away. `null` means any member of the company.
 */
export const SEARCH_GROUP_RESOURCE: Record<string, string | null> = {
  projects: 'projects',
  budget: 'budget',
  materials: 'materials',
  invoices: 'invoices',
  subcontracts: 'team',
  rfis: 'rfis',
  tasks: 'tasks',
  'change-orders': 'change-orders',
  customers: 'customers',
  directory: 'directory',
  // The company's own roster. Every member already reads it through
  // /api/settings and /api/settings/teammates.
  team: null,
}

export function searchGroupAllowed(actor: ActorLike | null | undefined, group: string): boolean {
  if (!actor) return false
  if (!(group in SEARCH_GROUP_RESOURCE)) return false
  const resource = SEARCH_GROUP_RESOURCE[group]
  return resource === null || can(actor.permissions, resource, 'view')
}

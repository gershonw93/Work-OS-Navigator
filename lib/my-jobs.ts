import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * WHICH JOBS IS THIS PERSON ON - one answer, one home.
 *
 * Every screen that is scoped to "the jobs you are assigned to" asks this:
 * the projects list, its stats, the permission layer's `getAssignment`, the
 * field task feed and the field inspections feed. There were four copies of
 * the resolution chain and they had already drifted.
 *
 * THREE KEYS, STRONGEST FIRST, and the difference between them is the whole
 * point of this file:
 *
 *   1. profile_id  - an actual foreign key. If it is set, it is the answer.
 *
 *   2. email       - an identity. An address is globally unique, so if
 *                    somebody typed it onto a project team they meant THIS
 *                    person, whichever company owns the job. That is how a
 *                    sub or a vendor legitimately appears on a GC's project.
 *                    Matched case-insensitively: rows carry what a human
 *                    typed ("Jay@..." beside "jay@..."), and an exact match
 *                    silently returned NOTHING for the mismatched case - a
 *                    field supervisor with no projects at all and no error to
 *                    explain it.
 *
 *   3. name        - NOT an identity, and this is the leak that was here.
 *                    `name.eq.<full name>` ran against the WHOLE table with no
 *                    company filter, so a restricted-role user at one GC whose
 *                    full name matched a team row somebody typed at a
 *                    different GC was handed that company's project. Not
 *                    theoretical: the live database had 8 such matches across
 *                    2 names, and because profile_id was almost never set
 *                    (64 of 73 rows), this fallback was the MAIN path rather
 *                    than a rare edge. Same rule as `lib/inspector-link.ts`,
 *                    which refuses to turn a free-text name into a link: A
 *                    NAME IS NOT A KEY. It survives only for the handful of
 *                    rows carrying no email at all, and only within the
 *                    person's OWN company's projects, where a duplicate name
 *                    is one tenant's problem rather than a door into another.
 *
 * NO `.or()` STRING BUILDING. The old version composed PostgREST filter
 * grammar by interpolation - `name.eq.${full_name}` - so a name containing a
 * comma or a parenthesis did not fail, it reparsed into different filters.
 * Separate typed calls cannot be injected into.
 */
export interface JobMembership {
  /** project_team_members.id values - what tasks are assigned against. */
  memberIds: string[]
  /** Distinct project ids this person is on. */
  projectIds: string[]
}

export interface MemberLookup {
  email?: string | null
  full_name?: string | null
  company_id?: string | null
}

const COLS = 'id, project_id, email'

const fold = (v: unknown): string => String(v ?? '').trim().toLowerCase()

/** PostgREST treats `%` and `_` as wildcards in ilike; keep them literal. */
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, m => `\\${m}`)

type Row = { id: string; project_id: string; email?: string | null }

const shape = (rows: Row[]): JobMembership => ({
  memberIds: Array.from(new Set(rows.map(r => r.id).filter(Boolean))),
  projectIds: Array.from(new Set(rows.map(r => r.project_id).filter(Boolean))),
})

export async function myJobs(
  db: SupabaseClient,
  userId: string,
  profile: MemberLookup | null | undefined,
): Promise<JobMembership> {
  // 1. The foreign key.
  const { data: byProfileId } = await db
    .from('project_team_members').select(COLS).eq('profile_id', userId)
  if (byProfileId?.length) return shape(byProfileId as Row[])

  const email = fold(profile?.email)
  const fullName = String(profile?.full_name ?? '').trim()

  // 2. The address, case-insensitively. `ilike` narrows the query; the exact
  // fold below is what actually decides, so an escaped-wildcard near-miss
  // cannot widen the result.
  if (email) {
    const { data: byEmail } = await db
      .from('project_team_members').select(COLS).ilike('email', escapeLike(email))
    const exact = ((byEmail ?? []) as Row[]).filter(r => fold(r.email) === email)
    if (exact.length) return shape(exact)
  }

  // 3. The name - inside this company only, and only for rows that gave us
  // nothing better to go on.
  if (fullName && profile?.company_id) {
    const { data: ownProjects } = await db
      .from('projects').select('id')
      .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    const ids = ((ownProjects ?? []) as { id: string }[]).map(p => p.id).filter(Boolean)
    if (ids.length) {
      const { data: byName } = await db
        .from('project_team_members').select(COLS)
        .eq('name', fullName)
        .in('project_id', ids)
      if (byName?.length) return shape(byName as Row[])
    }
  }

  return { memberIds: [], projectIds: [] }
}

/**
 * Attach a person to the team rows that were typed for them before they had an
 * account.
 *
 * A GC builds a project team by typing names and emails, usually weeks before
 * anybody signs in. Nothing in the app ever wrote `profile_id` back, so 64 of
 * 73 live rows had it empty and every assigned-only screen was resolving
 * people by string match for ever. The FK is the only key that cannot be
 * broken by a rename, a capital letter or a namesake at another company.
 *
 * Email only, and only rows that are not already claimed. Returns how many it
 * linked so a caller can log it.
 */
export async function linkTeamRows(
  db: SupabaseClient,
  userId: string,
  email: string | null | undefined,
): Promise<number> {
  const folded = fold(email)
  if (!folded) return 0

  const { data: candidates, error } = await db
    .from('project_team_members').select('id, email')
    .is('profile_id', null)
    .ilike('email', escapeLike(folded))
  if (error) {
    console.error('[linkTeamRows] lookup failed:', error.message)
    return 0
  }

  const ids = ((candidates ?? []) as Row[])
    .filter(r => fold(r.email) === folded)
    .map(r => r.id)
  if (!ids.length) return 0

  const { error: updateErr } = await db
    .from('project_team_members').update({ profile_id: userId }).in('id', ids)
  if (updateErr) {
    console.error('[linkTeamRows] link failed:', updateErr.message)
    return 0
  }
  return ids.length
}

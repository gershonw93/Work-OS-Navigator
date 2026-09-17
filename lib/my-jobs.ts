import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * WHICH JOBS IS THIS PERSON ON - one answer, one home.
 *
 * A worker is attached to a job by a `project_team_members` row, and that row
 * points back at them in one of three ways: `profile_id` when they were added
 * after signing up, and otherwise their email or their name, because a GC adds
 * a crew to a job long before anybody accepts an invite. The chain is ordered
 * strongest-first and stops at the first thing that matches.
 *
 * Extracted because a SECOND field feed needed it (the inspections a worker can
 * mark ready) and a copy of this chain is exactly the kind of thing that gets
 * fixed in one place and not the other - at which point two field screens
 * disagree about which jobs you are on, silently, and the one that is wrong
 * just looks empty.
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
}

export async function myJobs(
  db: SupabaseClient,
  userId: string,
  profile: MemberLookup | null | undefined,
): Promise<JobMembership> {
  const rows: { id: string; project_id: string }[] = []

  const { data: byProfileId } = await db
    .from('project_team_members').select('id, project_id').eq('profile_id', userId)
  if (byProfileId?.length) rows.push(...(byProfileId as any))

  if (!rows.length && profile) {
    const conditions: string[] = []
    if (profile.email) conditions.push(`email.eq.${profile.email}`)
    if (profile.full_name) conditions.push(`name.eq.${profile.full_name}`)
    if (conditions.length) {
      const { data: byNameEmail } = await db
        .from('project_team_members').select('id, project_id').or(conditions.join(','))
      if (byNameEmail?.length) rows.push(...(byNameEmail as any))
    }
  }

  return {
    memberIds: rows.map(r => r.id),
    projectIds: Array.from(new Set(rows.map(r => r.project_id).filter(Boolean))),
  }
}

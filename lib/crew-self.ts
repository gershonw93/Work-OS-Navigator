import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// Putting the signed-in person on a job's crew - "why am I not on the crew of
// the job if I created it".
//
// THE CREW IS `project_team_members`, and nothing put the person who opened a
// job on it. So the task assignee picker - which offers that roster - offered
// everybody except the one person most likely to want a reminder for
// themselves, and the only way round it was to add yourself to your own job
// through Subs & Team like a stranger.
//
// TWO DOORS ASK THIS: every route that creates a job (so the creator is on it
// from the first second), and the picker's "Me" button (so the jobs that
// already exist - there is no `created_by` person on `projects` to backfill
// from - fix themselves the first time somebody wants it).
//
// FIND BEFORE ADDING. A row may already be there under the person's email,
// typed in by hand before they had an account - that row is linked to the
// profile rather than duplicated, because two lines for one person split their
// tasks across both. Same order the tasks route resolves "who am I on this
// job": profile, then email. Never by name: two people called Mike are two
// people.
// ─────────────────────────────────────────────────────────────────────────────

export interface CrewRow { id: string; name: string; role: string }

/** The job role a person's account role most plausibly is. A label, never a permission. */
export function jobRoleFor(accountRole: string | null | undefined): string {
  switch (accountRole) {
    case 'admin':
    case 'owner':
    case 'project_manager': return 'Project Manager'
    case 'field_supervisor': return 'Superintendent'
    case 'worker':
    case 'member': return 'Laborer'
    default: return 'Other'
  }
}

/**
 * The person's crew row on this job, made if it is not there. Never throws:
 * a job that was created must not be reported as failed because the roster
 * line beside it could not be written - the error comes back to be logged.
 */
export async function ensureOnCrew(
  db: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<{ member: CrewRow | null; added: boolean; error?: string }> {
  try {
    const { data: byProfile, error: pErr } = await db.from('project_team_members')
      .select('id, name, role').eq('project_id', projectId).eq('profile_id', userId).limit(1)
    if (pErr) return { member: null, added: false, error: pErr.message }
    if (byProfile?.length) return { member: byProfile[0] as CrewRow, added: false }

    const { data: profile, error: profErr } = await db.from('profiles')
      .select('full_name, email, role').eq('id', userId).maybeSingle()
    if (profErr || !profile) return { member: null, added: false, error: profErr?.message ?? 'No profile for this account.' }

    const email = String((profile as any).email ?? '').trim()
    if (email) {
      const { data: byEmail } = await db.from('project_team_members')
        .select('id, name, role').eq('project_id', projectId).ilike('email', email.replace(/[\\%_]/g, m => `\\${m}`)).limit(1)
      if (byEmail?.length) {
        await db.from('project_team_members').update({ profile_id: userId }).eq('id', byEmail[0].id)
        return { member: byEmail[0] as CrewRow, added: false }
      }
    }

    const name = String((profile as any).full_name ?? '').trim() || email || 'Me'
    const { data: row, error: insErr } = await db.from('project_team_members')
      .insert({
        project_id: projectId, name, role: jobRoleFor((profile as any).role),
        email: email || null, profile_id: userId,
      })
      .select('id, name, role').single()
    if (insErr || !row) return { member: null, added: false, error: insErr?.message ?? 'Could not add to the crew.' }
    return { member: row as CrewRow, added: true }
  } catch (e: any) {
    return { member: null, added: false, error: e?.message ?? String(e) }
  }
}

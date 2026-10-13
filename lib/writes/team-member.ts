import type { SupabaseClient } from '@supabase/supabase-js'
import { profileIdForEmail } from '@/lib/my-jobs'
import { logActivity } from '@/lib/log-activity'
import { missingMemberBody } from '@/lib/team-member'
import { friendlyDbError } from '@/lib/db-error'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Putting somebody on a job's team roster, and correcting them - the ONE home
// for both.
//
// Moved out of `POST /api/projects/[id]/team` and
// `PATCH /api/projects/[id]/team/[memberId]` unchanged, so the MCP server
// (Claude) adds a person through the same shared rule the dialog asks
// (`missingMemberBody`) and the same case-insensitive profile link. The routes
// keep the gate - `team: edit` AND ownership of the job, because staffing a
// job is the owner's act. This is a roster line, never an invite: nobody is
// emailed and no account is made.
// ─────────────────────────────────────────────────────────────────────────────

export async function addTeamMember(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const params = { id: projectId }

  // SQL: ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id);
  // SQL: ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS actor_id uuid;

  const missing = missingMemberBody(body)
  if (missing) return { status: 400, body: { error: missing } }
  const name = String(body.name).trim()
  const role = String(body.role).trim()
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null

  // Auto-link to a real profile so the row carries a foreign key rather than a
  // string somebody typed. Case-insensitively: this was an exact match on the
  // address, so "Jay@..." against an account stored as "jay@..." wrote a NULL
  // link and left the person resolving by string match for ever.
  const profileId = await profileIdForEmail(db, email)

  const { data, error } = await db
    .from('project_team_members')
    .insert({ project_id: params.id, name, role, phone, email, profile_id: profileId })
    .select()
    .single()

  if (error) {
    console.error('[team POST]', error)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, withVia(profile?.full_name || 'Someone', via), 'team_member_added',
    `${name} added to the team as ${role}`, { member_id: data.id, name, role }, user.id)

  return { status: 200, body: { member: data } }
}

export async function updateTeamMember(
  db: SupabaseClient,
  // `userId` and `via` are taken for the same shape as every other write here;
  // an edit records no activity line today, so neither is read yet.
  { projectId, memberId, body }: { userId: string; projectId: string; memberId: string; body: any; via?: string },
): Promise<WriteResult> {
  const params = { id: projectId, memberId }
  const { name, role, phone, email } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (phone !== undefined) updates.phone = phone
  if (email !== undefined) updates.email = email

  const { data, error } = await db
    .from('project_team_members')
    .update(updates)
    .eq('id', params.memberId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) {
    console.error('[team PATCH]', error)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }

  return { status: 200, body: { member: data } }
}

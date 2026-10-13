import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { notify } from '@/lib/notify'
import { normalizeAssignees, assigneeLabel } from '@/lib/task-assignees'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Creating a task - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/tasks` unchanged so the MCP server
// (Claude) creates a task through exactly the code the Tasks tab does: the
// same whitelist, the same assignee join rows, the same activity line and the
// same notification to everyone on it, once each. The route keeps the gate and
// the billing lock; this is everything after them.
// ─────────────────────────────────────────────────────────────────────────────

export const TASK_STATUSES = ['open', 'in_progress', 'completed']

export async function createTask(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { title, description, due_date, priority, status, assigned_to_member_id, assigned_to_company_id, assigned_to_name, image_url, follow_up_date, follow_up_note, source_daily_log_id } = body

  // A TASK CAN HAVE SEVERAL PEOPLE ON IT. `assignees` is the shape now; the
  // three `assigned_to_*` fields are still accepted because five other
  // screens create a pre-assigned task through this route (a plan pin, a
  // daily log, a budget line) and each hands over exactly one person. They
  // are folded into the same list rather than kept as a second home.
  const assignees = normalizeAssignees([
    ...(Array.isArray(body?.assignees) ? body.assignees : []),
    { member_id: assigned_to_member_id, company_id: assigned_to_company_id, name: assigned_to_name },
  ])
  if (!title) return { status: 400, body: { error: 'Title is required' } }

  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()

  const { data, error } = await db
    .from('project_tasks')
    .insert({
      project_id: projectId,
      title,
      description: description || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      // The board's per-column "+" says which column it is adding to, and this
      // used to be hardcoded 'open' - so adding from In Progress or Completed
      // put the card somewhere else. Whitelisted, not passed through: the
      // value comes from the browser and the column has a check constraint.
      status: TASK_STATUSES.includes(status) ? status : 'open',
      // The board's Completed column has a "+" too, so a task can be born
      // finished. Same rule as the PATCH: the timestamp follows the status.
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      assigned_to_member_id: assigned_to_member_id || null,
      assigned_to_company_id: assigned_to_company_id || null,
      assigned_to_name: assigned_to_name || null,
      image_url: image_url || null,
      follow_up_date: follow_up_date || null,
      follow_up_note: follow_up_note || null,
      // Set when the task was raised from a field log observation.
      source_daily_log_id: source_daily_log_id || null,
      // Whitelisted: the column has a check constraint (migration 133).
      ...(body?.kind === 'punch' ? { kind: 'punch' } : {}),
      created_by: withVia((profile as any)?.full_name ?? 'Unknown', via),
    })
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  // Log task creation to job history
  const actorName = withVia((profile as any)?.full_name ?? (profile as any)?.email ?? 'Someone', via)
  // THE ASSIGNEES, written after the task exists because they point at it.
  // Logged rather than thrown: the task is the thing that was asked for, and
  // a task that saved with nobody on it is recoverable in one edit, while a
  // 500 here would leave a row the caller believes was never created.
  if (assignees.length) {
    const { error: aErr } = await db.from('project_task_assignees')
      .insert(assignees.map(a => ({ task_id: (data as any).id, ...a })))
    if (aErr) console.error('[tasks] could not save assignees:', aErr.message)
  }

  const assignedLabel = assignees.length ? ` (assigned to ${assigneeLabel(assignees, 2)})` : ''
  await logActivity(
    db, projectId, actorName, 'task_created',
    `${actorName} created task "${title}"${assignedLabel}`,
    { task_id: (data as any)?.id }, user.id,
  )

  // TELL EVERYONE WHO IS ON IT, ONCE EACH.
  //
  // This used to be two blocks reading the two `assigned_to_*` columns, which
  // could only ever name one person and one company. With several people on a
  // task the recipients have to be gathered across every assignee and then
  // DEDUPED - somebody who is both on the roster and at the assigned sub is
  // one person, and two identical "you have been assigned a task" emails for
  // one task is the thing the bell and the letter are kept apart to avoid.
  const memberIds = assignees.map(a => a.member_id).filter(Boolean) as string[]
  const companyIds = assignees.map(a => a.company_id).filter(Boolean) as string[]
  const recipientIds = new Set<string>()

  if (memberIds.length) {
    const { data: members } = await db.from('project_team_members')
      .select('id, email, profile_id').in('id', memberIds)
    const needEmailLookup: string[] = []
    for (const m of (members ?? []) as any[]) {
      if (m.profile_id) recipientIds.add(m.profile_id)
      else if (m.email) needEmailLookup.push(m.email)
    }
    // A roster row with no account yet still names somebody who may have one.
    if (needEmailLookup.length) {
      const { data: ps } = await db.from('profiles').select('id').in('email', needEmailLookup)
      for (const p of (ps ?? []) as any[]) recipientIds.add(p.id)
    }
  }

  if (companyIds.length) {
    // Everyone at the company, never .single() - that errors unless there is
    // exactly one user, which silently dropped the notification for any sub
    // with a second account.
    const { data: subProfiles } = await db.from('profiles').select('id').in('company_id', companyIds)
    for (const p of (subProfiles ?? []) as any[]) recipientIds.add(p.id)
  }

  if (recipientIds.size) {
    await notify({
      db, userIds: Array.from(recipientIds), type: 'task_assigned', title: 'Task assigned',
      message: `You have been assigned a task: "${title}"`,
      link: `/projects/${projectId}/tasks`,
    })
  }

  return { status: 200, body: { task: data } }
}

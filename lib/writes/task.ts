import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { notify } from '@/lib/notify'
import { audienceFor } from '@/lib/notification-audience'
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

// ─────────────────────────────────────────────────────────────────────────────
// Changing a task - moved out of `PATCH /api/projects/[id]/tasks/[taskId]`
// unchanged, so the MCP server edits a task through the same whitelist, the
// same derived `completed_at` / `completed_by` / `completed_by_name`, the same
// assignee replace, the same history line and the same `task_updated` notice.
// The route keeps the sign-in check; this is everything after the body.
// ─────────────────────────────────────────────────────────────────────────────

function prettyStatus(s: string) {
  return s.replace(/_/g, ' ')
}

export async function updateTask(
  db: SupabaseClient,
  { userId, userEmail, projectId, taskId, body, via }: {
    userId: string; userEmail?: string | null; projectId: string; taskId: string; body: any; via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId }


  // Read ONCE, up here: both `completed_by_name` below and the history line
  // further down need it, and it used to be fetched only after the write.
  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()
  const actorName = withVia((profile as any)?.full_name ?? (profile as any)?.email ?? userEmail ?? 'Someone', via)

  const updates: Record<string, any> = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.due_date !== undefined) updates.due_date = body.due_date
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.image_url !== undefined) updates.image_url = body.image_url
  if (body.follow_up_date !== undefined) updates.follow_up_date = body.follow_up_date
  if (body.follow_up_note !== undefined) updates.follow_up_note = body.follow_up_note
  // Punch item or ordinary task (migration 133). Whitelisted to the two values
  // the check constraint allows, so a stray string is ignored, not a 500.
  if (body.kind === 'punch' || body.kind === 'task') updates.kind = body.kind

  // WHO HAS IT. These three were missing from this whitelist, and the edit form
  // has always sent all three - so the route dropped them, wrote everything
  // else, and answered 200. Assigning somebody while CREATING a task worked
  // (that is the POST, which does write them); assigning or reassigning an
  // existing one has never done anything, with no error anywhere to say so.
  // A whitelist is the right shape - a body must not be able to write any
  // column it names - but a field left off one fails exactly like a field the
  // server rejected, and only one of those tells you.
  if (body.assigned_to_member_id !== undefined) updates.assigned_to_member_id = body.assigned_to_member_id
  if (body.assigned_to_company_id !== undefined) updates.assigned_to_company_id = body.assigned_to_company_id
  if (body.assigned_to_name !== undefined) updates.assigned_to_name = body.assigned_to_name

  // WHEN IT WAS FINISHED. `completed_at` has been in the schema since 046 and
  // nothing outside the demo seed has ever written it, so a finished task knew
  // it was finished and not when - which is why a completed card had only its
  // DUE date to show and read "6d overdue" for ever. Derived from the status
  // rather than taken from the body: it is a fact about the move, and a client
  // that could set it could date a task finished last year.
  if (body.status !== undefined) {
    updates.completed_at = body.status === 'completed' ? new Date().toISOString() : null
    // AND WHO FINISHED IT. `completed_at` said when and never by whom, which
    // is the question a month later - and with several people on a task it is
    // the only way to know which of them actually did it.
    //
    // Derived from the ACTOR, never taken from the body, exactly as the
    // timestamp is: a client that could name the finisher could credit
    // somebody who was not there. Cleared on the way back out of completed,
    // because a name left behind on a re-opened task is a claim about work
    // that is no longer done.
    updates.completed_by = body.status === 'completed' ? user.id : null
    updates.completed_by_name = body.status === 'completed'
      ? actorName
      : null
  }

  // Capture the previous state so we can describe the change in history
  const { data: prev } = await db
    .from('project_tasks')
    .select('title, status, priority, due_date, assigned_to_name, description')
    .eq('id', taskId)
    .single()

  const { data, error } = await db
    .from('project_tasks')
    .update(updates)
    .eq('id', taskId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  // WHO IS ON IT, when the body says so.
  //
  // `undefined` means "not mentioned" and leaves them alone; an empty array
  // means "nobody", which is a real answer and must be able to clear the
  // list. That is the same distinction the whitelist above draws, and
  // collapsing the two would make unassigning impossible.
  //
  // Replace rather than diff: the picker hands back the whole set, and a diff
  // computed from a stale screen removes somebody a second tab just added.
  // Delete THEN insert, in that order - the unique indexes would refuse an
  // insert that overlaps the rows still sitting there.
  let assigneeNamesAfter: string[] | null = null
  if (body.assignees !== undefined) {
    const wanted = normalizeAssignees(Array.isArray(body.assignees) ? body.assignees : [])
    const { error: delErr } = await db.from('project_task_assignees')
      .delete().eq('task_id', taskId)
    if (delErr) {
      console.error('[tasks] could not clear assignees:', delErr.message)
      return { status: 500, body: { error: 'Saved the task, but could not update who is on it. Reload and try again.' } }
    }
    if (wanted.length) {
      const { error: insErr } = await db.from('project_task_assignees')
        .insert(wanted.map(a => ({ task_id: taskId, ...a })))
      if (insErr) {
        console.error('[tasks] could not save assignees:', insErr.message)
        return { status: 500, body: { error: 'Saved the task, but could not update who is on it. Reload and try again.' } }
      }
    }
    assigneeNamesAfter = wanted.map(a => (a.name ?? '').trim() || 'Unnamed')
  }

  // Log to job history - `actorName` is read once, above.
  const taskTitle = (data as any)?.title ?? (prev as any)?.title ?? 'a task'

  const changes: string[] = []
  if (updates.status !== undefined && updates.status !== (prev as any)?.status) {
    changes.push(`status → ${prettyStatus(updates.status)}`)
  }
  if (updates.priority !== undefined && updates.priority !== (prev as any)?.priority) {
    changes.push(`priority → ${updates.priority}`)
  }
  if (updates.due_date !== undefined && updates.due_date !== (prev as any)?.due_date) {
    changes.push(updates.due_date ? `due date → ${updates.due_date}` : 'due date cleared')
  }
  if (updates.title !== undefined && updates.title !== (prev as any)?.title) {
    changes.push('renamed')
  }
  // COMPARED, like every other field here. It used to push on `!== undefined`
  // alone, so a form that posts the description whether or not it was touched
  // reported "description updated" on every save. Tolerable as a history line;
  // not once this list decides whether anybody's phone lights up.
  if (updates.description !== undefined && updates.description !== (prev as any)?.description) {
    changes.push('description updated')
  }
  if (assigneeNamesAfter !== null) {
    changes.push(assigneeNamesAfter.length
      ? `assigned to ${assigneeNamesAfter.join(', ')}`
      : 'unassigned')
  }
  if (updates.assigned_to_name !== undefined && updates.assigned_to_name !== (prev as any)?.assigned_to_name) {
    changes.push(updates.assigned_to_name ? `assigned to ${updates.assigned_to_name}` : 'unassigned')
  }

  if (changes.length > 0) {
    await logActivity(
      db, projectId, actorName, 'task_updated',
      `${actorName} updated "${taskTitle}": ${changes.join(', ')}`,
      { task_id: taskId }, user.id,
    )

    // TELL THE PEOPLE WHO ASKED TO BE TOLD.
    //
    // Gated on `changes.length` - the same condition the history line uses, so
    // a save that altered nothing is silent in both places. Everyone opts in
    // (the type defaults to off on both channels), and `notify` reads each
    // person's own preference, so this sends to nobody until somebody turns it
    // on.
    //
    // EXCLUDING THE ACTOR. Being told about a change you just made yourself is
    // the fastest way to teach somebody to ignore a notification - and on a
    // type that can fire on every edit, that habit spreads to the ones that
    // matter.
    //
    // Never fatal: the task is saved and answered whatever happens here.
    try {
      const { data: actorProfile } = await db
        .from('profiles').select('company_id').eq('id', user.id).maybeSingle()
      const companyId = (actorProfile as any)?.company_id
      if (companyId) {
        const audience = await audienceFor({
          db, companyId, type: 'task_updated', exclude: user.id,
        })
        if (audience.length) {
          await notify({
            db, userIds: audience, type: 'task_updated',
            title: `Task updated: ${taskTitle}`,
            message: `${actorName} updated "${taskTitle}": ${changes.join(', ')}`,
            link: `/projects/${projectId}/tasks`,
          })
        }
      }
    } catch (e: any) {
      // A route that computes a reason must not be the only place it exists.
      console.error('[tasks/PATCH] task_updated notify failed:', e?.message)
    }
  }

  return { status: 200, body: { task: data } }
}

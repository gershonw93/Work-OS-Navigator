import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { notify } from '@/lib/notify'
import { audienceFor } from '@/lib/notification-audience'
import { logActivity } from '@/lib/log-activity'
import { normalizeAssignees } from '@/lib/task-assignees'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function prettyStatus(s: string) {
  return s.replace(/_/g, ' ')
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  // Read ONCE, up here: both `completed_by_name` below and the history line
  // further down need it, and it used to be fetched only after the write.
  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()
  const actorName = (profile as any)?.full_name ?? (profile as any)?.email ?? user.email ?? 'Someone'

  const updates: Record<string, any> = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.title !== undefined) updates.title = body.title
  if (body.description !== undefined) updates.description = body.description
  if (body.due_date !== undefined) updates.due_date = body.due_date
  if (body.priority !== undefined) updates.priority = body.priority
  if (body.image_url !== undefined) updates.image_url = body.image_url
  if (body.follow_up_date !== undefined) updates.follow_up_date = body.follow_up_date
  if (body.follow_up_note !== undefined) updates.follow_up_note = body.follow_up_note

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
    .eq('id', params.taskId)
    .single()

  const { data, error } = await db
    .from('project_tasks')
    .update(updates)
    .eq('id', params.taskId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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
      .delete().eq('task_id', params.taskId)
    if (delErr) {
      console.error('[tasks] could not clear assignees:', delErr.message)
      return NextResponse.json(
        { error: 'Saved the task, but could not update who is on it. Reload and try again.' },
        { status: 500 },
      )
    }
    if (wanted.length) {
      const { error: insErr } = await db.from('project_task_assignees')
        .insert(wanted.map(a => ({ task_id: params.taskId, ...a })))
      if (insErr) {
        console.error('[tasks] could not save assignees:', insErr.message)
        return NextResponse.json(
          { error: 'Saved the task, but could not update who is on it. Reload and try again.' },
          { status: 500 },
        )
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
      db, params.id, actorName, 'task_updated',
      `${actorName} updated "${taskTitle}": ${changes.join(', ')}`,
      { task_id: params.taskId }, user.id,
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
            link: `/projects/${params.id}/tasks`,
          })
        }
      }
    } catch (e: any) {
      // A route that computes a reason must not be the only place it exists.
      console.error('[tasks/PATCH] task_updated notify failed:', e?.message)
    }
  }

  return NextResponse.json({ task: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: task } = await db.from('project_tasks').select('title').eq('id', params.taskId).single()

  const { error } = await db
    .from('project_tasks')
    .delete()
    .eq('id', params.taskId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()
  const actorName = (profile as any)?.full_name ?? (profile as any)?.email ?? user.email ?? 'Someone'
  await logActivity(
    db, params.id, actorName, 'task_deleted',
    `${actorName} deleted task "${(task as any)?.title ?? 'Untitled'}"`,
    { task_id: params.taskId }, user.id,
  )

  return NextResponse.json({ ok: true })
}

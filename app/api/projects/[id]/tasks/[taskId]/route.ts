import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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
  }

  // Capture the previous state so we can describe the change in history
  const { data: prev } = await db
    .from('project_tasks')
    .select('title, status, priority, due_date, assigned_to_name')
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

  // Log to job history
  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()
  const actorName = (profile as any)?.full_name ?? (profile as any)?.email ?? user.email ?? 'Someone'
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
  if (updates.description !== undefined) {
    changes.push('description updated')
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

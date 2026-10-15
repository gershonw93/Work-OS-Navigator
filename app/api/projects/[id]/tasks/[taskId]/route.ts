import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { updateTask } from '@/lib/writes/task'
import { jobGate } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  // THIS ASKED NOTHING but a sign-in: any account could rename, reassign or
  // complete any task on any job by its ids. Now on this job, and the task on
  // this job. `tasks: VIEW` plus the billing lock, NOT edit - and that is the
  // screens, not a slip: the Tasks tab lets everybody who can open a task
  // change its status (only New Task and Delete are gated), Office Staff and
  // an invited sub hold `tasks: view` alone, and a sub ticks off their own
  // task from My Jobs. Gating on edit would take all of that away.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'tasks', 'view', { write: true })
  if ('denied' in gate) return gate.denied
  const { data: onJob } = await db.from('project_tasks').select('id')
    .eq('id', params.taskId).eq('project_id', params.id).maybeSingle()
  if (!onJob) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  const { data: me } = await db.from('profiles').select('email').eq('id', gate.actor.userId).maybeSingle()
  const user = { id: gate.actor.userId, email: ((me as any)?.email ?? null) as string | null }

  const body = await request.json()

  // Everything after the body is `updateTask`, which Claude's MCP server calls too.
  const result = await updateTask(db, {
    userId: user.id, userEmail: user.email, projectId: params.id, taskId: params.taskId, body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const db = admin()
  // THIS ASKED NOTHING. Any signed-in account could delete any task on any job
  // by its id. Deleting is its own permission (`tasks: delete`), which the
  // field roles do not hold by default.
  //
  // AND ON THIS JOB: `tasks: delete` alone is held by every company's admin, so
  // the permission by itself let one company delete another's tasks by id.
  const gate = await jobGate(db, request, params.id, 'tasks', 'delete')
  if ('denied' in gate) return gate.denied
  const user = { id: gate.actor.userId, email: null as string | null }

  const { data: task } = await db.from('project_tasks').select('title').eq('id', params.taskId).eq('project_id', params.id).single()

  const { error } = await db
    .from('project_tasks')
    .delete()
    .eq('id', params.taskId)
    .eq('project_id', params.id)

  if (error) {
    console.error('[tasks DELETE]', error.message)
    return NextResponse.json({ error: 'Could not delete that task. Try again.' }, { status: 500 })
  }

  const { data: profile } = await db.from('profiles').select('full_name, email').eq('id', user.id).single()
  const actorName = (profile as any)?.full_name ?? (profile as any)?.email ?? user.email ?? 'Someone'
  await logActivity(
    db, params.id, actorName, 'task_deleted',
    `${actorName} deleted task "${(task as any)?.title ?? 'Untitled'}"`,
    { task_id: params.taskId }, user.id,
  )

  return NextResponse.json({ ok: true })
}

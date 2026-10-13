import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { updateTask } from '@/lib/writes/task'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

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
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // THIS ASKED NOTHING. Any signed-in account could delete any task on any job
  // by its id. Deleting is its own permission (`tasks: delete`), which the
  // field roles do not hold by default.
  const gate = await requirePermission(db, request, 'tasks', 'delete')
  if (denied(gate)) return gate.denied

  const { data: task } = await db.from('project_tasks').select('title').eq('id', params.taskId).single()

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

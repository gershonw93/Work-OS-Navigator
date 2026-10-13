import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { addTaskNote } from '@/lib/writes/task-note'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// A task's notes. Both handlers answered any login, for any task id.
//
// `tasks: VIEW` on both, deliberately - and the write still meets the billing
// lock by hand, because `requirePermission` only applies it to a write action.
// The note box is in the task drawer for everybody who can open a task:
// Office Staff and an invited sub hold `tasks: view` and nothing more, and
// gating the note on `edit` would take away a comment they use today. What
// was missing was not a narrower action but any check at all, plus that the
// task is on THIS job (the reads and the insert took the task id alone).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'tasks', 'view')
  if (denied(gate)) return gate.denied

  const { data: task } = await db.from('project_tasks').select('id').eq('id', params.taskId).eq('project_id', params.id).maybeSingle()
  if (!task) return NextResponse.json({ error: 'That task is not on this job.' }, { status: 404 })

  const { data, error } = await db
    .from('task_notes')
    .select('id, task_id, content, author_name, created_at')
    .eq('task_id', params.taskId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'tasks', 'view')
  if (denied(gate)) return gate.denied
  const locked = await billingLock(db, gate.actor.companyId)
  if (locked) return locked

  const { content } = await request.json()
  const result = await addTaskNote(db, { userId: gate.actor.userId, projectId: params.id, taskId: params.taskId, content })
  return NextResponse.json(result.body, { status: result.status })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding a note to a task - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/tasks/[taskId]/notes` unchanged, so a
// note Claude adds carries the same author line and the same job-history entry
// a note typed in the task drawer does - credited "Dana via Claude".
//
// ONE THING ADDED: THE TASK MUST BE ON THE JOB IN THE URL. The insert took
// `taskId` alone, so a request naming any job you could reach and a task id
// from another job wrote a note onto that one and logged it in the wrong
// history. Refused here, so the route and Claude both meet it.
// ─────────────────────────────────────────────────────────────────────────────

export async function addTaskNote(
  db: SupabaseClient,
  { userId, userEmail, projectId, taskId, content, via }: {
    userId: string; userEmail?: string | null; projectId: string; taskId: string; content: unknown; via?: string
  },
): Promise<WriteResult> {
  const text = typeof content === 'string' ? content.trim() : ''
  if (!text) return { status: 400, body: { error: 'Content required' } }

  const { data: task, error: taskError } = await db.from('project_tasks')
    .select('id, title').eq('id', taskId).eq('project_id', projectId).maybeSingle()
  if (taskError) return { status: 500, body: { error: taskError.message } }
  if (!task) return { status: 404, body: { error: 'That task is not on this job.' } }

  // Fetch author name from profiles
  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single()

  const name = profile?.full_name ?? profile?.email ?? userEmail ?? 'Unknown'
  const author_name = withVia(name, via)

  const { data, error } = await db
    .from('task_notes')
    .insert({ task_id: taskId, content: text, author_name })
    .select('id, task_id, content, author_name, created_at')
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  // Log to job history
  const taskTitle = (task as any)?.title ?? 'a task'
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text
  await logActivity(
    db, projectId, author_name, 'task_note',
    `${author_name} added a note on "${taskTitle}": ${preview}`,
    { task_id: taskId }, userId,
  )

  return { status: 200, body: { note: data } }
}

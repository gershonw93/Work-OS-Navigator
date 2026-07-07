import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Work signoff on a task.
// - JSON body { action: 'request' } → mark signoff requested + notify the assignee.
// - FormData (signature file + name) → sign: store the signature and stamp the task.
export async function POST(request: Request, { params }: { params: { id: string; taskId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const actor = (profile as any)?.full_name ?? 'Someone'

  const { data: task } = await db.from('project_tasks').select('*').eq('id', params.taskId).eq('project_id', params.id).single()
  if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

  const contentType = request.headers.get('content-type') ?? ''

  // ── Request a signoff ──────────────────────────────────────────────────────
  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({}))
    if (body.action !== 'request') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })

    const { data: updated, error } = await db.from('project_tasks')
      .update({ signoff_requested_at: new Date().toISOString(), signoff_requested_by: actor })
      .eq('id', params.taskId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Notify the assignee that their signoff is wanted.
    if (task.assigned_to_member_id) {
      const { data: member } = await db.from('project_team_members').select('profile_id, email').eq('id', task.assigned_to_member_id).maybeSingle()
      let uid: string | null = (member as any)?.profile_id ?? null
      if (!uid && (member as any)?.email) {
        const { data: p } = await db.from('profiles').select('id').eq('email', (member as any).email).maybeSingle()
        uid = p?.id ?? null
      }
      if (uid) await db.from('notifications').insert({ user_id: uid, type: 'signoff_requested', message: `${actor} requested your signoff on: "${task.title}"`, read: false })
    }

    await logActivity(db, params.id, actor, 'task_updated', `Signoff requested on "${task.title}"`, { task_id: task.id })
    return NextResponse.json({ task: updated })
  }

  // ── Sign it ────────────────────────────────────────────────────────────────
  const form = await request.formData()
  const file = form.get('signature') as File | null
  const name = ((form.get('name') as string) || actor).trim()
  if (!file || file.size === 0) return NextResponse.json({ error: 'Signature required' }, { status: 400 })

  const path = `signoffs/${params.id}/task-${params.taskId}-${Date.now()}.png`
  const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type || 'image/png', upsert: true })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

  const { data: updated, error } = await db.from('project_tasks')
    .update({ signoff_signed_at: new Date().toISOString(), signoff_signed_by: name, signoff_signature_url: signed?.signedUrl ?? null })
    .eq('id', params.taskId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, params.id, name, 'task_updated', `Signed off: "${task.title}"`, { task_id: task.id })
  return NextResponse.json({ task: updated })
}

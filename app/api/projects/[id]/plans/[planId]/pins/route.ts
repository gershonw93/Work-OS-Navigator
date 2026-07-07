import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

// Pins for one plan sheet, with their task's title/assignee/status.
export async function GET(request: Request, { params }: { params: { id: string; planId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data, error } = await db
    .from('plan_pins')
    .select('*, project_tasks(id, title, status, priority, due_date, assigned_to_name)')
    .eq('plan_id', params.planId)
    .eq('project_id', params.id)
    .order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pins: data ?? [] })
}

// Drop a pin: creates the task (via the same shape the Tasks tab uses) and the pin.
export async function POST(request: Request, { params }: { params: { id: string; planId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const body = await request.json()
  const { x_pct, y_pct, page, title, description, assigned_to_name, assigned_to_member_id, due_date, priority } = body
  if (x_pct == null || y_pct == null) return NextResponse.json({ error: 'Pin position required' }, { status: 400 })
  if (!title) return NextResponse.json({ error: 'Task title required' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data: task, error: tErr } = await db.from('project_tasks').insert({
    project_id: params.id,
    title,
    description: description || null,
    due_date: due_date || null,
    priority: priority || 'medium',
    status: 'open',
    assigned_to_member_id: assigned_to_member_id || null,
    assigned_to_name: assigned_to_name || null,
    created_by: (profile as any)?.full_name ?? 'Unknown',
  }).select().single()
  if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 })

  const { data: pin, error: pErr } = await db.from('plan_pins').insert({
    project_id: params.id,
    plan_id: params.planId,
    task_id: task.id,
    page: Number(page) || 1,
    x_pct: Number(x_pct),
    y_pct: Number(y_pct),
    created_by: user.id,
  }).select('*, project_tasks(id, title, status, priority, due_date, assigned_to_name)').single()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  // Notify the assignee (same pattern as the Tasks tab).
  if (assigned_to_member_id) {
    const { data: member } = await db.from('project_team_members').select('profile_id, email').eq('id', assigned_to_member_id).maybeSingle()
    let uid: string | null = (member as any)?.profile_id ?? null
    if (!uid && (member as any)?.email) {
      const { data: p } = await db.from('profiles').select('id').eq('email', (member as any).email).maybeSingle()
      uid = p?.id ?? null
    }
    if (uid) await db.from('notifications').insert({ user_id: uid, type: 'task_assigned', message: `You have been assigned a task from the plan: "${title}"`, read: false })
  }

  await logActivity(db, params.id, (profile as any)?.full_name ?? 'Someone', 'task_created',
    `Pinned a task on the plan: ${title}`, { task_id: task.id, plan_id: params.planId })

  return NextResponse.json({ pin })
}

export async function DELETE(request: Request, { params }: { params: { id: string; planId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pinId = new URL(request.url).searchParams.get('pinId')
  if (!pinId) return NextResponse.json({ error: 'pinId required' }, { status: 400 })
  const db = admin()
  // Remove pin only — keep the task (it may have progress/notes on it).
  const { error } = await db.from('plan_pins').delete().eq('id', pinId).eq('plan_id', params.planId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

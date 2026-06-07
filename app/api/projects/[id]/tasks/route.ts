import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: tasks }, { data: members }, { data: subcontracts }] = await Promise.all([
    db.from('project_tasks')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db.from('project_team_members')
      .select('id, name, role')
      .eq('project_id', params.id)
      .order('name'),
    db.from('subcontracts')
      .select('id, scope, trade, companies(id, name)')
      .eq('project_id', params.id)
      .order('created_at'),
  ])

  return NextResponse.json({ tasks: tasks ?? [], members: members ?? [], subcontracts: subcontracts ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, description, due_date, priority, assigned_to_member_id, assigned_to_company_id, assigned_to_name } = await request.json()
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('project_tasks')
    .insert({
      project_id: params.id,
      title,
      description: description || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      status: 'open',
      assigned_to_member_id: assigned_to_member_id || null,
      assigned_to_company_id: assigned_to_company_id || null,
      assigned_to_name: assigned_to_name || null,
      created_by: (profile as any)?.full_name ?? 'Unknown',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Notify sub if assigned to a company
  if (assigned_to_company_id) {
    const { data: subProfile } = await db.from('profiles').select('id').eq('company_id', assigned_to_company_id).single()
    if (subProfile) {
      await db.from('notifications').insert({
        user_id: subProfile.id,
        type: 'task_assigned',
        message: `You have been assigned a task: "${title}"`,
        read: false,
      })
    }
  }

  return NextResponse.json({ task: data })
}

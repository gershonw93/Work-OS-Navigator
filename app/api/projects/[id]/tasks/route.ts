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

  const { data: profile } = await db.from('profiles').select('role, full_name').eq('id', user.id).single()

  const [{ data: members }, { data: subcontracts }] = await Promise.all([
    db.from('project_team_members').select('id, name, role').eq('project_id', params.id).order('name'),
    db.from('subcontracts').select('id, scope, trade, companies(id, name)').eq('project_id', params.id).order('created_at'),
  ])

  const restrictedRoles = ['field_supervisor', 'worker', 'read_only', 'member']
  let tasks: any[] = []

  if (profile?.role && restrictedRoles.includes(profile.role)) {
    const { data: profileFull } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()

    // Find team member record: try profile_id, then email, then name
    let memberRecord: { id: string } | null = null

    const { data: byProfileId } = await db
      .from('project_team_members').select('id').eq('project_id', params.id).eq('profile_id', user.id).maybeSingle()
    memberRecord = byProfileId ?? null

    if (!memberRecord && profileFull?.email) {
      const { data: byEmail } = await db
        .from('project_team_members').select('id').eq('project_id', params.id).eq('email', profileFull.email).maybeSingle()
      memberRecord = byEmail ?? null
    }

    if (!memberRecord && profileFull?.full_name) {
      const { data: byName } = await db
        .from('project_team_members').select('id').eq('project_id', params.id).eq('name', profileFull.full_name).maybeSingle()
      memberRecord = byName ?? null
    }

    if (memberRecord) {
      const { data: rawTasks } = await db
        .from('project_tasks').select('*').eq('project_id', params.id).eq('assigned_to_member_id', memberRecord.id).order('created_at', { ascending: false })
      tasks = rawTasks ?? []
    } else if (profileFull?.full_name) {
      // Last resort: match by assigned_to_name
      const { data: rawTasks } = await db
        .from('project_tasks').select('*').eq('project_id', params.id).eq('assigned_to_name', profileFull.full_name).order('created_at', { ascending: false })
      tasks = rawTasks ?? []
    }
  } else {
    const { data: allTasks } = await db.from('project_tasks').select('*').eq('project_id', params.id).order('created_at', { ascending: false })
    tasks = allTasks ?? []
  }

  return NextResponse.json({ tasks, members: members ?? [], subcontracts: subcontracts ?? [] })
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

  // Notify assigned team member if they have a profile
  if (assigned_to_member_id) {
    const { data: member } = await db.from('project_team_members').select('email, profile_id').eq('id', assigned_to_member_id).maybeSingle()
    let notifyUserId: string | null = (member as any)?.profile_id ?? null
    if (!notifyUserId && (member as any)?.email) {
      const { data: p } = await db.from('profiles').select('id').eq('email', (member as any).email).maybeSingle()
      notifyUserId = p?.id ?? null
    }
    if (notifyUserId) {
      await db.from('notifications').insert({
        user_id: notifyUserId,
        type: 'task_assigned',
        message: `You have been assigned a task: "${title}"`,
        read: false,
      })
    }
  }

  // Also notify sub company if assigned to a company
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

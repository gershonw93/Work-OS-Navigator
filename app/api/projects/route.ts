import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

const RESTRICTED_ROLES = ['field_supervisor', 'worker', 'read_only', 'member']

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ projects: [] })

  // Restricted roles only see projects they are explicitly assigned to
  if (profile.role && RESTRICTED_ROLES.includes(profile.role)) {
    const { data: assignments } = await db
      .from('project_team_members')
      .select('project_id')
      .eq('profile_id', user.id)

    const projectIds = (assignments ?? []).map((a: any) => a.project_id).filter(Boolean)
    if (projectIds.length === 0) return NextResponse.json({ projects: [] })

    const { data } = await db
      .from('projects')
      .select('id, name, status, start_date, type')
      .in('id', projectIds)
      .order('created_at', { ascending: false })

    return NextResponse.json({ projects: data ?? [] })
  }

  // Admin / project_manager / office_staff — all company projects
  const { data } = await db
    .from('projects')
    .select('id, name, status, start_date, type')
    .eq('gc_company_id', profile.company_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({ projects: data ?? [] })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify token and get user
  const { data: { user }, error: userError } = await admin.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get company_id from profile
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found. Please contact support.' }, { status: 400 })
  }

  const body = await request.json()
  const { name, address, client, type, start_date, end_date } = body

  const { data: project, error: insertError } = await admin
    .from('projects')
    .insert({
      name,
      address,
      client,
      type,
      start_date,
      end_date: end_date || null,
      status: 'planning',
      gc_company_id: profile.company_id,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ project })
}

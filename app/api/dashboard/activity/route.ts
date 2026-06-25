import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('company_id, role, full_name, companies(type)')
    .eq('id', user.id)
    .single()

  const companyId = (profile as any)?.company_id
  const role = (profile as any)?.role
  const fullName = (profile as any)?.full_name ?? ''
  const companyType = (profile as any)?.companies?.type

  // GC company admin: sees all activity on their company's projects
  // Everyone else (non-admin role, or subcontractor company): sees only their own activity
  const isCompanyAdmin = role === 'admin' && companyType !== 'subcontractor'

  if (!companyId) return NextResponse.json({ activity: [], isAdmin: false })

  // Collect project IDs this company is involved in
  let projectIds: string[] = []
  if (companyType === 'subcontractor') {
    const { data: subs } = await db
      .from('subcontracts')
      .select('project_id')
      .eq('company_id', companyId)
    projectIds = (subs ?? []).map((s: any) => s.project_id).filter(Boolean)
  } else {
    const { data: projects } = await db
      .from('projects')
      .select('id')
      .eq('gc_company_id', companyId)
    projectIds = (projects ?? []).map((p: any) => p.id).filter(Boolean)
  }

  if (projectIds.length === 0) return NextResponse.json({ activity: [], isAdmin: isCompanyAdmin })

  let query = db
    .from('project_activity')
    .select('id, type, message, actor_name, created_at, project_id, projects(name)')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(30)

  // Non-admin users only see their own actions
  if (!isCompanyAdmin && fullName) {
    query = query.eq('actor_name', fullName)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ activity: data ?? [], isAdmin: isCompanyAdmin })
}

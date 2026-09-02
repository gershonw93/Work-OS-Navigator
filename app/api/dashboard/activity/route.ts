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
    .select('company_id, role, full_name, companies:company_id(type)')
    .eq('id', user.id)
    .single()

  const companyId = (profile as any)?.company_id
  const role = (profile as any)?.role
  const fullName = (profile as any)?.full_name ?? ''
  const companyType = (profile as any)?.companies?.type

  // Company admin (any type): sees all activity on their company's projects
  // Non-admin roles see only their own activity
  const isCompanyAdmin = role === 'admin'

  if (!companyId) return NextResponse.json({ activity: [], isAdmin: false })

  // Collect project IDs this company is involved in
  // Subs: awarded subcontracts + own projects (created_by_company_id / gc_company_id)
  // GCs: all company projects
  let projectIds: string[] = []
  if (companyType === 'subcontractor') {
    const [subsRes, ownRes] = await Promise.all([
      db.from('subcontracts').select('project_id').eq('company_id', companyId),
      db.from('projects').select('id').or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`),
    ])
    const subProjectIds = (subsRes.data ?? []).map((s: any) => s.project_id)
    const ownProjectIds = (ownRes.data ?? []).map((p: any) => p.id)
    projectIds = Array.from(new Set([...subProjectIds, ...ownProjectIds])).filter(Boolean)
  } else {
    const { data: projects } = await db
      .from('projects')
      .select('id')
      .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
    projectIds = (projects ?? []).map((p: any) => p.id).filter(Boolean)
  }

  if (projectIds.length === 0) return NextResponse.json({ activity: [], isAdmin: isCompanyAdmin })

  let query = db
    .from('project_activity')
    .select('id, type, message, actor_name, created_at, project_id, projects(name)')
    .in('project_id', projectIds)
    .order('created_at', { ascending: false })
    .limit(30)

  // Non-admin users only see their own actions.
  //
  // THE BUG: this used to read `if (!isCompanyAdmin && fullName)`, so a person
  // with no full_name on their profile fell straight past the filter and got
  // the WHOLE COMPANY's feed - including the budget_line_added entries, which
  // carry amounts. An empty name is not rare: somebody invited who never
  // finished their profile has one. A guard that only holds when an optional
  // field happens to be filled in is not a guard.
  //
  // Fails closed now: no identity to match means no rows, never all of them.
  // Matched on actor_id first because a display name is not an identity -
  // two people called Mike Ryan saw each other's activity, and renaming
  // yourself used to empty your own feed. actor_name stays in the OR for rows
  // written before logActivity started recording an id.
  if (!isCompanyAdmin) {
    const clauses = [`actor_id.eq.${user.id}`]
    // Quoted: a name with a comma in it would otherwise be read as the end of
    // this filter and the start of another.
    if (fullName) clauses.push(`actor_name.eq."${fullName.replace(/"/g, '\\"')}"`)
    query = query.or(clauses.join(','))
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ activity: data ?? [], isAdmin: isCompanyAdmin })
}

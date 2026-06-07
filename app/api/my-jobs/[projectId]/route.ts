import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const companyId = profile.company_id

  const [
    { data: project },
    { data: subcontract },
    { data: tasks },
    { data: rfis },
    { data: inspections },
    { data: invoices },
    { data: dailyLogs },
  ] = await Promise.all([
    db.from('projects').select('id, name, address, type, status, start_date, description').eq('id', params.projectId).single(),
    db.from('subcontracts').select('*, payment_schedule_items(*)').eq('project_id', params.projectId).eq('company_id', companyId).maybeSingle(),
    db.from('project_tasks').select('*').eq('project_id', params.projectId).eq('assigned_to_company_id', companyId).order('created_at', { ascending: false }),
    db.from('rfis').select('*').eq('project_id', params.projectId).eq('company_id', companyId).order('created_at', { ascending: false }),
    db.from('inspections').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false }),
    db.from('invoices').select('*').eq('project_id', params.projectId).eq('company_id', companyId).order('created_at', { ascending: false }),
    db.from('daily_logs').select('id, log_date, created_by_name, has_issues, weather_condition, created_at').eq('project_id', params.projectId).order('log_date', { ascending: false }).limit(5),
  ])

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Verify sub has access (either subcontract or own project)
  const isOwnProject = (project as any).created_by_company_id === companyId
  if (!subcontract && !isOwnProject) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  return NextResponse.json({
    project,
    subcontract: subcontract ?? null,
    tasks: tasks ?? [],
    rfis: rfis ?? [],
    inspections: inspections ?? [],
    invoices: invoices ?? [],
    recentLogs: dailyLogs ?? [],
  })
}

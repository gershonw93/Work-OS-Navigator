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

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  const companyId = (profile as any)?.company_id

  const { data: projectRows } = await db
    .from('projects')
    .select('id')
    .eq('gc_company_id', companyId)

  const projectIds = (projectRows ?? []).map((p: any) => p.id)

  if (projectIds.length === 0) {
    return NextResponse.json({
      activeProjects: 0,
      openRfis: 0,
      pendingApprovals: 0,
      openTasks: 0,
      expiringCompliance: 0,
      totalContractValue: 0,
    })
  }

  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  const [
    openRfisRes,
    pendingInvoicesRes,
    openTasksRes,
    expiringComplianceRes,
    activeProjectsRes,
    totalContractRes,
  ] = await Promise.all([
    db.from('rfis').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'open'),
    db.from('invoices').select('id', { count: 'exact', head: true }).in('project_id', projectIds).eq('status', 'pending_approval'),
    db.from('project_tasks').select('id', { count: 'exact', head: true }).in('project_id', projectIds).neq('status', 'completed'),
    companyId
      ? db.from('compliance_documents').select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .lt('expiry_date', thirtyDaysOut)
          .gt('expiry_date', today)
      : Promise.resolve({ count: 0 }),
    db.from('projects').select('id', { count: 'exact', head: true }).in('id', projectIds).eq('status', 'active'),
    db.from('subcontracts').select('contract_amount').in('project_id', projectIds).eq('status', 'active'),
  ])

  const totalContract = ((totalContractRes as any).data ?? []).reduce((sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0)

  return NextResponse.json({
    activeProjects: (activeProjectsRes as any).count ?? 0,
    openRfis: (openRfisRes as any).count ?? 0,
    pendingApprovals: (pendingInvoicesRes as any).count ?? 0,
    openTasks: (openTasksRes as any).count ?? 0,
    expiringCompliance: (expiringComplianceRes as any).count ?? 0,
    totalContractValue: totalContract,
  })
}

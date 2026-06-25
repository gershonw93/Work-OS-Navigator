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
    .select('company_id, companies(type)')
    .eq('id', user.id)
    .single()

  const companyId = (profile as any)?.company_id
  const companyType = (profile as any)?.companies?.type

  const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const today = new Date().toISOString().split('T')[0]

  // ── Sub-specific stats ────────────────────────────────────────────────────
  if (companyType === 'subcontractor' && companyId) {
    // Get active subcontracts (awarded + active project) for this sub
    const { data: activeSubRows } = await db
      .from('subcontracts')
      .select('id, contract_amount, project_id, projects!inner(status)')
      .eq('company_id', companyId)
      .eq('status', 'awarded')
      .eq('projects.status', 'active')

    const activeSubIds = (activeSubRows ?? []).map((s: any) => s.id)
    const activeJobProjectIds = Array.from(new Set((activeSubRows ?? []).map((s: any) => s.project_id)))

    const totalContractValue = (activeSubRows ?? []).reduce(
      (sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0
    )

    // Get all awarded subcontracts for total contract value (not just active projects)
    const { data: allAwardedSubs } = await db
      .from('subcontracts')
      .select('contract_amount')
      .eq('company_id', companyId)
      .eq('status', 'awarded')

    const allTotalContractValue = (allAwardedSubs ?? []).reduce(
      (sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0
    )

    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    const [
      pendingInvoicesRes,
      paidInvoicesRes,
      openRfisRes,
      expiringComplianceRes,
    ] = await Promise.all([
      db.from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'pending_approval'),
      db.from('invoices')
        .select('amount')
        .eq('company_id', companyId)
        .eq('status', 'paid')
        .gte('updated_at', monthStart),
      activeJobProjectIds.length > 0
        ? db.from('rfis')
            .select('id', { count: 'exact', head: true })
            .in('project_id', activeJobProjectIds)
            .eq('company_id', companyId)
            .eq('status', 'open')
        : Promise.resolve({ count: 0 }),
      db.from('compliance_documents')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .lt('expiry_date', thirtyDaysOut)
        .gt('expiry_date', today),
    ])

    const paidThisMonth = ((paidInvoicesRes as any).data ?? []).reduce(
      (sum: number, inv: any) => sum + Number(inv.amount ?? 0), 0
    )

    return NextResponse.json({
      isSub: true,
      activeJobs: activeJobProjectIds.length,
      pendingInvoices: (pendingInvoicesRes as any).count ?? 0,
      paidThisMonth,
      openRfis: (openRfisRes as any).count ?? 0,
      expiringCompliance: (expiringComplianceRes as any).count ?? 0,
      totalContractValue: allTotalContractValue,
    })
  }

  // ── GC stats (also covers sub companies running standalone projects) ─────────
  const { data: projectRows } = await db
    .from('projects')
    .select('id')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)

  const projectIds = (projectRows ?? []).map((p: any) => p.id)

  if (projectIds.length === 0) {
    return NextResponse.json({
      isSub: false,
      activeProjects: 0,
      openRfis: 0,
      pendingApprovals: 0,
      openTasks: 0,
      expiringCompliance: 0,
      totalContractValue: 0,
    })
  }

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
    db.from('projects').select('id', { count: 'exact', head: true }).in('id', projectIds).not('status', 'in', '("completed","cancelled")'),
    db.from('subcontracts').select('contract_amount').in('project_id', projectIds).in('status', ['active', 'awarded']),
  ])

  const totalContract = ((totalContractRes as any).data ?? []).reduce((sum: number, s: any) => sum + Number(s.contract_amount ?? 0), 0)

  return NextResponse.json({
    isSub: false,
    activeProjects: (activeProjectsRes as any).count ?? 0,
    openRfis: (openRfisRes as any).count ?? 0,
    pendingApprovals: (pendingInvoicesRes as any).count ?? 0,
    openTasks: (openTasksRes as any).count ?? 0,
    expiringCompliance: (expiringComplianceRes as any).count ?? 0,
    totalContractValue: totalContract,
  })
}

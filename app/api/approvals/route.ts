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
  const isSub = companyType === 'subcontractor'

  if (!companyId) return NextResponse.json({ items: [], isSub: false })

  if (isSub) {
    // Sub: show their own invoices + RFIs with status across all projects they're on
    const { data: subs } = await db.from('subcontracts').select('project_id, id').eq('company_id', companyId)
    const projectIds = (subs ?? []).map((s: any) => s.project_id).filter(Boolean)
    const subIds = (subs ?? []).map((s: any) => s.id).filter(Boolean)

    if (projectIds.length === 0) return NextResponse.json({ items: [], isSub: true })

    const [invoicesRes, rfisRes] = await Promise.all([
      subIds.length > 0
        ? db.from('invoices')
            .select('id, invoice_number, amount, status, description, due_date, created_at, project_id, projects(name)')
            .in('subcontract_id', subIds)
            .order('created_at', { ascending: false })
            .limit(30)
        : Promise.resolve({ data: [] }),
      db.from('rfis')
        .select('id, rfi_number, subject, status, response, created_at, project_id, is_change_order, change_order_status, change_order_amount, projects(name)')
        .in('project_id', projectIds)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(30),
    ])

    const items = [
      ...((invoicesRes as any).data ?? []).map((inv: any) => ({
        id: inv.id,
        type: 'invoice',
        project: inv.projects?.name,
        project_id: inv.project_id,
        label: inv.invoice_number,
        amount: inv.amount,
        status: inv.status,
        description: inv.description,
        date: inv.due_date ?? inv.created_at,
        created_at: inv.created_at,
        meta: null,
      })),
      ...((rfisRes as any).data ?? []).map((rfi: any) => ({
        id: rfi.id,
        type: 'rfi',
        project: rfi.projects?.name,
        project_id: rfi.project_id,
        label: `RFI-${String(rfi.rfi_number).padStart(3, '0')}`,
        amount: rfi.change_order_amount,
        status: rfi.status,
        description: rfi.subject,
        date: rfi.created_at,
        created_at: rfi.created_at,
        meta: {
          responded: !!rfi.response,
          is_change_order: rfi.is_change_order,
          change_order_status: rfi.change_order_status,
        },
      })),
    ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ items, isSub: true })
  }

  // GC: pending invoices + open RFIs across their projects
  const { data: projects } = await db.from('projects').select('id').eq('gc_company_id', companyId)
  const projectIds = (projects ?? []).map((p: any) => p.id).filter(Boolean)

  if (projectIds.length === 0) return NextResponse.json({ items: [], isSub: false })

  const [invoicesRes, rfisRes] = await Promise.all([
    db.from('invoices')
      .select('id, invoice_number, amount, status, description, due_date, created_at, project_id, projects(name), subcontracts(companies(name))')
      .in('project_id', projectIds)
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: false }),
    db.from('rfis')
      .select('id, rfi_number, subject, status, created_at, project_id, company_name, is_change_order, change_order_amount, projects(name)')
      .in('project_id', projectIds)
      .eq('status', 'open')
      .order('created_at', { ascending: false }),
  ])

  const items = [
    ...(invoicesRes.data ?? []).map((inv: any) => ({
      id: inv.id,
      type: 'invoice',
      project: inv.projects?.name,
      project_id: inv.project_id,
      label: inv.invoice_number,
      amount: inv.amount,
      status: inv.status,
      description: inv.description,
      submitted_by: (inv.subcontracts as any)?.companies?.name,
      date: inv.created_at,
      created_at: inv.created_at,
      meta: null,
    })),
    ...(rfisRes.data ?? []).map((rfi: any) => ({
      id: rfi.id,
      type: 'rfi',
      project: rfi.projects?.name,
      project_id: rfi.project_id,
      label: `RFI-${String(rfi.rfi_number).padStart(3, '0')}`,
      amount: rfi.change_order_amount,
      status: rfi.status,
      description: rfi.subject,
      submitted_by: rfi.company_name,
      date: rfi.created_at,
      created_at: rfi.created_at,
      meta: { is_change_order: rfi.is_change_order },
    })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ items, isSub: false })
}

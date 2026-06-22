import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { companyId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { companyId } = params

  // Company info
  const { data: company } = await db.from('companies').select('*').eq('id', companyId).single()

  // Projects they appear on as a sub
  const { data: subcontracts } = await db
    .from('subcontracts')
    .select('id, scope, trade, contract_amount, status, projects(id, name, status)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  // Compliance documents
  const { data: complianceDocs } = await db
    .from('compliance_documents')
    .select('*')
    .eq('company_id', companyId)
    .order('type')

  // Invoices
  const { data: invoices } = await db
    .from('invoices')
    .select('id, invoice_number, amount, status, due_date, issued_date, description, project_id, projects(name)')
    .eq('company_id', companyId)
    .order('issued_date', { ascending: false })
    .limit(20)

  // Payment schedule items across all their subcontracts
  const subIds = (subcontracts ?? []).map((s: any) => s.id)
  let payments: any[] = []
  if (subIds.length > 0) {
    const { data: psi } = await db
      .from('payment_schedule_items')
      .select('*, subcontracts(scope, projects(name))')
      .in('subcontract_id', subIds)
      .order('order_index')
    payments = psi ?? []
  }

  return NextResponse.json({
    company,
    subcontracts: subcontracts ?? [],
    complianceDocs: complianceDocs ?? [],
    invoices: invoices ?? [],
    payments,
  })
}

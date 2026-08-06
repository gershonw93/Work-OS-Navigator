import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The pre-flight shown before a job is set to Active.
 *
 * Active means "under contract" - won, not mobilised. That's the boundary the
 * rest of the app is built on: the markup locks because it becomes the billed
 * fee, and Invoices/Payments open up because you can now bill (a deposit
 * arrives long before anyone is on site). Whether crews have started is a
 * different question, answered by the start date.
 *
 * Every check is informational. Plenty of real jobs start before the permit
 * lands, so nothing here blocks the change - it just means nobody flips a job
 * live having forgotten the deposit.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = async (table: string, build?: (q: any) => any) => {
    try {
      let q = db.from(table).select('id', { count: 'exact', head: true }).eq('project_id', params.id)
      if (build) q = build(q)
      const { count: c } = await q
      return c ?? 0
    } catch { return 0 }
  }

  const [project, budgetLines, payments, permits, compliance, subcontracts] = await Promise.all([
    db.from('projects').select('start_date, contractor_fee_pct, billing_mode').eq('id', params.id).single(),
    count('budget_line_items'),
    db.from('client_payments').select('amount').eq('project_id', params.id),
    count('permits'),
    count('compliance_documents'),
    count('subcontracts'),
  ])

  const p: any = project.data ?? {}
  const paidTotal = (payments.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)

  const checks = [
    {
      key: 'budget',
      label: 'Budget has line items',
      ok: budgetLines > 0,
      detail: budgetLines > 0 ? `${budgetLines} line${budgetLines !== 1 ? 's' : ''}` : 'Nothing budgeted yet',
      href: 'budget',
    },
    {
      key: 'price',
      label: 'Price agreed with the client',
      ok: Number(p.contractor_fee_pct ?? 0) > 0 || p.billing_mode === 'aia',
      detail: Number(p.contractor_fee_pct ?? 0) > 0
        ? `${Math.round(Number(p.contractor_fee_pct) * 1000) / 10}% markup set`
        : p.billing_mode === 'aia' ? 'AIA job - billed by pay application' : 'No markup set on the budget',
      hint: 'The markup locks once this job is active, because from then on it is your billed fee.',
      href: 'budget',
    },
    {
      key: 'deposit',
      label: 'Deposit or first payment received',
      ok: paidTotal > 0,
      detail: paidTotal > 0
        ? `$${paidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} recorded`
        : 'Nothing recorded yet',
      href: 'payments',
    },
    {
      key: 'subs',
      label: 'Subcontractors lined up',
      ok: subcontracts > 0,
      detail: subcontracts > 0 ? `${subcontracts} subcontract${subcontracts !== 1 ? 's' : ''}` : 'None awarded yet',
      href: 'team',
    },
    {
      key: 'compliance',
      label: 'Insurance & compliance docs on file',
      ok: compliance > 0,
      detail: compliance > 0 ? `${compliance} document${compliance !== 1 ? 's' : ''}` : 'Nothing collected yet',
      href: 'compliance',
    },
    {
      key: 'permits',
      label: 'Permits filed',
      ok: permits > 0,
      detail: permits > 0 ? `${permits} permit${permits !== 1 ? 's' : ''}` : 'None recorded yet',
      href: 'permits',
    },
  ]

  return NextResponse.json({
    checks,
    start_date: p.start_date ?? null,
    ready: checks.filter(c => c.ok).length,
    total: checks.length,
  })
}

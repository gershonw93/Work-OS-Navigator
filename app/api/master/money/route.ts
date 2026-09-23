import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { committedTotal } from '@/lib/committed'
import { masterMoneyRows } from '@/lib/master-money'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)


// Cross-project money rollup for the boss. Admin/manager only.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ rows: [] })
  if (!['admin', 'manager'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { data: projects } = await db
    .from('projects')
    .select('id, name, status, contractor_fee_pct')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    .order('created_at', { ascending: false })

  const ids = (projects ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ rows: [] })

  // One query per table across ALL the company's projects - never one per job.
  // The allocations (how a bill is split across budget lines) and each line's
  // own rate are what the per-bill fee needs; without them this route could
  // only multiply, which is how it disagreed with the job's own tab.
  const [budgetRes, subsRes, invoiceRes, paymentRes, allocRes] = await Promise.all([
    db.from('budget_line_items').select('id, project_id, budgeted_amount, subcontract_id, committed_amount, markup_pct, markup_excluded').in('project_id', ids),
    db.from('subcontracts').select('id, project_id, contract_amount').in('project_id', ids),
    db.from('invoices').select('id, project_id, amount, status, client_paid, escrow_paid, markup_pct, markup_excluded').in('project_id', ids),
    db.from('client_payments').select('project_id, amount').in('project_id', ids),
    db.from('invoice_allocations')
      .select('invoice_id, budget_line_item_id, amount, invoices!inner(project_id)')
      .in('invoices.project_id', ids),
  ])
  // A refused query is not an empty one. Printing zeros for a job whose bills
  // could not be read would be a confident, wrong escrow on the owner's screen.
  const failed = [budgetRes, subsRes, invoiceRes, paymentRes, allocRes].find(r => r.error)
  if (failed?.error) {
    console.error('[master money]', failed.error)
    return NextResponse.json({ error: 'Could not load the money for every job. Try again.' }, { status: 500 })
  }
  const budgetLines = budgetRes.data ?? []
  const subs = subsRes.data ?? []

  // ONE derivation, shared with the Budget tab and the project Summary. This
  // used to be the subcontract total alone, which lost every commitment that
  // never became a contract - a materials order, an equipment hire - and so
  // disagreed with the Budget screen by a quarter of a million on one job.
  const committedFor = (id: string) => committedTotal({
    subcontracts: subs.filter((s: any) => s.project_id === id),
    lines: budgetLines.filter((l: any) => l.project_id === id),
  }).total

  // Escrow, billed, paid and outstanding: the SAME derivation the job's own
  // Billing the client tab calls (lib/escrow.ts, via masterMoneyRows).
  const rows = masterMoneyRows({
    projects: (projects ?? []) as any,
    budgetLines,
    subs,
    invoices: invoiceRes.data ?? [],
    clientPayments: paymentRes.data ?? [],
    allocations: allocRes.data ?? [],
    committedFor,
  })

  return NextResponse.json({ rows })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ACTUAL = new Set(['approved', 'sent', 'paid'])

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

  const [{ data: budgetLines }, { data: subs }, { data: invoices }, { data: clientPayments }] = await Promise.all([
    db.from('budget_line_items').select('project_id, budgeted_amount').in('project_id', ids),
    db.from('subcontracts').select('project_id, contract_amount').in('project_id', ids),
    db.from('invoices').select('project_id, amount, status').in('project_id', ids),
    db.from('client_payments').select('project_id, amount').in('project_id', ids),
  ])

  const sumBy = (rows: any[] | null, key: string, val: (r: any) => number) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(r[key], (m.get(r[key]) ?? 0) + val(r))
    return m
  }
  const budgeted = sumBy(budgetLines, 'project_id', r => Number(r.budgeted_amount ?? 0))
  const committed = sumBy(subs, 'project_id', r => Number(r.contract_amount ?? 0))
  const billed = sumBy((invoices ?? []).filter(i => ACTUAL.has(i.status)), 'project_id', r => Number(r.amount ?? 0))
  const paid = sumBy((invoices ?? []).filter(i => i.status === 'paid'), 'project_id', r => Number(r.amount ?? 0))
  const received = sumBy(clientPayments, 'project_id', r => Number(r.amount ?? 0))

  const rows = (projects ?? []).map(p => {
    const b = budgeted.get(p.id) ?? 0, c = committed.get(p.id) ?? 0, bi = billed.get(p.id) ?? 0, pd = paid.get(p.id) ?? 0
    const rec = received.get(p.id) ?? 0
    const fee = bi * Number(p.contractor_fee_pct ?? 0)
    return {
      project_id: p.id, project_name: p.name, status: p.status,
      budgeted: b, committed: c, billed: bi, paid: pd, outstanding: Math.max(bi - pd, 0),
      received: rec, escrow: rec - pd - fee,
    }
  })

  return NextResponse.json({ rows })
}

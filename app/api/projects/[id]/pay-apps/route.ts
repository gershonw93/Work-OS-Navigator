import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

// GET — list this project's pay applications (both directions) plus the context
// needed to start a new one (contract sum, subcontract options).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const [{ data: apps, error }, { data: subs }, { data: budget }] = await Promise.all([
    db.from('pay_applications')
      .select('*, pay_application_lines(scheduled_value, previous_completed, this_period, materials_stored), subcontracts(trade, companies(name))')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db.from('subcontracts').select('id, trade, contract_amount, companies(name)').eq('project_id', params.id).order('created_at'),
    db.from('budget_line_items').select('budgeted_amount').eq('project_id', params.id),
  ])
  if (error && (error as any).code === '42P01') {
    return NextResponse.json({ error: 'Run the latest migration to enable pay applications.' }, { status: 400 })
  }

  const contractSum = (budget ?? []).reduce((s: number, b: any) => s + Number(b.budgeted_amount || 0), 0)
  const applications = (apps ?? []).map((a: any) => {
    const lines = a.pay_application_lines ?? []
    const completed = lines.reduce((s: number, l: any) => s + Number(l.previous_completed || 0) + Number(l.this_period || 0) + Number(l.materials_stored || 0), 0)
    const thisPeriod = lines.reduce((s: number, l: any) => s + Number(l.this_period || 0) + Number(l.materials_stored || 0), 0)
    const retainage = completed * (Number(a.retainage_pct || 0) / 100)
    return {
      id: a.id, subcontract_id: a.subcontract_id, application_number: a.application_number,
      period_start: a.period_start, period_end: a.period_end, status: a.status, retainage_pct: a.retainage_pct,
      bill_to: a.subcontract_id ? ((a.subcontracts as any)?.companies?.name ?? (a.subcontracts as any)?.trade ?? 'Subcontract') : 'Owner / Bank',
      direction: a.subcontract_id ? 'sub_to_gc' : 'gc_to_owner',
      completed_to_date: completed, this_period: thisPeriod, current_due: completed - retainage, // less retainage; previous certs handled in detail
    }
  })

  const subOptions = (subs ?? []).map((s: any) => ({ id: s.id, label: `${s.companies?.name ?? s.trade}${s.trade ? ` · ${s.trade}` : ''}`, contract_amount: Number(s.contract_amount || 0) }))
  return NextResponse.json({ applications, contractSum, subOptions })
}

// POST — start a new pay application. Seeds its lines from the Schedule of
// Values and carries "previous completed" forward from earlier applications.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const body = await request.json().catch(() => ({}))
  const subcontractId: string | null = body.subcontract_id || null
  const retainagePct = body.retainage_pct != null ? Number(body.retainage_pct) : 10

  // Schedule of Values: for a GC->Owner app it's the whole budget; for a
  // Sub->GC app it's the budget lines linked to that subcontract (fallback to
  // one line for the contract amount).
  let sov: { id: string | null; cost_code: string | null; description: string; scheduled_value: number }[] = []
  if (subcontractId) {
    const { data: lines } = await db.from('budget_line_items').select('id, cost_code, description, budgeted_amount').eq('project_id', params.id).eq('subcontract_id', subcontractId).order('sort_order')
    if (lines && lines.length) {
      sov = lines.map((l: any) => ({ id: l.id, cost_code: l.cost_code, description: l.description, scheduled_value: Number(l.budgeted_amount || 0) }))
    } else {
      const { data: sc } = await db.from('subcontracts').select('scope, trade, contract_amount').eq('id', subcontractId).single()
      sov = [{ id: null, cost_code: null, description: (sc as any)?.scope || (sc as any)?.trade || 'Contract', scheduled_value: Number((sc as any)?.contract_amount || 0) }]
    }
  } else {
    const { data: lines } = await db.from('budget_line_items').select('id, cost_code, description, budgeted_amount').eq('project_id', params.id).order('sort_order')
    sov = (lines ?? []).map((l: any) => ({ id: l.id, cost_code: l.cost_code, description: l.description, scheduled_value: Number(l.budgeted_amount || 0) }))
  }
  if (sov.length === 0) return NextResponse.json({ error: 'Build the budget / schedule of values first.' }, { status: 400 })

  // Carry "previous completed" forward: sum prior applications' billed amounts
  // per schedule-of-values line, for the same direction.
  const priorQ = db.from('pay_applications').select('id, application_number, pay_application_lines(budget_line_item_id, this_period, materials_stored)').eq('project_id', params.id)
  const { data: prior } = subcontractId ? await priorQ.eq('subcontract_id', subcontractId) : await priorQ.is('subcontract_id', null)
  const previousByLine = new Map<string, number>()
  for (const a of prior ?? []) {
    for (const l of (a as any).pay_application_lines ?? []) {
      if (!l.budget_line_item_id) continue
      previousByLine.set(l.budget_line_item_id, (previousByLine.get(l.budget_line_item_id) ?? 0) + Number(l.this_period || 0) + Number(l.materials_stored || 0))
    }
  }
  const nextNumber = (prior ?? []).reduce((m: number, a: any) => Math.max(m, a.application_number || 0), 0) + 1

  const { data: app, error } = await db.from('pay_applications').insert({
    project_id: params.id, subcontract_id: subcontractId, application_number: nextNumber,
    period_start: body.period_start || null, period_end: body.period_end || null,
    retainage_pct: retainagePct, status: 'draft', created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const lineRows = sov.map((s, i) => ({
    pay_application_id: app.id, budget_line_item_id: s.id, cost_code: s.cost_code, description: s.description,
    scheduled_value: s.scheduled_value, previous_completed: s.id ? (previousByLine.get(s.id) ?? 0) : 0,
    this_period: 0, materials_stored: 0, sort_order: i,
  }))
  await db.from('pay_application_lines').insert(lineRows)

  return NextResponse.json({ id: app.id })
}

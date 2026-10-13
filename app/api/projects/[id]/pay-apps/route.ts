import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { createPayApp } from '@/lib/writes/pay-app'

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

// GET - list this project's pay applications (both directions) plus the context
// needed to start a new one (contract sum, subcontract options).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'pay-apps', 'view')
  if (denied(viewGate)) return viewGate.denied

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

// POST - start a new pay application. Seeds its lines from the Schedule of
// Values and carries "previous completed" forward from earlier applications.
// The body of it lives in `lib/writes/pay-app.ts`, shared with Claude.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'pay-apps', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const result = await createPayApp(admin(), { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

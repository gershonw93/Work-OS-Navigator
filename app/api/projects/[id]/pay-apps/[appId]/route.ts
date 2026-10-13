import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { sovDrift } from '@/lib/pay-app-rules'
import { updatePayApp } from '@/lib/writes/pay-app'
import { ownerScheduleOfValues, subcontractScheduleOfValues } from '@/lib/pay-app-sov'

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

// The G702 summary derived from the G703 lines.
function summarize(app: any, lines: any[]) {
  const scheduled = lines.reduce((s, l) => s + Number(l.scheduled_value || 0), 0)
  const previous = lines.reduce((s, l) => s + Number(l.previous_completed || 0), 0)
  const thisPeriod = lines.reduce((s, l) => s + Number(l.this_period || 0), 0)
  const stored = lines.reduce((s, l) => s + Number(l.materials_stored || 0), 0)
  const completedToDate = previous + thisPeriod + stored
  const retainagePct = Number(app.retainage_pct || 0) / 100
  const retainage = completedToDate * retainagePct
  const earnedLessRetainage = completedToDate - retainage
  const lessPrevious = previous - previous * retainagePct // prior certificates already paid, net of their retainage
  const currentDue = earnedLessRetainage - lessPrevious
  const balanceToFinish = scheduled - completedToDate + retainage
  return {
    scheduled, previous, this_period: thisPeriod, stored, completed_to_date: completedToDate,
    retainage_pct: app.retainage_pct, retainage, earned_less_retainage: earnedLessRetainage,
    less_previous: lessPrevious, current_due: currentDue, balance_to_finish: balanceToFinish,
  }
}

export async function GET(request: Request, { params }: { params: { id: string; appId: string } }) {
  // #358 guarded the collection routes and missed the detail ones, so this
  // still answered anybody with a login - the same hole reported on the Budget
  // tab, one level down.
  const viewGate = await requirePermission(admin(), request, 'pay-apps', 'view')
  if (denied(viewGate)) return viewGate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const { data: app, error } = await db.from('pay_applications')
    .select('*, subcontracts(trade, contract_amount, companies(name))')
    .eq('id', params.appId).eq('project_id', params.id).single()
  if (error || !app) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: lines } = await db.from('pay_application_lines').select('*').eq('pay_application_id', params.appId).order('sort_order')
  const { data: project } = await db.from('projects').select('name, address, client').eq('id', params.id).single()

  const rows = (lines ?? []).map((l: any) => {
    const completed = Number(l.previous_completed || 0) + Number(l.this_period || 0) + Number(l.materials_stored || 0)
    const sv = Number(l.scheduled_value || 0)
    return { ...l, completed_to_date: completed, pct: sv ? Math.round((completed / sv) * 1000) / 10 : 0, balance_to_finish: sv - completed }
  })

  // A DRAFT THAT PREDATES A CHANGE ORDER.
  //
  // The schedule is seeded when the application is created, so a draft started
  // before the $50,000 owner CO was approved keeps a contract sum of $300,000
  // however many times the CO is approved afterwards. Reported, correctly, as
  // the change-order bug still being open.
  //
  // Only a DRAFT, and only owner-facing: a certified or funded application is
  // the record of what a bank was told and does not get to change later, and a
  // subcontract's schedule comes from its contract rather than from the budget.
  let drift: { amount: number } | null = null
  if (app.status === 'draft') {
    try {
      const fresh = app.subcontract_id
        ? await subcontractScheduleOfValues(db, params.id, app.subcontract_id)
        : await ownerScheduleOfValues(db, params.id)
      // An empty schedule means there is nothing to compare against - a sub
      // billing a single contract-amount row - not that the draft is complete.
      const d = fresh.length ? sovDrift((lines ?? []) as any, fresh) : { amount: 0, raise: [], add: null }
      if (d.amount > 0) drift = { amount: d.amount }
    } catch {
      // A drift we could not work out is not a reason to fail the page. The
      // banner simply does not draw - the certificate itself is unaffected.
    }
  }

  return NextResponse.json({
    application: {
      id: app.id, subcontract_id: app.subcontract_id, application_number: app.application_number,
      period_start: app.period_start, period_end: app.period_end, status: app.status,
      retainage_pct: app.retainage_pct, notes: app.notes, certified_by: app.certified_by,
      submitted_at: app.submitted_at, certified_at: app.certified_at, funded_at: app.funded_at,
      direction: app.subcontract_id ? 'sub_to_gc' : 'gc_to_owner',
      bill_to: app.subcontract_id ? ((app.subcontracts as any)?.companies?.name ?? (app.subcontracts as any)?.trade ?? 'Subcontract') : 'Owner / Bank',
    },
    project,
    lines: rows,
    summary: summarize(app, lines ?? []),
    sov_drift: drift,
  })
}

// PATCH - update status, header fields, and/or edit line amounts. The body of
// it lives in `lib/writes/pay-app.ts`, shared with Claude.
export async function PATCH(request: Request, { params }: { params: { id: string; appId: string } }) {
  const gate = await requirePermission(admin(), request, 'pay-apps', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const result = await updatePayApp(admin(), { userId: user.id, projectId: params.id, appId: params.appId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string; appId: string } }) {
  const gate = await requirePermission(admin(), request, 'pay-apps', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { error } = await db.from('pay_applications').delete().eq('id', params.appId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import {
  retainagePct, checkLine, payAppProblems, isPayAppStatus, sovDrift,
  STATUSES_NEEDING_A_SOUND_APP, CHANGE_ORDER_SOV_DESCRIPTION, type PayAppStatus,
} from '@/lib/pay-app-rules'
import { ownerScheduleOfValues } from '@/lib/pay-app-sov'

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
  if (app.status === 'draft' && !app.subcontract_id) {
    try {
      const fresh = await ownerScheduleOfValues(db, params.id)
      const d = sovDrift((lines ?? []) as any, fresh)
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

// PATCH — update status, header fields, and/or edit line amounts.
export async function PATCH(request: Request, { params }: { params: { id: string; appId: string } }) {
  const gate = await requirePermission(admin(), request, 'pay-apps', 'edit')
  if (denied(gate)) return gate.denied

  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const body = await request.json().catch(() => ({}))

  // Bring an out-of-date draft's schedule up to today's budget + approved
  // change orders.
  //
  // NEVER AUTOMATIC. The amounts somebody has typed into this period sit
  // against these lines, and rewriting a schedule underneath a person mid-edit
  // is its own way to put a wrong number on a G702. Offered on the screen,
  // applied only when asked, and it only ever RAISES a scheduled value or adds
  // the change-order line - `this_period` and `materials_stored` are not
  // touched.
  if (body.action === 'resync_sov') {
    const { data: app } = await db.from('pay_applications')
      .select('id, status, subcontract_id').eq('id', params.appId).eq('project_id', params.id).maybeSingle()
    if (!app) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((app as any).status !== 'draft') {
      return NextResponse.json({ error: 'Only a draft can be brought up to date. A certified application is the record of what was sent.' }, { status: 400 })
    }
    if ((app as any).subcontract_id) {
      return NextResponse.json({ error: "A subcontractor's schedule comes from their contract, not from the budget." }, { status: 400 })
    }

    const { data: stored } = await db.from('pay_application_lines')
      .select('id, budget_line_item_id, description, scheduled_value, sort_order')
      .eq('pay_application_id', params.appId).order('sort_order')
    const fresh = await ownerScheduleOfValues(db, params.id)
    const d = sovDrift((stored ?? []) as any, fresh)

    for (const r of d.raise) {
      await db.from('pay_application_lines').update({ scheduled_value: r.to })
        .eq('id', r.id).eq('pay_application_id', params.appId)
    }
    if (d.add) {
      const nextSort = Math.max(0, ...(stored ?? []).map((l: any) => Number(l.sort_order) || 0)) + 1
      await db.from('pay_application_lines').insert({
        pay_application_id: params.appId,
        budget_line_item_id: null,
        cost_code: null,
        description: CHANGE_ORDER_SOV_DESCRIPTION,
        scheduled_value: d.add.scheduled_value,
        previous_completed: 0,
        this_period: 0,
        materials_stored: 0,
        sort_order: nextSort,
      })
    }
    return NextResponse.json({ ok: true, applied: d.amount })
  }

  // Line edits: [{ id, this_period?, materials_stored? }]
  //
  // Checked against the STORED line, not against what the browser sent: the
  // scheduled value and the previous certificates decide whether an amount is
  // billable, and taking those from the request would let a caller declare its
  // own limit. `Number(x) || 0` used to be the whole of this - it accepted a
  // line at 110% and -$1,000 against a $0 scheduled value.
  if (Array.isArray(body.lines) && body.lines.length) {
    const ids = body.lines.map((l: any) => l.id).filter(Boolean)
    const { data: stored } = await db
      .from('pay_application_lines')
      .select('id, description, scheduled_value, previous_completed, this_period, materials_stored')
      .eq('pay_application_id', params.appId)
      .in('id', ids)
    const byId = new Map((stored ?? []).map((l: any) => [l.id, l]))

    for (const l of body.lines) {
      const current = byId.get(l.id)
      if (!current) continue
      const updates: Record<string, any> = {}
      if (l.this_period !== undefined) updates.this_period = Number(l.this_period) || 0
      if (l.materials_stored !== undefined) updates.materials_stored = Number(l.materials_stored) || 0
      if (!Object.keys(updates).length) continue

      const check = checkLine({ ...current, ...updates })
      if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 })

      await db.from('pay_application_lines').update(updates).eq('id', l.id).eq('pay_application_id', params.appId)
    }
  }

  const header: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.retainage_pct !== undefined) {
    const pct = retainagePct(body.retainage_pct)
    if (!pct.ok) return NextResponse.json({ error: pct.error }, { status: 400 })
    header.retainage_pct = pct.value
  }
  if (body.period_start !== undefined) header.period_start = body.period_start || null
  if (body.period_end !== undefined) header.period_end = body.period_end || null
  if (body.notes !== undefined) header.notes = body.notes || null
  if (body.certified_by !== undefined) header.certified_by = body.certified_by || null
  if (body.status !== undefined) {
    // Any string used to write straight through.
    if (!isPayAppStatus(body.status)) {
      return NextResponse.json({ error: 'That is not a pay application status.' }, { status: 400 })
    }
    const next: PayAppStatus = body.status

    // A draft may hold an overbilled line - the change order that fixes it may
    // not be entered yet. A certificate may not: past this point it is an
    // owner's, an architect's or a bank's copy. Nothing checked before, which
    // is how a 105%-retainage G702 was submitted, certified AND funded.
    if (STATUSES_NEEDING_A_SOUND_APP.includes(next)) {
      const [{ data: current }, { data: lines }] = await Promise.all([
        db.from('pay_applications').select('retainage_pct').eq('id', params.appId).single(),
        db.from('pay_application_lines')
          .select('id, description, scheduled_value, previous_completed, this_period, materials_stored')
          .eq('pay_application_id', params.appId),
      ])
      const problems = payAppProblems(
        { retainage_pct: body.retainage_pct ?? (current as any)?.retainage_pct },
        lines ?? [],
      )
      if (problems.length) {
        return NextResponse.json({
          error: `This application cannot be ${next} yet: ${problems[0].message}`,
          problems,
        }, { status: 400 })
      }
    }

    header.status = next
    if (next === 'submitted') header.submitted_at = new Date().toISOString()
    if (next === 'certified') header.certified_at = new Date().toISOString()
    if (next === 'funded') header.funded_at = new Date().toISOString()
  }
  const { error } = await db.from('pay_applications').update(header).eq('id', params.appId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
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

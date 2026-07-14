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
  })
}

// PATCH — update status, header fields, and/or edit line amounts.
export async function PATCH(request: Request, { params }: { params: { id: string; appId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const body = await request.json().catch(() => ({}))

  // Line edits: [{ id, this_period?, materials_stored? }]
  if (Array.isArray(body.lines)) {
    for (const l of body.lines) {
      const updates: Record<string, any> = {}
      if (l.this_period !== undefined) updates.this_period = Number(l.this_period) || 0
      if (l.materials_stored !== undefined) updates.materials_stored = Number(l.materials_stored) || 0
      if (Object.keys(updates).length) await db.from('pay_application_lines').update(updates).eq('id', l.id).eq('pay_application_id', params.appId)
    }
  }

  const header: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.retainage_pct !== undefined) header.retainage_pct = Number(body.retainage_pct) || 0
  if (body.period_start !== undefined) header.period_start = body.period_start || null
  if (body.period_end !== undefined) header.period_end = body.period_end || null
  if (body.notes !== undefined) header.notes = body.notes || null
  if (body.certified_by !== undefined) header.certified_by = body.certified_by || null
  if (body.status !== undefined) {
    header.status = body.status
    if (body.status === 'submitted') header.submitted_at = new Date().toISOString()
    if (body.status === 'certified') header.certified_at = new Date().toISOString()
    if (body.status === 'funded') header.funded_at = new Date().toISOString()
  }
  const { error } = await db.from('pay_applications').update(header).eq('id', params.appId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: { id: string; appId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { error } = await db.from('pay_applications').delete().eq('id', params.appId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

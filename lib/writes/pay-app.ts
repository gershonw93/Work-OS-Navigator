import type { SupabaseClient } from '@supabase/supabase-js'
import {
  retainagePct, checkLine, payAppProblems, isPayAppStatus, sovDrift,
  STATUSES_NEEDING_A_SOUND_APP, CHANGE_ORDER_SOV_DESCRIPTION, type PayAppStatus,
} from '@/lib/pay-app-rules'
import { ownerScheduleOfValues, subcontractScheduleOfValues } from '@/lib/pay-app-sov'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Starting and editing a pay application - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/pay-apps` and
// `PATCH /api/projects/[id]/pay-apps/[appId]` unchanged, so the MCP server
// (Claude) writes through the same schedule-of-values seeding, the same
// retainage bounds, the same per-line billable check against the STORED line
// and the same "a certificate must be sound" rule the Pay Apps tab does. The
// routes keep the gate (`pay-apps: edit`, which carries the billing lock).
//
// Two things were added on the way, both narrowing:
//   - THE APPLICATION MUST BE ON THE JOB IN THE URL before anything is written.
//     The line edits were scoped to the application id alone, so a request
//     naming this job and another job's application edited that one's lines.
//   - A WRITE MADE VIA CLAUDE TOUCHES A DRAFT ONLY, AND NEVER ITS STATUS.
//     Submitting, certifying and funding are what an owner, an architect or a
//     bank is told - a person presses those. The app never passes `via`, so
//     its own behaviour is unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export async function createPayApp(
  db: SupabaseClient,
  // `via` is taken for the same shape as every other write here; a pay
  // application records its author by id (`created_by`), not by name.
  { userId, projectId, body }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const subcontractId: string | null = body.subcontract_id || null
  // Where the 105% got in. This took whatever was sent; the field on the form
  // had no bounds either, and the default "10" sitting in the box meant typing
  // "5" to change it appended rather than replaced.
  if (body.retainage_pct != null) {
    const checked = retainagePct(body.retainage_pct)
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
  }
  let retainage = body.retainage_pct != null ? Number(body.retainage_pct) : NaN
  if (isNaN(retainage)) {
    const { data: proj } = await db.from('projects').select('default_retainage_pct').eq('id', projectId).maybeSingle()
    retainage = Number((proj as any)?.default_retainage_pct ?? 10)
  }

  // Schedule of Values: for a GC->Owner app it's the whole budget; for a
  // Sub->GC app it's the budget lines linked to that subcontract (fallback to
  // one line for the contract amount).
  let sov: { id: string | null; cost_code: string | null; description: string; scheduled_value: number }[] = []
  if (subcontractId) {
    const { data: lines } = await db.from('budget_line_items').select('id, cost_code, description, budgeted_amount').eq('project_id', projectId).eq('subcontract_id', subcontractId).order('sort_order')
    if (lines && lines.length) {
      sov = lines.map((l: any) => ({ id: l.id, cost_code: l.cost_code, description: l.description, scheduled_value: Number(l.budgeted_amount || 0) }))
    } else {
      const { data: sc } = await db.from('subcontracts').select('scope, trade, contract_amount').eq('id', subcontractId).single()
      sov = [{ id: null, cost_code: null, description: (sc as any)?.scope || (sc as any)?.trade || 'Contract', scheduled_value: Number((sc as any)?.contract_amount || 0) }]
    }
  } else {
    // GC -> Owner. The schedule of values is the budget PLUS approved change
    // orders. It used to be `budgeted_amount` alone, so a $50,000 approved
    // owner change order never reached the certificate and the contract sum
    // stayed at the original figure - on a G702 whose line 1 reads "Original
    // contract sum + change orders".
    //
    // Shared with the drift check a draft runs against itself, so "what this
    // schedule should say" has one answer rather than two careful ones.
    sov = (await ownerScheduleOfValues(db, projectId)).map(l => ({
      id: l.budget_line_item_id,
      cost_code: l.cost_code,
      description: l.description,
      scheduled_value: l.scheduled_value,
    }))
  }
  if (sov.length === 0) return { status: 400, body: { error: 'Build the budget / schedule of values first.' } }

  // Carry "previous completed" forward: sum prior applications' billed amounts
  // per schedule-of-values line, for the same direction.
  const priorQ = db.from('pay_applications').select('id, application_number, pay_application_lines(budget_line_item_id, this_period, materials_stored)').eq('project_id', projectId)
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
    project_id: projectId, subcontract_id: subcontractId, application_number: nextNumber,
    period_start: body.period_start || null, period_end: body.period_end || null,
    retainage_pct: retainage, status: 'draft', created_by: userId,
  }).select().single()
  if (error) return { status: 500, body: { error: error.message } }

  const lineRows = sov.map((s, i) => ({
    pay_application_id: app.id, budget_line_item_id: s.id, cost_code: s.cost_code, description: s.description,
    scheduled_value: s.scheduled_value, previous_completed: s.id ? (previousByLine.get(s.id) ?? 0) : 0,
    this_period: 0, materials_stored: 0, sort_order: i,
  }))
  await db.from('pay_application_lines').insert(lineRows)

  // `id` is what the screen reads; `application` is the row, for a caller
  // (Claude) that has to say what it made.
  return { status: 200, body: { id: app.id, application: app } }
}

export async function updatePayApp(
  db: SupabaseClient,
  { projectId, appId, body, via }: { userId: string; projectId: string; appId: string; body: any; via?: string },
): Promise<WriteResult> {
  // On THIS job, or nothing is written - see the note at the top.
  const { data: found, error: findError } = await db.from('pay_applications')
    .select('id, status, subcontract_id').eq('id', appId).eq('project_id', projectId).maybeSingle()
  if (findError) return { status: 500, body: { error: findError.message } }
  if (!found) return { status: 404, body: { error: 'Not found' } }

  if (via) {
    if ((found as any).status !== 'draft') {
      return { status: 400, body: { error: 'Only a draft pay application can be changed through Claude. This one has gone to the owner, architect or bank - change it in SyteNav.' } }
    }
    if (body.status !== undefined || body.action !== undefined || body.certified_by !== undefined) {
      return { status: 400, body: { error: 'Submitting, certifying or funding a pay application is done by a person in SyteNav.' } }
    }
  }

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
    const app = found
    if ((app as any).status !== 'draft') {
      return { status: 400, body: { error: 'Only a draft can be brought up to date. A certified application is the record of what was sent.' } }
    }
    const { data: stored } = await db.from('pay_application_lines')
      .select('id, budget_line_item_id, description, scheduled_value, sort_order')
      .eq('pay_application_id', appId).order('sort_order')
    const subId = (app as any).subcontract_id
    const fresh = subId
      ? await subcontractScheduleOfValues(db, projectId, subId)
      : await ownerScheduleOfValues(db, projectId)
    if (!fresh.length) {
      return { status: 400, body: { error: 'There is nothing to bring in - this application bills against a contract amount rather than budget lines.' } }
    }
    const d = sovDrift((stored ?? []) as any, fresh)

    for (const r of d.raise) {
      await db.from('pay_application_lines').update({ scheduled_value: r.to })
        .eq('id', r.id).eq('pay_application_id', appId)
    }
    if (d.add) {
      const nextSort = Math.max(0, ...(stored ?? []).map((l: any) => Number(l.sort_order) || 0)) + 1
      await db.from('pay_application_lines').insert({
        pay_application_id: appId,
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
    return { status: 200, body: { ok: true, applied: d.amount } }
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
      .eq('pay_application_id', appId)
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
      if (!check.ok) return { status: 400, body: { error: check.error } }

      await db.from('pay_application_lines').update(updates).eq('id', l.id).eq('pay_application_id', appId)
    }
  }

  const header: Record<string, any> = { updated_at: new Date().toISOString() }
  if (body.retainage_pct !== undefined) {
    const pct = retainagePct(body.retainage_pct)
    if (!pct.ok) return { status: 400, body: { error: pct.error } }
    header.retainage_pct = pct.value
  }
  if (body.period_start !== undefined) header.period_start = body.period_start || null
  if (body.period_end !== undefined) header.period_end = body.period_end || null
  if (body.notes !== undefined) header.notes = body.notes || null
  if (body.certified_by !== undefined) header.certified_by = body.certified_by || null
  if (body.status !== undefined) {
    // Any string used to write straight through.
    if (!isPayAppStatus(body.status)) {
      return { status: 400, body: { error: 'That is not a pay application status.' } }
    }
    const next: PayAppStatus = body.status

    // A draft may hold an overbilled line - the change order that fixes it may
    // not be entered yet. A certificate may not: past this point it is an
    // owner's, an architect's or a bank's copy. Nothing checked before, which
    // is how a 105%-retainage G702 was submitted, certified AND funded.
    if (STATUSES_NEEDING_A_SOUND_APP.includes(next)) {
      const [{ data: current }, { data: lines }] = await Promise.all([
        db.from('pay_applications').select('retainage_pct').eq('id', appId).single(),
        db.from('pay_application_lines')
          .select('id, description, scheduled_value, previous_completed, this_period, materials_stored')
          .eq('pay_application_id', appId),
      ])
      const problems = payAppProblems(
        { retainage_pct: body.retainage_pct ?? (current as any)?.retainage_pct },
        lines ?? [],
      )
      if (problems.length) {
        return {
          status: 400,
          body: { error: `This application cannot be ${next} yet: ${problems[0].message}`, problems },
        }
      }
    }

    header.status = next
    if (next === 'submitted') header.submitted_at = new Date().toISOString()
    if (next === 'certified') header.certified_at = new Date().toISOString()
    if (next === 'funded') header.funded_at = new Date().toISOString()
  }
  const { error } = await db.from('pay_applications').update(header).eq('id', appId).eq('project_id', projectId)
  if (error) return { status: 500, body: { error: error.message } }

  return { status: 200, body: { ok: true } }
}

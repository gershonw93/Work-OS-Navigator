import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'
import { requirePermission, denied } from '@/lib/api-guard'
import { clearsCompletion, notifiesRoutedAudience, scheduleProblem } from '@/lib/inspection-status'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_FIELDS = [
  'type',
  'trade',
  'status',
  'scheduled_date',
  'completed_date',
  'inspector_name',
  'inspector_phone',
  'scheduling_phone',
  'scheduled_time',
  'scheduler_profile_id',
  'scheduler_name',
  'notes',
  'ready_marked_by',
  'ready_marked_at',
  'failure_reason',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()

  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // #2 - "Scheduled" with no date was a storable state, and it lied four
  // different ways at once: it fired an "is scheduled" notification to the
  // office, the card read "No date yet", and the overview's booked list never
  // showed it because that list needs a date. Refused HERE and not only in the
  // form, because a form is not where invalid states are prevented.
  if (updates.status === 'scheduled') {
    const { data: current } = await db
      .from('inspections').select('scheduled_date')
      .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
    const effective = 'scheduled_date' in updates
      ? (updates.scheduled_date as string | null)
      : (current as any)?.scheduled_date
    const problem = scheduleProblem('scheduled', effective)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  // #6 - a record cannot be pending AND completed. Moving back to a waiting
  // state clears the stamp, or the card reads "PENDING Re-inspection" beside
  // "Completed 9/5/2026" and tells two stories about the same day.
  if (clearsCompletion(updates.status)) updates.completed_date = null

  // #6 - a failure with no reason is the least useful record in the app, and
  // "what keeps failing" is a question a GC actually asks.
  if (updates.status === 'failed' && !String(updates.failure_reason ?? '').trim()) {
    const { data: current } = await db
      .from('inspections').select('failure_reason')
      .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
    if (!String((current as any)?.failure_reason ?? '').trim()) {
      return NextResponse.json({ error: 'Say why it failed - that is the part somebody needs later.' }, { status: 400 })
    }
  }

  // If status is being set to 'passed' or 'failed', ensure completed_date is set.
  //
  // The client sends its OWN day (`todayDateInput()`), because a calendar date
  // belongs to whoever is living it and the server has no idea what timezone
  // that is. `toISOString()` is UTC's day: right on the east coast, a day ahead
  // for anyone marking an inspection passed on a west-coast evening. Kept only
  // as a fallback so a direct API call still gets a date rather than none.
  const newStatus = updates.status as string | undefined
  if ((newStatus === 'passed' || newStatus === 'failed') && !updates.completed_date) {
    updates.completed_date = new Date().toISOString().split('T')[0]
  }

  // Who was on it BEFORE, so a genuine reassignment can be told apart from the
  // Edit form re-sending the same value with a changed note. Only read when the
  // field is actually in play, and only this one column.
  let priorScheduler: string | null = null
  if ('scheduler_profile_id' in updates) {
    const { data: before } = await db
      .from('inspections').select('scheduler_profile_id')
      .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
    priorScheduler = (before as any)?.scheduler_profile_id ?? null
  }

  const { data: inspection, error } = await db
    .from('inspections')
    .update(updates)
    .eq('id', params.inspectionId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'

  const label = inspection.type
    ? `${inspection.type}${inspection.trade ? ` (${inspection.trade})` : ''}`
    : 'Inspection'

  // #4 - Job History logged passed and failed and NOTHING ELSE, while the panel
  // promises "every action on this project". Creation and destruction of
  // compliance records is most of what an audit trail is for.
  const STATUS_HISTORY: Record<string, { type: string; say: string }> = {
    scheduled: { type: 'inspection_scheduled', say: 'scheduled' },
    passed: { type: 'inspection_passed', say: 'passed' },
    failed: { type: 'inspection_failed', say: 'failed' },
    pending_reinspection: { type: 'inspection_reinspection', say: 'sent back for re-inspection' },
    requested: { type: 'inspection_updated', say: 'moved back to requested' },
    not_scheduled: { type: 'inspection_updated', say: 'moved back to not scheduled' },
  }
  const hist = newStatus ? STATUS_HISTORY[newStatus] : undefined
  if (hist) {
    const when = newStatus === 'scheduled' && inspection.scheduled_date
      ? ` for ${inspection.scheduled_date}` : ''
    const why = newStatus === 'failed' && inspection.failure_reason
      ? `: ${inspection.failure_reason}` : ''
    await logActivity(
      db, params.id, actorName, hist.type,
      `${label} ${hist.say}${when}${why}`,
      {
        inspection_id: inspection.id, inspection_type: inspection.type,
        trade: inspection.trade, status: newStatus,
        ...(inspection.failure_reason ? { failure_reason: inspection.failure_reason } : {}),
      },
      user.id,
    )
  } else if (!('ready_marked_by' in updates)) {
    // An edit that changed no status is still an action on the project. The
    // "ready" path logs its own entry, so it is excluded rather than doubled.
    await logActivity(
      db, params.id, actorName, 'inspection_updated',
      `${label} updated`,
      { inspection_id: inspection.id, fields: Object.keys(updates) },
      user.id,
    )
  }

  // A sub marking work ready only writes ready_marked_by/at - it never touches
  // status, so it falls outside the status-change notifications below. Tell the
  // GC anyway, otherwise the hand goes up and nobody sees it.
  if ('ready_marked_by' in updates && updates.ready_marked_by) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const at = proj?.name ? ` at ${proj.name}` : ''

    await logActivity(
      db, params.id, actorName, 'inspection_ready',
      `${label} marked ready for inspection${inspection.trade ? '' : at}`,
      { inspection_id: inspection.id, inspection_type: inspection.type, trade: inspection.trade },
      user.id,
    )

    // STRUCTURAL first, then whoever the company said should hear it.
    //
    // Whoever asked for it and whoever books it are told because of their part
    // in this inspection, not because of their role - that is not a setting and
    // must not become one. Everyone else comes from Settings -> Notifications ->
    // Who gets told.
    //
    // This used to fall back to EVERY profile at the GC company. Ten office
    // staff, ten notifications, every time somebody marked work ready - which
    // is how people learn to ignore the bell.
    const recipients = withStructural(
      await audienceFor({
        db, companyId: proj?.gc_company_id, type: 'inspection_ready', exclude: user.id,
      }),
      [inspection.requested_by_id, inspection.scheduler_profile_id],
      user.id,
    )
    if (recipients.length) {
      await notify({
        db, userIds: recipients, type: 'inspection_ready',
        title: 'Ready for inspection',
        message: `${updates.ready_marked_by} marked ${label}${at} ready for inspection. Book the inspector when you can.`,
        link: `/projects/${params.id}/inspections?inspection=${params.inspectionId}`,
      })
    }
  }

  // Somebody was just put on the hook for booking this, and until now nothing
  // told them. `scheduler_profile_id` has always been editable here and no
  // notification fired on it, so assigning a scheduler through Edit - rather
  // than on the original request - was silent. The person found out by opening
  // the inspections list, if they ever did.
  const newScheduler = updates.scheduler_profile_id as string | null | undefined
  if (newScheduler && newScheduler !== priorScheduler) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const at = proj?.name ? ` at ${proj.name}` : ''
    const bookers = withStructural(
      await audienceFor({
        db, companyId: (proj as any)?.gc_company_id, type: 'inspection_to_schedule', exclude: user.id,
      }),
      [newScheduler],
      user.id,
    )
    if (bookers.length) {
      await notify({
        db, userIds: bookers, type: 'inspection_to_schedule',
        title: 'Inspection to book',
        message: `${actorName} put you on booking the ${label} inspection${at}.`,
        link: `/projects/${params.id}/inspections?inspection=${params.inspectionId}`,
      })
    }
  }

  // Follow-up notifications on status changes: keep the requester (and scheduler)
  // in the loop when the inspection is booked, passes, or fails.
  if (newStatus && ['scheduled', 'passed', 'failed', 'pending_reinspection'].includes(newStatus)) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const at = proj?.name ? ` at ${proj.name}` : ''
    let msg = ''
    if (newStatus === 'scheduled') msg = `Your ${label} inspection${at} is scheduled${inspection.scheduled_date ? ` for ${inspection.scheduled_date}${inspection.scheduled_time ? ` ${inspection.scheduled_time}` : ''}` : ''}.`
    else if (newStatus === 'passed') msg = `✅ ${label} inspection${at} PASSED.`
    else if (newStatus === 'failed') msg = `❌ ${label} inspection${at} FAILED.${inspection.failure_reason ? ` ${inspection.failure_reason}` : ''}`
    else if (newStatus === 'pending_reinspection') msg = `${label} inspection${at} needs a re-inspection.`

    // #9 - OUTCOMES reach everyone, LOGISTICS reach the job.
    //
    // Every status flip used to notify the whole routed audience: ten minutes of
    // testing sent eight notifications to the office. Passed, failed and
    // re-inspection are news the office acts on. "Scheduled" is a diary entry -
    // it matters to whoever asked and whoever is booking it, and to nobody else.
    //
    // A principle rather than a rate limit, deliberately. A threshold is a rule
    // people cannot predict, and a bell that sometimes fires is one people stop
    // opening. This way "why didn't I hear about that" has a one-sentence answer.
    const routed = notifiesRoutedAudience(newStatus)
      ? await audienceFor({
        db, companyId: (proj as any)?.gc_company_id, type: 'inspection_result', exclude: user.id,
      })
      : []
    const recipients = withStructural(
      routed,
      [inspection.requested_by_id, inspection.scheduler_profile_id],
      user.id, // don't notify the person who made the change
    )
    if (msg && recipients.length) {
      // The type used to be built from newStatus - `inspection_scheduled`,
      // `inspection_passed`, `inspection_failed` - three strings no preference
      // had ever heard of. One type now, with the outcome in the message where
      // a person reads it.
      await notify({
        db, userIds: recipients, type: 'inspection_result',
        title: 'Inspection update', message: msg,
        link: `/projects/${params.id}/inspections?inspection=${params.inspectionId}`,
      })
    }
  }

  return NextResponse.json({ inspection })
}

/**
 * Void an inspection. Nothing here is ever hard-deleted.
 *
 * WHAT THIS USED TO BE. A `.delete()` guarded by nothing but "are you signed
 * in" - no permission check, and no check that the project belonged to the
 * caller's company. A `worker` or `read_only`, neither of whom can so much as
 * VIEW inspections, could permanently destroy any inspection on any project in
 * any company. It logged nothing, and returned `{ success: true }` when it had
 * matched no rows at all.
 *
 * The tester reported "Office Staff can delete inspections". It was worse.
 *
 * Voiding rather than deleting is what this codebase already does with client
 * invoices, whose comment is the doctrine: "Not delete. A client already has
 * this document, so it stays in the list with its number, greyed out." A
 * compliance record deserves at least that - and it means the audit trail
 * records something that still exists, and a notification about it still
 * resolves to a record rather than to a gap.
 *
 * Gated on `edit`, not `delete`: no route in this repo uses the `delete`
 * action, and voiding is a reversible edit rather than destruction.
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = await db.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  // Read it first so the history entry can NAME what was voided - the trick the
  // budget-line delete already uses. "Inspection voided" tells nobody anything.
  const { data: before } = await db
    .from('inspections').select('type, trade, status')
    .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Not found on this project.' }, { status: 404 })
  if ((before as any).status === 'void') return NextResponse.json({ ok: true, alreadyVoid: true })

  const { data: inspection, error } = await db
    .from('inspections')
    .update({ status: 'void', voided_at: new Date().toISOString(), voided_by: user.id })
    .eq('id', params.inspectionId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const voidedLabel = (before as any).type
    ? `${(before as any).type}${(before as any).trade ? ` (${(before as any).trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'Someone', 'inspection_voided',
    `${voidedLabel} voided`,
    { inspection_id: params.inspectionId, was_status: (before as any).status },
    user.id,
  )

  return NextResponse.json({ ok: true, inspection })
}

/**
 * Put a voided inspection back.
 *
 * If nothing is ever deleted, a mis-void needs a way back - otherwise people
 * route around it by creating a duplicate, and the audit trail ends up holding
 * two records of one inspection with the wrong dates on one of them.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const { data: { user } } = await db.auth.getUser(token ?? '')
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  if (body?.action !== 'restore') {
    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  }

  const { data: before } = await db
    .from('inspections').select('type, trade, status, completed_date')
    .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
  if (!before) return NextResponse.json({ error: 'Not found on this project.' }, { status: 404 })
  if ((before as any).status !== 'void') return NextResponse.json({ ok: true, notVoid: true })

  // Back to where it can be worked on. A restored inspection with a completion
  // date is finished; one without is waiting to be booked.
  const restored = (before as any).completed_date ? 'passed' : 'not_scheduled'

  const { data: inspection, error } = await db
    .from('inspections')
    .update({ status: restored, voided_at: null, voided_by: null })
    .eq('id', params.inspectionId).eq('project_id', params.id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db
    .from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const restoredLabel = (before as any).type
    ? `${(before as any).type}${(before as any).trade ? ` (${(before as any).trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'Someone', 'inspection_restored',
    `${restoredLabel} restored`,
    { inspection_id: params.inspectionId, status: restored },
    user.id,
  )

  return NextResponse.json({ ok: true, inspection })
}

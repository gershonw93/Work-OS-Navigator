import type { SupabaseClient } from '@supabase/supabase-js'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'
import { logActivity } from '@/lib/log-activity'
import { BOOKING_DERIVED_COLUMNS, canCarryCompletion, clearsBooking, clearsCompletion, notifiesRoutedAudience, scheduleProblem, requestProblem } from '@/lib/inspection-status'
import { whoToCall, callLine } from '@/lib/inspection-contacts'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Requesting (or filing an already-booked) inspection - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/inspections` unchanged, so the MCP
// server files a request through the same guards the form and the field app
// meet: `scheduleProblem` (a booking carries who it was booked with),
// `requestProblem` (a blank request is refused) - both BEFORE anybody is
// notified - then the "Inspection to book" notice with the numbers to call.
// The route keeps reading its form and the card photo; the upload is handed in
// as `uploadCard` so it still happens only after the checks pass.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * THE DIRECTORY'S INSPECTORS - OUT OF `companies`, WHICH IS WHERE THEY LIVE.
 *
 * This read `contacts` from the day it was written in #432, and `contacts`
 * holds ZERO ROWS. Every door that files an inspector - the picker's Quick add,
 * the permits page's "save this inspector", Add Contact in the Directory -
 * POSTs to /api/directory, which inserts into `companies` with
 * `type = 'inspector'`. There are 21 of them there and none anywhere else.
 *
 * So the Directory half of "who do I call" has never produced a single line.
 * Not an error, not an empty state anybody could see: a query against the wrong
 * table comes back `[]`, which renders exactly like "you have not added any" -
 * the same silent failure as the Compliance Report reading a key the route does
 * not answer with. Check the table, the same as you check the column.
 *
 * Scoped to the job's own GC company, plus rows nobody claimed (the demo seed),
 * because the picker stamps `added_by_company_id` from whoever added them and a
 * company must not read another company's address book.
 */
export async function directoryInspectors(db: SupabaseClient, projectId: string) {
  const { data: proj } = await db.from('projects').select('gc_company_id').eq('id', projectId).maybeSingle()
  const owner = (proj as any)?.gc_company_id
  let q = db.from('companies').select('id, name, type, phone, extra').eq('type', 'inspector')
  if (owner) q = q.or(`added_by_company_id.eq.${owner},added_by_company_id.is.null`)
  const { data } = await q.order('name')
  return (data ?? []) as any[]
}

export interface InspectionFields {
  inspection_type: string | null
  trade?: string | null
  status?: string | null
  requested_date?: string | null
  booked_with?: string | null
  booking_reference?: string | null
  scheduled_date?: string | null
  inspector_name?: string | null
  inspector_phone?: string | null
  scheduling_phone?: string | null
  scheduled_time?: string | null
  scheduler_profile_id?: string | null
  scheduler_name?: string | null
  notes?: string | null
}

export async function createInspection(
  db: SupabaseClient,
  { userId, projectId, fields, uploadCard, via }: {
    userId: string; projectId: string; fields: InspectionFields
    uploadCard?: () => Promise<string | null>; via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId }
  const {
    inspection_type, trade = null, status = null, requested_date = null, booked_with = null,
    booking_reference = null, inspector_name = null, inspector_phone = null, scheduling_phone = null,
    scheduled_time = null, scheduler_profile_id = null, scheduler_name = null, notes = null,
  } = fields
  // A create only books something when it says who it was booked with.
  const scheduled_date = booked_with ? (fields.scheduled_date ?? null) : null

  // #2 - refused at creation as well as on edit. An inspection cannot be born
  // into the state the PATCH route now refuses to move it into.
  const createProblem = scheduleProblem(status, scheduled_date, booked_with)
  if (createProblem) return { status: 400, body: { error: createProblem } }

  // ...AND a blank one cannot be born at all. A fully empty submit created an
  // inspection and then NOTIFIED THREE SCHEDULERS about it. The guard has to be
  // here and not only on the form, because the field app posts to this same
  // route - and it has to be ABOVE the notify below, or the refusal arrives
  // after three people have already been told.
  const blank = requestProblem(inspection_type, requested_date)
  if (blank) return { status: 400, body: { error: blank } }

  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  // The inspector's card, if the caller has one - uploaded only once the
  // request has passed the checks above, as it always was.
  const card_image_url: string | null = uploadCard ? await uploadCard() : null

  const basePayload = {
    project_id: projectId,
    type: inspection_type ?? null,
    trade: trade || null,
    status: status ?? 'not_scheduled',
    requested_date: requested_date || null,
    scheduled_date: scheduled_date || null,
    booked_with: booked_with || null,
    booking_reference: booking_reference || null,
    scheduled_time: scheduled_time || null,
    inspector_name: inspector_name || null,
    inspector_phone: inspector_phone || null,
    scheduling_phone: scheduling_phone || null,
    scheduler_profile_id: scheduler_profile_id || null,
    scheduler_name: scheduler_name || null,
    requested_by_id: user.id,
    requested_by_name: (me as any)?.full_name ? withVia((me as any).full_name, via) : null,
    notes: notes || null,
  }

  let { data: inspection, error } = await db
    .from('inspections')
    .insert({ ...basePayload, card_image_url })
    .select()
    .single()

  // Retry stripping optional columns that may not exist yet
  if (error && error.code === '42703') {
    const retry2 = await db.from('inspections').insert(basePayload).select().single()
    inspection = retry2.data
    error = retry2.error
  }

  // Final fallback: only core columns guaranteed to exist
  if (error && error.code === '42703') {
    const minimal = { project_id: projectId, type: basePayload.type, status: basePayload.status }
    const retry3 = await db.from('inspections').insert(minimal).select().single()
    inspection = retry3.data
    error = retry3.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  // #4 - a created inspection is an action on the project, and Job History
  // recorded nothing until it passed or failed. The creation of a compliance
  // record is most of what an audit trail is for.
  const label = inspection_type
    ? `${inspection_type}${trade ? ` (${trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, projectId, withVia((me as any)?.full_name ?? 'Someone', via), 'inspection_created',
    `${label} requested${requested_date ? ` for ${requested_date}` : ''}`,
    { inspection_id: (inspection as any)?.id, inspection_type, trade },
    user.id,
  )

  // Somebody has to hear that an inspection was asked for.
  //
  // THIS WHOLE BLOCK USED TO BE INSIDE `if (scheduler_profile_id)`. The assigned
  // person GATED the audience instead of joining it, so leaving "Who schedules
  // this?" on "No one assigned yet" told nobody at all - not the people who can
  // manage inspections, not even a rule a company had explicitly saved for this
  // event. The row was created, a 201 came back, and nothing anywhere said the
  // request had gone into a drawer. An unassigned inspection is exactly the one
  // somebody else needs to hear about.
  const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', projectId).single()
  const when = requested_date ? ` - needed by ${requested_date}${scheduled_time ? ` ${scheduled_time}` : ''}` : ''

  // WHO TO CALL, in the notification itself. "Inspection to book" with no
  // number is a person being told to act with nothing to act on - and the
  // requester in the field does not know the township's scheduling line. It is
  // already on the job's permits and in the Directory, so it is gathered rather
  // than asked for again. Both lookups are best-effort: a missing table or a
  // slow query must never stop the request being filed.
  const [permitsRes, contactsRes] = await Promise.all([
    db.from('permits').select('permit_type, issuing_authority, inspector_name, inspector_phone').eq('project_id', projectId),
    directoryInspectors(db, projectId),
  ])
  const contact = callLine(whoToCall({
    inspection: { type: inspection_type, inspector_name, inspector_phone, scheduling_phone },
    permits: (permitsRes.data ?? []) as any[],
    contacts: contactsRes,
  }))
  // The assigned scheduler because it is their job - structural, not a setting -
  // PLUS anyone the company wants copied in. Never one instead of the other.
  const bookers = withStructural(
    await audienceFor({
      db, companyId: (proj as any)?.gc_company_id, type: 'inspection_to_schedule', exclude: user.id,
    }),
    [scheduler_profile_id],
    user.id,
  )
  if (bookers.length) {
    await notify({
      db, userIds: bookers, type: 'inspection_to_schedule',
      title: 'Inspection to book',
      message: `Book an inspection: ${inspection_type} at ${proj?.name ?? 'a project'}${when}. Requested by ${(me as any)?.full_name ?? 'the field'}.${contact} SyteNav does not contact the inspector - somebody has to call, then record what they were given.`,
      link: `/projects/${projectId}/inspections?inspection=${(inspection as any)?.id ?? ''}`,
    })
  }

  // What actually happened, so the form can say it rather than guess. A create
  // that told nobody is a fact the person who pressed the button should have.
  return { status: 201, body: { inspection, notified: bookers.length } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Changing an inspection - booking it, recording the result, marking the work
// ready, or editing its details. Moved out of
// `PATCH /api/projects/[id]/inspections/[inspectionId]` unchanged, so the MCP
// server meets every guard the Inspections tab does: `scheduleProblem` (a
// booking carries who it was booked with), `clearsBooking` (moving back to
// requested clears the booking, or the false appointment stays in the ICS
// feed), `clearsCompletion` / `canCarryCompletion`, a failure needs a reason,
// the derived `booked_at`, and the same activity lines and notifications.
//
// THE GATE STAYS IN THE ROUTE, because which permission it asks depends on the
// body: a ready-only body is `mark-ready`, anything else is `inspections`.
// `inspectionUpdates` is the whitelist both read.
// ─────────────────────────────────────────────────────────────────────────────

// A whitelist with a field missing fails exactly like a rejection, and only
// one of them says so - so every column a form posts is listed here.
//
// `booked_at` and `booked_by_name` are deliberately NOT on it: they are
// DERIVED from the booking, stamped below from the actor and the clock. A
// client that could set them could date a booking to last year, the same
// reason `completed_at` on a task is never taken from a body.
export const ALLOWED_FIELDS = [
  'type',
  'trade',
  'status',
  'requested_date',
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
  'booked_with',
  'booking_reference',
] as const

/** The whitelisted part of a body - an absent key is "leave it alone". */
export function inspectionUpdates(body: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (body && key in body) updates[key] = body[key]
  }
  return updates
}

/** Only `ready_marked_by` / `ready_marked_at` - a report from the site, gated on `mark-ready`. */
export const READY_FIELDS = ['ready_marked_by', 'ready_marked_at'] as const

export async function updateInspection(
  db: SupabaseClient,
  { userId, projectId, inspectionId, updates: asked, via }: {
    userId: string; projectId: string; inspectionId: string; updates: Record<string, unknown>; via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId }
  // Whitelisted here as well as by the route, so no caller can reach a derived
  // column (`booked_at`, `booked_by_name`) by handing in a wider object.
  const updates = inspectionUpdates(asked)
  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No valid fields to update' } }
  }

  // #2 - "Scheduled" with no date was a storable state, and it lied four
  // different ways at once: it fired an "is scheduled" notification to the
  // office, the card read "No date yet", and the overview's booked list never
  // showed it because that list needs a date. Refused HERE and not only in the
  // form, because a form is not where invalid states are prevented.
  //
  // ...AND THE DATE ALONE WAS NOT ENOUGH, which is the half this guard was
  // missing. The requester typed their PREFERRED date into `scheduled_date`,
  // so "is there a date?" was always satisfied by somebody's wish and one tap
  // on the Scheduled pill turned it into a confirmed appointment on the
  // company calendar. A booking is a thing a person DID: who they reached is
  // what proves it, the same shape as the failed-needs-a-reason guard below.
  if (updates.status === 'scheduled') {
    const { data: current } = await db
      .from('inspections').select('scheduled_date, booked_with, booked_at')
      .eq('id', inspectionId).eq('project_id', projectId).maybeSingle()
    const effective = 'scheduled_date' in updates
      ? (updates.scheduled_date as string | null)
      : (current as any)?.scheduled_date
    const effectiveWith = 'booked_with' in updates
      ? (updates.booked_with as string | null)
      : (current as any)?.booked_with
    const problem = scheduleProblem('scheduled', effective, effectiveWith)
    if (problem) return { status: 400, body: { error: problem } }

    // WHEN the call was made and WHO made it, derived rather than posted -
    // neither is on ALLOWED_FIELDS. Stamped only on the move INTO booked, so
    // editing a note on an already-booked inspection cannot re-date the call.
    if (!(current as any)?.booked_at) {
      updates.booked_at = new Date().toISOString()
      updates.booked_by_name = (profile as any)?.full_name ? withVia((profile as any).full_name, via) : null
    }
  }

  // #6 - a record cannot be pending AND completed. Moving back to a waiting
  // state clears the stamp, or the card reads "PENDING Re-inspection" beside
  // "Completed 9/5/2026" and tells two stories about the same day.
  if (clearsCompletion(updates.status)) updates.completed_date = null

  // ...and the same for the BOOKING. The calendar and the ICS feed show any
  // inspection with a `scheduled_date`, whatever its status - so a row put back
  // to "requested" while keeping its booked date would stay in everyone's
  // Outlook as an appointment the app no longer believes in.
  // A NEW DATE IS A NEW BOOKING, so the once-per-booking warning re-arms. A
  // spent gate carried across a re-book means the not-ready warning never comes
  // again for the date that replaced it.
  if ('scheduled_date' in updates) {
    for (const col of BOOKING_DERIVED_COLUMNS) updates[col] = null
  }

  if (clearsBooking(updates.status)) {
    updates.scheduled_date = null
    for (const col of BOOKING_DERIVED_COLUMNS) updates[col] = null
    updates.booked_with = null
    updates.booking_reference = null
    updates.booked_at = null
    updates.booked_by_name = null
  }

  // ...AND A COMPLETION DATE ONLY BELONGS TO A FINISHED INSPECTION. `clearsCompletion`
  // above handles the status MOVE; this handles the other direction - a body
  // setting the date without moving the status, which is how a `requested`
  // inspection ended up reading "Completed Sep 24, 2026" under a Book it button.
  // REFUSED rather than dropped: a silent drop is the whitelist trap that made
  // task assignment answer 200 for months while writing nothing.
  if ('completed_date' in updates && updates.completed_date) {
    const effectiveStatus = 'status' in updates
      ? (updates.status as string)
      : (await db.from('inspections').select('status')
        .eq('id', inspectionId).eq('project_id', projectId).maybeSingle()).data?.status
    if (!canCarryCompletion(effectiveStatus)) {
      return { status: 400, body: {
        error: 'Only a passed or failed inspection carries a completion date. Record the result and the date goes on with it.',
      } }
    }
  }

  // #6 - a failure with no reason is the least useful record in the app, and
  // "what keeps failing" is a question a GC actually asks.
  if (updates.status === 'failed' && !String(updates.failure_reason ?? '').trim()) {
    const { data: current } = await db
      .from('inspections').select('failure_reason')
      .eq('id', inspectionId).eq('project_id', projectId).maybeSingle()
    if (!String((current as any)?.failure_reason ?? '').trim()) {
      return { status: 400, body: { error: 'Say why it failed - that is the part somebody needs later.' } }
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
      .eq('id', inspectionId).eq('project_id', projectId).maybeSingle()
    priorScheduler = (before as any)?.scheduler_profile_id ?? null
  }

  const { data: inspection, error } = await db
    .from('inspections')
    .update(updates)
    .eq('id', inspectionId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)

  const label = inspection.type
    ? `${inspection.type}${inspection.trade ? ` (${inspection.trade})` : ''}`
    : 'Inspection'

  // #4 - Job History logged passed and failed and NOTHING ELSE, while the panel
  // promises "every action on this project". Creation and destruction of
  // compliance records is most of what an audit trail is for.
  const STATUS_HISTORY: Record<string, { type: string; say: string }> = {
    scheduled: { type: 'inspection_scheduled', say: 'booked' },
    passed: { type: 'inspection_passed', say: 'passed' },
    failed: { type: 'inspection_failed', say: 'failed' },
    pending_reinspection: { type: 'inspection_reinspection', say: 'sent back for re-inspection' },
    requested: { type: 'inspection_updated', say: 'moved back to requested' },
    not_scheduled: { type: 'inspection_updated', say: 'moved back to not scheduled' },
  }
  const hist = newStatus ? STATUS_HISTORY[newStatus] : undefined
  if (hist) {
    const when = newStatus === 'scheduled' && inspection.scheduled_date
      ? ` for ${inspection.scheduled_date}${inspection.booked_with ? ` with ${inspection.booked_with}` : ''}` : ''
    const why = newStatus === 'failed' && inspection.failure_reason
      ? `: ${inspection.failure_reason}` : ''
    await logActivity(
      db, projectId, actorName, hist.type,
      `${label} ${hist.say}${when}${why}`,
      {
        inspection_id: inspection.id, inspection_type: inspection.type,
        trade: inspection.trade, status: newStatus,
        ...(inspection.failure_reason ? { failure_reason: inspection.failure_reason } : {}),
      },
      user.id,
    )
  } else if ('ready_marked_by' in updates && !updates.ready_marked_by) {
    // A RETRACTION IS AN EVENT TOO. The branch below skips its generic entry
    // whenever `ready_marked_by` is in play, and the notify block only fires
    // when it is truthy - so without this, taking a "ready" back left no trace
    // anywhere. An audit trail that records a claim and not its withdrawal is
    // half a record.
    await logActivity(
      db, projectId, actorName, 'inspection_updated',
      `${label} no longer marked ready`,
      { inspection_id: inspection.id, ready_marked_by: null },
      user.id,
    )
  } else if (!('ready_marked_by' in updates)) {
    // An edit that changed no status is still an action on the project. The
    // "ready" path logs its own entry, so it is excluded rather than doubled.
    await logActivity(
      db, projectId, actorName, 'inspection_updated',
      `${label} updated`,
      { inspection_id: inspection.id, fields: Object.keys(updates) },
      user.id,
    )
  }

  // A sub marking work ready only writes ready_marked_by/at - it never touches
  // status, so it falls outside the status-change notifications below. Tell the
  // GC anyway, otherwise the hand goes up and nobody sees it.
  if ('ready_marked_by' in updates && updates.ready_marked_by) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', projectId).single()
    const at = proj?.name ? ` at ${proj.name}` : ''

    await logActivity(
      db, projectId, actorName, 'inspection_ready',
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
      // THE MESSAGE FOLLOWS THE STATE. It said "Book the inspector when you
      // can" in every case - including on an inspection that was already
      // booked, which is the only case the button used to appear in. So the one
      // sentence it ever sent was an instruction to do something already done.
      const nextStep = inspection.scheduled_date
        ? ` The visit is booked for ${inspection.scheduled_date}${inspection.scheduled_time ? ` ${inspection.scheduled_time}` : ''} - nothing else to do.`
        : ' Book the inspector when you can.'
      await notify({
        db, userIds: recipients, type: 'inspection_ready',
        title: 'Ready for inspection',
        message: `${updates.ready_marked_by} marked ${label}${at} ready for inspection.${nextStep}`,
        link: `/projects/${projectId}/inspections?inspection=${inspectionId}`,
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
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', projectId).single()
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
        link: `/projects/${projectId}/inspections?inspection=${inspectionId}`,
      })
    }
  }

  // Follow-up notifications on status changes: keep the requester (and scheduler)
  // in the loop when the inspection is booked, passes, or fails.
  if (newStatus && ['scheduled', 'passed', 'failed', 'pending_reinspection'].includes(newStatus)) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', projectId).single()
    const at = proj?.name ? ` at ${proj.name}` : ''
    let msg = ''
    // BOOKED, and by whom - the half that was missing. "is scheduled for the
    // 25th" was the same sentence whether somebody had rung the township or
    // tapped a pill, so naming who was reached is what tells the field which
    // of the two happened.
    if (newStatus === 'scheduled') msg = `Your ${label} inspection${at} is booked${inspection.scheduled_date ? ` for ${inspection.scheduled_date}${inspection.scheduled_time ? ` ${inspection.scheduled_time}` : ''}` : ''}${inspection.booked_with ? ` with ${inspection.booked_with}` : ''}.${inspection.booking_reference ? ` Ref ${inspection.booking_reference}.` : ''}`
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
        link: `/projects/${projectId}/inspections?inspection=${inspectionId}`,
      })
    }
  }

  return { status: 200, body: { inspection } }
}

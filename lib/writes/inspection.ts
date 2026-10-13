import type { SupabaseClient } from '@supabase/supabase-js'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'
import { logActivity } from '@/lib/log-activity'
import { scheduleProblem, requestProblem } from '@/lib/inspection-status'
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

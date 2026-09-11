import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'
import { logActivity } from '@/lib/log-activity'
import { scheduleProblem, requestProblem } from '@/lib/inspection-status'
import { whoToCall, callLine } from '@/lib/inspection-contacts'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Voided rows come back only when asked for. They are kept for the record -
  // nothing here is hard-deleted - but they are not the working list, and a
  // notification linking to one needs a way to reveal it.
  const showVoided = new URL(request.url).searchParams.get('voided') === '1'
  let q = db
    .from('inspections')
    .select('*')
    .eq('project_id', params.id)
  if (!showVoided) q = q.neq('status', 'void')
  const { data: inspections, error } = await q.order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // WHO TO CALL, sent with the list rather than left to the screen to assemble.
  // The scheduler's question is "now what?", and the answer is a phone number
  // that already exists on this job's permits and in the Directory. One reader
  // (lib/inspection-contacts.ts) so the card and the notification cannot offer
  // two different numbers. Best-effort: a failed lookup costs a list, not a page.
  const [permitsRes, contactsRes] = await Promise.all([
    db.from('permits').select('permit_type, issuing_authority, inspector_name, inspector_phone').eq('project_id', params.id),
    db.from('contacts').select('name, type, phone, extra').eq('type', 'inspector'),
  ])
  const callTargets = whoToCall({
    permits: (permitsRes.data ?? []) as any[],
    contacts: (contactsRes.data ?? []) as any[],
  })

  return NextResponse.json({ inspections: inspections ?? [], callTargets })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const inspection_type = (formData.get('inspection_type') ?? formData.get('type')) as string
  const trade = formData.get('trade') as string | null
  const status = formData.get('status') as string | null
  // TWO DATES NOW, and this is the one a request carries. `scheduled_date` is
  // read only as a fallback because the field app posts the old name; whatever
  // arrives under either name is the date somebody ASKED for, and it is stored
  // as that. It was being written into `scheduled_date` and then labelled
  // "Scheduled Date" on the card - a wish rendered as an appointment, and put
  // on the company calendar and everyone's ICS feed as one.
  const requested_date = (formData.get('requested_date') ?? formData.get('scheduled_date')) as string | null
  // A create only books something when it says who it was booked with - the
  // same evidence the PATCH route demands. Filing an already-booked inspection
  // is a real case; guessing that a preference is a booking is not.
  const booked_with = formData.get('booked_with') as string | null
  const booking_reference = formData.get('booking_reference') as string | null
  const scheduled_date = booked_with ? (formData.get('scheduled_date') as string | null) : null
  const inspector_name = formData.get('inspector_name') as string | null
  const inspector_phone = formData.get('inspector_phone') as string | null
  const scheduling_phone = formData.get('scheduling_phone') as string | null
  const scheduled_time = formData.get('scheduled_time') as string | null
  const scheduler_profile_id = formData.get('scheduler_profile_id') as string | null
  const scheduler_name = formData.get('scheduler_name') as string | null
  const notes = formData.get('notes') as string | null
  const file = formData.get('file') as File | null

  // #2 - refused at creation as well as on edit. An inspection cannot be born
  // into the state the PATCH route now refuses to move it into.
  const createProblem = scheduleProblem(status, scheduled_date, booked_with)
  if (createProblem) return NextResponse.json({ error: createProblem }, { status: 400 })

  // ...AND a blank one cannot be born at all. A fully empty submit created an
  // inspection and then NOTIFIED THREE SCHEDULERS about it. The guard has to be
  // here and not only on the form, because the field app posts to this same
  // route - and it has to be ABOVE the notify below, or the refusal arrives
  // after three people have already been told.
  const blank = requestProblem(inspection_type, requested_date)
  if (blank) return NextResponse.json({ error: blank }, { status: 400 })

  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  let card_image_url: string | null = null

  if (file && file.size > 0) {
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()

    const { error: uploadError } = await db.storage
      .from('inspections')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })

    if (!uploadError) {
      const { data: signed } = await db.storage
        .from('inspections')
        .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      card_image_url = signed?.signedUrl ?? null
    }
  }

  const basePayload = {
    project_id: params.id,
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
    requested_by_name: (me as any)?.full_name || null,
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
    const minimal = { project_id: params.id, type: basePayload.type, status: basePayload.status }
    const retry3 = await db.from('inspections').insert(minimal).select().single()
    inspection = retry3.data
    error = retry3.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // #4 - a created inspection is an action on the project, and Job History
  // recorded nothing until it passed or failed. The creation of a compliance
  // record is most of what an audit trail is for.
  const label = inspection_type
    ? `${inspection_type}${trade ? ` (${trade})` : ''}`
    : 'Inspection'
  await logActivity(
    db, params.id, (me as any)?.full_name ?? 'Someone', 'inspection_created',
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
  const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
  const when = requested_date ? ` - needed by ${requested_date}${scheduled_time ? ` ${scheduled_time}` : ''}` : ''

  // WHO TO CALL, in the notification itself. "Inspection to book" with no
  // number is a person being told to act with nothing to act on - and the
  // requester in the field does not know the township's scheduling line. It is
  // already on the job's permits and in the Directory, so it is gathered rather
  // than asked for again. Both lookups are best-effort: a missing table or a
  // slow query must never stop the request being filed.
  const [permitsRes, contactsRes] = await Promise.all([
    db.from('permits').select('permit_type, issuing_authority, inspector_name, inspector_phone').eq('project_id', params.id),
    db.from('contacts').select('name, type, phone, extra').eq('type', 'inspector'),
  ])
  const contact = callLine(whoToCall({
    inspection: { inspector_name, inspector_phone, scheduling_phone },
    permits: (permitsRes.data ?? []) as any[],
    contacts: (contactsRes.data ?? []) as any[],
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
      link: `/projects/${params.id}/inspections?inspection=${(inspection as any)?.id ?? ''}`,
    })
  }

  // What actually happened, so the form can say it rather than guess. A create
  // that told nobody is a fact the person who pressed the button should have.
  return NextResponse.json({ inspection, notified: bookers.length }, { status: 201 })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { whoToCall } from '@/lib/inspection-contacts'
import { createInspection, directoryInspectors } from '@/lib/writes/inspection'

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
    directoryInspectors(db, params.id),
  ])
  const callTargets = whoToCall({
    permits: (permitsRes.data ?? []) as any[],
    contacts: contactsRes,
  })

  // The contacts go out too, id and name only. `callTargets` is a list of
  // NUMBERS and drops the id on purpose, so it cannot answer "is this typed
  // inspector name one of our contacts" - which is what the card needs to
  // offer a link to the contact's card.
  const directoryContacts = (contactsRes ?? []).map((c: any) => ({
    id: c.id, name: c.name, type: c.type,
  }))

  return NextResponse.json({ inspections: inspections ?? [], callTargets, directoryContacts })
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

  // Everything after reading the form is `createInspection`, which Claude's MCP
  // server calls too. The card photo uploads only once the request is accepted.
  const uploadCard = async (): Promise<string | null> => {
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

    return card_image_url
  }
  const result = await createInspection(db, {
    userId: user.id, projectId: params.id, uploadCard,
    fields: {
      inspection_type, trade, status, requested_date, booked_with, booking_reference, scheduled_date,
      inspector_name, inspector_phone, scheduling_phone, scheduled_time, scheduler_profile_id, scheduler_name, notes,
    },
  })
  return NextResponse.json(result.body, { status: result.status })
}

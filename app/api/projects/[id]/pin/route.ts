import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { projectSite, validPin } from '@/lib/project-site'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Where the job site IS, set by a person rather than a geocoder.
//
// Every other door writes this pin as a side effect of something else - picking
// an address suggestion, creating in bulk, the map's sweep - so a job the
// geocoder gets wrong (new construction with no street number yet, a long
// driveway, a site entrance on a different road from the postal address) could
// not be corrected by anybody. The pin is what the clock-in geofence measures
// against, so "uncorrectable" meant every punch on that job flagged, for a
// reason only the office could fix and no screen would name.
//
// It is its own route because it is its own fact and its own act: the project
// PATCH takes lat/lng only alongside an address, and only when the address
// autocomplete supplied them.

/** Set the pin. Body: { lat, lng }. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({}))
  const pin = validPin(body?.lat, body?.lng)
  if (!pin) {
    return NextResponse.json(
      { error: 'That is not a point on the map. Drag the pin or use your current location.' },
      { status: 400 },
    )
  }

  const { data: project, error: readErr } = await db.from('projects')
    .select('address').eq('id', params.id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!project) return NextResponse.json({ error: 'That job no longer exists.' }, { status: 404 })

  // `geocoded_address` is the address this pin stands for, whoever placed it.
  // Stamping the job's CURRENT address means two things at once, and both are
  // wanted: the map's sweep leaves a hand-placed pin alone, and editing the
  // address afterwards makes it stale the same way a geocoded one goes stale -
  // the pin was for the old address, and it says so.
  const { error } = await db.from('projects')
    .update({ lat: pin.lat, lng: pin.lng, geocoded_address: (project as any).address ?? null })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    site: projectSite({ ...(project as any), lat: pin.lat, lng: pin.lng, geocoded_address: (project as any).address }),
  })
}

/** Clear the pin, putting the job back to "not mapped". */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied

  // `geocoded_address` goes with it. It is the record of what the pin stood
  // for; left behind it would read as "we asked about this address and found
  // nothing", and the map's sweep would never try the job again.
  const { error } = await db.from('projects')
    .update({ lat: null, lng: null, geocoded_address: null })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ site: projectSite({}) })
}

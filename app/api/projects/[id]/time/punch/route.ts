import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { punchLocation } from '@/lib/punch-location'
import { projectSite } from '@/lib/project-site'
import { lookUpAddress } from '@/lib/geocode'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The radius, the distance and WHICH of the four outcomes this is all live in
// lib/punch-location.ts, so the route and every screen answer the same way.
// WHERE the job is, and whether that answer may be used, lives in
// lib/project-site.ts - this route used to read `projects.latitude` /
// `longitude`, a second pair of columns that only the demo seed and this
// route's own private Nominatim call ever wrote. The map, the project form and
// the bulk creator have always written `lat` / `lng`, so the geofence was
// asking an empty column on every real job and flagging the worker for it.
//
// The private geocoder is gone with it. It was Nominatim, unverified, and it
// pinned a job called "1 North St" to a street in east London.

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const form = await request.formData()
  const action = form.get('action') as 'in' | 'out'
  const lat = form.get('lat') ? parseFloat(form.get('lat') as string) : null
  const lng = form.get('lng') ? parseFloat(form.get('lng') as string) : null
  const selfie = form.get('selfie') as File | null

  if (action !== 'in' && action !== 'out') return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  if (!selfie || selfie.size === 0) return NextResponse.json({ error: 'A selfie is required to punch.' }, { status: 400 })

  // Resolve job-site coordinates (geocode + cache on first use).
  const { data: project } = await db.from('projects')
    .select('address, lat, lng, geocoded_address').eq('id', params.id).single()
  let site = projectSite(project ?? {})

  // Never mapped, and there is an address to try: look it up once and cache it
  // in the SAME columns the map and the project screen read, so the next punch,
  // the map and the Time tab all agree. A STALE pin is deliberately not
  // re-looked-up here - a punch is the wrong moment to move a job's pin, and
  // the map sweep and the project settings both do it properly.
  if (site.state === 'unmapped' && (project as any)?.address) {
    const found = await lookUpAddress((project as any).address)
    if (found.ok) {
      const patch = {
        lat: found.coords.lat, lng: found.coords.lng,
        geocoded_address: (project as any).address as string,
      }
      await db.from('projects').update(patch).eq('id', params.id)
      site = projectSite({ ...(project as any), ...patch })
    } else {
      // Recoverable from nowhere if we swallow it: the screen says the job is
      // not mapped, and this is the only record of WHY it could not be.
      console.error(`[punch] could not map project ${params.id}: ${found.why}`)
    }
  }

  // WHICH of the four, not just flagged-or-not.
  //
  // This used to be one `if` with four conditions and an `else { flagged =
  // true }` commented "no GPS available" - so a worker whose phone gave a
  // perfect fix was told their location was unavailable whenever the JOB had
  // no coordinates. Reported as "clock in and out says no GPS, but I allowed
  // location", with their latitude sitting in the same row.
  // `site.coords` is null for a stale pin as well as a missing one - a pin we
  // will not vouch for must never become a distance, because the distance is
  // what flags the worker.
  const { fix, distance, flagged } = punchLocation(
    { lat, lng },
    site.coords ?? { lat: null, lng: null },
  )

  // Upload selfie
  const path = `${params.id}/time/${Date.now()}-${(selfie.name || 'selfie.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { error: upErr } = await db.storage.from('daily-log-photos').upload(path, await selfie.arrayBuffer(), { contentType: selfie.type, upsert: true })
  if (upErr) return NextResponse.json({ error: `Selfie upload failed: ${upErr.message}` }, { status: 500 })
  const { data: signed } = await db.storage.from('daily-log-photos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  const selfieUrl = signed?.signedUrl ?? null

  if (action === 'in') {
    // Prevent double clock-in
    const { data: open } = await db.from('time_entries').select('id')
      .eq('project_id', params.id).eq('profile_id', user.id).is('clock_out_at', null).maybeSingle()
    if (open) return NextResponse.json({ error: 'You are already clocked in.' }, { status: 409 })

    const { data, error } = await db.from('time_entries').insert({
      project_id: params.id,
      profile_id: user.id,
      worker_name: (profile as any)?.full_name ?? user.email ?? 'Worker',
      clock_in_lat: lat, clock_in_lng: lng,
      clock_in_distance_m: distance, clock_in_flagged: flagged, clock_in_fix: fix,
      clock_in_selfie_url: selfieUrl,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logActivity(db, params.id, (profile as any)?.full_name || user.email || 'Worker', 'time_clock_in',
      `${(profile as any)?.full_name || 'A worker'} clocked in${flagged ? ' (flagged)' : ''}`,
      { entry_id: data.id, flagged, distance }, user.id)

    return NextResponse.json({ entry: data, flagged, distance, fix })
  }

  // action === 'out'
  const { data: open } = await db.from('time_entries').select('id')
    .eq('project_id', params.id).eq('profile_id', user.id).is('clock_out_at', null)
    .order('clock_in_at', { ascending: false }).limit(1).maybeSingle()
  if (!open) return NextResponse.json({ error: 'You are not clocked in.' }, { status: 409 })

  const { data, error } = await db.from('time_entries').update({
    clock_out_at: new Date().toISOString(),
    clock_out_lat: lat, clock_out_lng: lng,
    clock_out_distance_m: distance, clock_out_flagged: flagged, clock_out_fix: fix,
    clock_out_selfie_url: selfieUrl,
  }).eq('id', open.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, params.id, (profile as any)?.full_name || user.email || 'Worker', 'time_clock_out',
    `${(profile as any)?.full_name || 'A worker'} clocked out${flagged ? ' (flagged)' : ''}`,
    { entry_id: data.id, flagged, distance }, user.id)

  return NextResponse.json({ entry: data, flagged, distance, fix })
}

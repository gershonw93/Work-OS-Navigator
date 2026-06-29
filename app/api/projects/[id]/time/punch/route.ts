import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Flag a punch when the worker is farther than this from the job site.
const GEOFENCE_RADIUS_M = 250

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`, {
      headers: { 'User-Agent': 'SyteNav/1.0 (construction-pm)' },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data?.[0]) return null
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
  } catch { return null }
}

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

  // Resolve job-site coordinates (geocode + cache on first use)
  const { data: project } = await db.from('projects').select('latitude, longitude, address').eq('id', params.id).single()
  let siteLat = (project as any)?.latitude as number | null
  let siteLng = (project as any)?.longitude as number | null
  if ((siteLat == null || siteLng == null) && (project as any)?.address) {
    const geo = await geocode((project as any).address)
    if (geo) {
      siteLat = geo.lat; siteLng = geo.lng
      await db.from('projects').update({ latitude: geo.lat, longitude: geo.lng }).eq('id', params.id)
    }
  }

  // Distance + flag
  let distance: number | null = null
  let flagged = false
  if (lat != null && lng != null && siteLat != null && siteLng != null) {
    distance = Math.round(haversine(lat, lng, siteLat, siteLng))
    flagged = distance > GEOFENCE_RADIUS_M
  } else {
    flagged = true // no GPS available → flag for review
  }

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
      clock_in_distance_m: distance, clock_in_flagged: flagged,
      clock_in_selfie_url: selfieUrl,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ entry: data, flagged, distance })
  }

  // action === 'out'
  const { data: open } = await db.from('time_entries').select('id')
    .eq('project_id', params.id).eq('profile_id', user.id).is('clock_out_at', null)
    .order('clock_in_at', { ascending: false }).limit(1).maybeSingle()
  if (!open) return NextResponse.json({ error: 'You are not clocked in.' }, { status: 409 })

  const { data, error } = await db.from('time_entries').update({
    clock_out_at: new Date().toISOString(),
    clock_out_lat: lat, clock_out_lng: lng,
    clock_out_distance_m: distance, clock_out_flagged: flagged,
    clock_out_selfie_url: selfieUrl,
  }).eq('id', open.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data, flagged, distance })
}

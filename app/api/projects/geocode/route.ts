import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Geocode the company's projects that don't have cached coordinates yet.
// Uses Photon (OpenStreetMap) - free, no key, and (unlike Nominatim) reliable
// from datacenter/serverless IPs.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ updated: 0 })

  const { data: projects, error: selErr } = await db
    .from('projects')
    .select('id, address, lat, geocoded_address')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    .not('address', 'is', null)

  // Columns not there yet (migration 047 hasn't run) - nothing to do.
  if (selErr) return NextResponse.json({ updated: 0, error: 'Run the latest migration to enable the map.' })

  const pending = (projects ?? []).filter(p => p.address && (p.lat == null || p.geocoded_address !== p.address)).slice(0, 25)

  const key = process.env.GOOGLE_MAPS_API_KEY
  const results = await Promise.all(pending.map(async (p) => {
    // Google first (catches new construction), Photon as fallback.
    if (key) {
      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(p.address)}&key=${key}`)
        const d = await res.json()
        const loc = d?.results?.[0]?.geometry?.location
        if (loc?.lat != null) return { p, lat: Number(loc.lat), lng: Number(loc.lng) }
      } catch { /* fall through */ }
    }
    try {
      const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(p.address)}&limit=1&lang=en`)
      if (!res.ok) return { p, lat: null as number | null, lng: null as number | null }
      const d = await res.json()
      const coords = d?.features?.[0]?.geometry?.coordinates  // [lng, lat]
      if (Array.isArray(coords) && coords.length === 2) return { p, lat: Number(coords[1]), lng: Number(coords[0]) }
    } catch { /* best-effort */ }
    return { p, lat: null as number | null, lng: null as number | null }
  }))

  let updated = 0
  for (const r of results) {
    if (r.lat != null && r.lng != null) {
      await db.from('projects').update({ lat: r.lat, lng: r.lng, geocoded_address: r.p.address }).eq('id', r.p.id)
      updated++
    } else {
      // Cache the miss so we don't retry this exact address every open.
      await db.from('projects').update({ geocoded_address: r.p.address }).eq('id', r.p.id)
    }
  }

  return NextResponse.json({ updated })
}

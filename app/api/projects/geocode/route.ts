import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Geocode the company's projects that don't have cached coordinates yet
// (or whose address changed). Uses OpenStreetMap Nominatim — free, but rate
// limited to ~1 req/sec, so we do a few per call; the map page calls this
// once when opened and picks up whatever resolved.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ updated: 0 })

  const { data: projects } = await db
    .from('projects')
    .select('id, address, lat, geocoded_address')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    .not('address', 'is', null)

  const pending = (projects ?? []).filter(p => p.address && (p.lat == null || p.geocoded_address !== p.address)).slice(0, 6)
  let updated = 0
  for (const p of pending) {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(p.address)}`,
        { headers: { 'User-Agent': 'SyteNav/1.0 (project map)' } },
      )
      if (res.ok) {
        const hits = await res.json()
        if (Array.isArray(hits) && hits[0]?.lat) {
          await db.from('projects').update({
            lat: Number(hits[0].lat), lng: Number(hits[0].lon), geocoded_address: p.address,
          }).eq('id', p.id)
          updated++
        } else {
          // Cache the miss so we don't retry this exact address every open.
          await db.from('projects').update({ geocoded_address: p.address }).eq('id', p.id)
        }
      }
    } catch { /* best-effort */ }
    // Respect Nominatim's 1 req/sec policy
    if (pending.indexOf(p) < pending.length - 1) await new Promise(r => setTimeout(r, 1100))
  }

  return NextResponse.json({ updated, remaining: Math.max((projects ?? []).filter(p => p.address && p.lat == null).length - updated, 0) })
}

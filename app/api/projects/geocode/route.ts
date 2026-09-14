import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { lookUpAddress } from '@/lib/geocode'
import { projectSite, sameAddress } from '@/lib/project-site'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Put the company's projects on the map: anything with no pin, and anything
// whose pin belongs to an address the job no longer has.
//
// The provider order and the refusals used to be written out again here, which
// is how this route and the punch route came to use different geocoders with
// different rules. lib/geocode.ts is the one lookup now.
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
    .select('id, address, lat, lng, geocoded_address')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    .not('address', 'is', null)

  // Columns not there yet (migration 047 hasn't run) - nothing to do.
  if (selErr) return NextResponse.json({ updated: 0, error: 'Run the latest migration to enable the map.' })

  // A STALE pin counts as pending. It used to be compared by hand here
  // (`p.geocoded_address !== p.address`), which is the same judgement the punch
  // route and the project screen make - one reader for it now, so a pin the map
  // quietly replaces and a pin the geofence refuses cannot disagree.
  //
  // The second half is the cached miss, and it did NOT work before: the filter
  // began `p.lat == null ||`, which is true of every row we failed to place, so
  // the same hopeless addresses were sent to the geocoder on every single map
  // open. `geocoded_address` is the record that we asked about THIS address,
  // whatever the answer was.
  const pending = (projects ?? [])
    .filter(p => p.address
      && projectSite(p).state !== 'mapped'
      && !sameAddress(p.geocoded_address, p.address))
    .slice(0, 25)

  const results = await Promise.all(pending.map(async p => ({ p, found: await lookUpAddress(p.address!) })))

  let updated = 0
  for (const { p, found } of results) {
    if (found.ok) {
      await db.from('projects')
        .update({ lat: found.coords.lat, lng: found.coords.lng, geocoded_address: p.address })
        .eq('id', p.id)
      updated++
    } else {
      // Cache the miss so we don't retry this exact address every open - and
      // CLEAR the old pin, because the reason this row is here may be that its
      // coordinates belong to a different address. Leaving them would keep a
      // wrong pin on the map and mark the row as settled, so nothing would ever
      // look at it again.
      await db.from('projects')
        .update({ lat: null, lng: null, geocoded_address: p.address })
        .eq('id', p.id)
      console.error(`[geocode] project ${p.id}: ${found.why}`)
    }
  }

  return NextResponse.json({ updated, checked: pending.length })
}

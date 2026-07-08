import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Given a Google place_id, return structured address parts + coordinates so the
// form can split into street/city/state/zip and drop a map pin immediately.
export async function GET(request: Request) {
  const placeId = new URL(request.url).searchParams.get('placeId')
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!placeId || !key) return NextResponse.json({ ok: false })

  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=address_components,geometry&key=${key}`,
    )
    const d = await res.json()
    if (d.status !== 'OK') return NextResponse.json({ ok: false })

    const comps: any[] = d.result?.address_components ?? []
    const get = (type: string) => comps.find(c => c.types.includes(type))
    const streetNumber = get('street_number')?.long_name ?? ''
    const route = get('route')?.long_name ?? ''
    const city = get('locality')?.long_name || get('sublocality')?.long_name || get('postal_town')?.long_name || get('administrative_area_level_2')?.long_name || ''
    const state = get('administrative_area_level_1')?.short_name ?? ''
    const zip = get('postal_code')?.long_name ?? ''
    const loc = d.result?.geometry?.location

    return NextResponse.json({
      ok: true,
      street: [streetNumber, route].filter(Boolean).join(' '),
      city, state, zip,
      lat: loc?.lat ?? null, lng: loc?.lng ?? null,
    })
  } catch {
    return NextResponse.json({ ok: false })
  }
}

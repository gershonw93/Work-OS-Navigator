import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Address autocomplete proxy. Uses Google Places (fresh data, catches new
// construction / new roads) when GOOGLE_MAPS_API_KEY is set; falls back to
// Photon (OpenStreetMap, free) otherwise. The key stays server-side.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get('q')?.trim()
  if (!q || q.length < 3) return NextResponse.json({ suggestions: [] })

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&types=address&components=country:us|country:ca&key=${key}`,
      )
      const d = await res.json()
      if (d.status === 'OK' || d.status === 'ZERO_RESULTS') {
        return NextResponse.json({
          provider: 'google',
          suggestions: (d.predictions ?? []).map((p: any) => ({ id: p.place_id, label: p.description })),
        })
      }
      // On REQUEST_DENIED / OVER_QUERY_LIMIT etc, fall through to Photon.
    } catch { /* fall through */ }
  }

  // Photon fallback
  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=5&lang=en`)
    const d = await res.json()
    const seen = new Set<string>()
    const suggestions: { id: string; label: string; lat?: number; lng?: number }[] = []
    for (const f of d.features ?? []) {
      const p = f.properties ?? {}
      const label = [
        [p.housenumber, p.street].filter(Boolean).join(' ') || p.name,
        p.city || p.town || p.village,
        [p.state, p.postcode].filter(Boolean).join(' '),
      ].filter(Boolean).join(', ')
      const coords = f.geometry?.coordinates
      if (label && !seen.has(label)) {
        seen.add(label)
        suggestions.push({ id: label, label, lat: coords?.[1], lng: coords?.[0] })
      }
    }
    return NextResponse.json({ provider: 'photon', suggestions })
  } catch {
    return NextResponse.json({ suggestions: [] })
  }
}

// Server-side forward geocoding: address string -> coordinates.
//
// The browser gets coordinates for free when someone picks an autocomplete
// suggestion, but anything generated server-side (bulk creation walking a
// street number range) has no one to click a suggestion. Same provider order
// as /api/geo/autocomplete: Google when a key is configured, Photon otherwise.
//
// Always best-effort. A project that can't be geocoded is still a valid
// project; it just doesn't get a map pin.

export interface Coords { lat: number; lng: number }

export async function geocodeAddress(address: string): Promise<Coords | null> {
  const q = (address ?? '').trim()
  if (q.length < 5) return null

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`,
      )
      const d = await res.json()
      const loc = d?.results?.[0]?.geometry?.location
      if (d?.status === 'OK' && loc?.lat != null && loc?.lng != null) {
        return { lat: loc.lat, lng: loc.lng }
      }
      // REQUEST_DENIED / OVER_QUERY_LIMIT / ZERO_RESULTS - try Photon.
    } catch { /* fall through */ }
  }

  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`)
    const d = await res.json()
    const c = d?.features?.[0]?.geometry?.coordinates
    if (Array.isArray(c) && c.length >= 2) return { lat: c[1], lng: c[0] }
  } catch { /* best-effort */ }

  return null
}

/**
 * Geocode many addresses with a small concurrency cap.
 *
 * Bulk creation can ask for up to 100 street numbers. Firing 100 requests at
 * once gets rate-limited by both providers, and doing them one at a time makes
 * the user wait far too long, so run a handful in flight at once.
 */
export async function geocodeMany(
  addresses: string[],
  concurrency = 6,
): Promise<(Coords | null)[]> {
  const out: (Coords | null)[] = new Array(addresses.length).fill(null)
  let next = 0

  async function worker() {
    while (true) {
      const i = next++
      if (i >= addresses.length) return
      out[i] = await geocodeAddress(addresses[i])
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, addresses.length) }, worker),
  )
  return out
}

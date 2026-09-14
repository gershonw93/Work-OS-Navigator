// Server-side forward geocoding: address string -> coordinates.
//
// The browser gets coordinates for free when someone picks an autocomplete
// suggestion, but anything generated server-side (bulk creation walking a
// street number range, a punch on a job nobody has mapped) has no one to click
// a suggestion. Same provider order as /api/geo/autocomplete: Google when a key
// is configured, Photon otherwise.
//
// THERE WERE THREE COPIES OF THIS. This one, a second inside
// /api/projects/geocode with its own provider order, and a third inside the
// punch route that called Nominatim - which is the one that pinned a US job to
// a street in London and stored it without a second thought. The provider
// order, the refusals and the sentence explaining a refusal live here now, and
// every caller reads them.
//
// Still best-effort in the sense that nothing throws: a project that cannot be
// geocoded is a valid project. It is NOT best-effort about the answer. A wrong
// pin is worse than no pin - see lib/geocode-match.ts - so an address too vague
// to have one answer is never asked, and an answer that contradicts the address
// is never stored.

import { matchProblem, tooVagueToPin } from './geocode-match'

export interface Coords { lat: number; lng: number }

export type GeocodeOutcome =
  | { ok: true; coords: Coords; matched: string | null }
  /** `why` is a user-facing sentence. The caller shows it AND logs it. */
  | { ok: false; why: string }

/** Photon answers in parts; Google answers in one line. Make them one shape. */
function photonLabel(props: Record<string, any> | undefined): string | null {
  if (!props) return null
  const street = [props.housenumber, props.street ?? props.name].filter(Boolean).join(' ')
  const tail = [props.city ?? props.county, [props.state, props.postcode].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ')
  const label = [street, tail].filter(Boolean).join(', ')
  return label || null
}

/**
 * Look an address up, and say why when it comes back with nothing.
 *
 * "A ROUTE THAT COMPUTES A REASON MUST NOT BE THE ONLY PLACE IT EXISTS" - the
 * reason is the whole point here, because every refusal has a different fix:
 * finish the address, correct it, or set the pin by hand.
 */
export async function lookUpAddress(address: string): Promise<GeocodeOutcome> {
  const q = (address ?? '').trim()

  const vague = tooVagueToPin(q)
  if (vague) return { ok: false, why: vague }

  const key = process.env.GOOGLE_MAPS_API_KEY
  if (key) {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&key=${key}`,
      )
      const d = await res.json()
      const top = d?.results?.[0]
      const loc = top?.geometry?.location
      if (d?.status === 'OK' && loc?.lat != null && loc?.lng != null) {
        const matched = top?.formatted_address ?? null
        const problem = matchProblem(q, matched)
        // A contradiction is not a reason to go and ask somebody else - Photon
        // is not better informed about which state this job is in. Stop.
        if (problem) return { ok: false, why: `we could not place this address - ${problem}` }
        return { ok: true, coords: { lat: Number(loc.lat), lng: Number(loc.lng) }, matched }
      }
      // REQUEST_DENIED / OVER_QUERY_LIMIT / ZERO_RESULTS - try Photon.
    } catch { /* fall through */ }
  }

  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=en`)
    if (res.ok) {
      const d = await res.json()
      const f = d?.features?.[0]
      const c = f?.geometry?.coordinates // [lng, lat]
      if (Array.isArray(c) && c.length >= 2) {
        const matched = photonLabel(f?.properties)
        const problem = matchProblem(q, matched)
        if (problem) return { ok: false, why: `we could not place this address - ${problem}` }
        return { ok: true, coords: { lat: Number(c[1]), lng: Number(c[0]) }, matched }
      }
    }
  } catch { /* best-effort */ }

  return { ok: false, why: 'no map service could find this address' }
}

/** The same lookup where the caller only wants the coordinates. */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  const out = await lookUpAddress(address)
  return out.ok ? out.coords : null
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

// ─────────────────────────────────────────────────────────────────────────────
// Why a punch could not be placed at the job site - and WHICH of the several
// reasons it was.
//
// THE BUG. "Clock in and out says no GPS. But I allowed location while using
// the app." They had. The row the app wrote at the same moment:
//
//   clock_in_lat          40.6701718866206
//   clock_in_lng          -74.0044932185092
//   clock_in_distance_m   null
//   clock_in_flagged      true
//
// A full-precision fix, on both the in and the out punch. The phone did
// exactly what they said it did. What was missing was the OTHER coordinate:
// the job site's. That project's address is "1 Test Lane, Testville, NY
// 10001", which no geocoder can resolve, so there was nothing to measure the
// distance TO.
//
// The route collapsed both into one `else`:
//
//   if (lat != null && lng != null && siteLat != null && siteLng != null) { ... }
//   else { flagged = true }   // "no GPS available"
//
// and the screen printed "your location is unavailable" and " · no GPS" -
// while holding their coordinates. Two different facts, one message, and it
// named the wrong one. Worse than wrong: the flag is a mark against the
// WORKER, for something only the office can fix.
//
// Same family as the auth bug: a check that could not be MADE answers exactly
// like a check that failed. Four outcomes, not two.
// ─────────────────────────────────────────────────────────────────────────────

export type PunchFix =
  /** Measured, and inside the fence. */
  | 'ok'
  /** Measured, and outside it. The one that is genuinely about the worker. */
  | 'far'
  /** The phone gave us nothing. */
  | 'no_fix'
  /** The JOB has no coordinates - nothing to measure against. Not the worker. */
  | 'no_site'

export interface PunchPoint { lat: number | null; lng: number | null }
/** A point we actually have. `Required<>` would not do it - it strips the `?`, not the null. */
export interface Fixed { lat: number; lng: number }

export interface PunchLocation {
  fix: PunchFix
  /** Metres from the site, or null when that could not be worked out. */
  distance: number | null
  flagged: boolean
}

export const GEOFENCE_RADIUS_M = 250

export function metresBetween(a: Fixed, b: Fixed): number {
  const R = 6371000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/**
 * ORDER MATTERS, and it is: the worker first.
 *
 * When neither coordinate is known the honest answer is still `no_fix` - the
 * phone is the thing the person holding it can do something about, and telling
 * them the job is unmapped when their location services are also off sends
 * them to the wrong person.
 *
 * Everything that is not `ok` is flagged, because unverified is unverified.
 * What changes is what the flag SAYS.
 */
export function punchLocation(
  worker: PunchPoint,
  site: PunchPoint,
  radiusM: number = GEOFENCE_RADIUS_M,
): PunchLocation {
  if (worker.lat == null || worker.lng == null) {
    return { fix: 'no_fix', distance: null, flagged: true }
  }
  if (site.lat == null || site.lng == null) {
    return { fix: 'no_site', distance: null, flagged: true }
  }
  const distance = Math.round(metresBetween(
    { lat: worker.lat, lng: worker.lng }, { lat: site.lat, lng: site.lng },
  ))
  return { fix: distance > radiusM ? 'far' : 'ok', distance, flagged: distance > radiusM }
}

/**
 * ONE labeller, asked by the punch response, the entry row and the review list.
 *
 * The old strings were written separately in each of those places - which is
 * how " · no GPS" came to sit beside a latitude - so the sentence lives here
 * and they all read it.
 */
export function punchFixLabel(fix: PunchFix, distance: number | null): string {
  switch (fix) {
    case 'ok': return distance != null ? `${distance}m from site` : 'at the job site'
    case 'far': return `${distance}m from site`
    case 'no_site': return 'job site not mapped'
    case 'no_fix': return 'no location from the phone'
  }
}

/** The sentence said to the person who just pressed the button. */
export function punchMessage(action: 'in' | 'out', loc: PunchLocation): string {
  const did = `Clocked ${action === 'in' ? 'in' : 'out'}`
  switch (loc.fix) {
    case 'ok':
      return `${did} · ${loc.distance}m from site.`
    case 'far':
      return `${did} - but you are ${loc.distance}m from the job site. Flagged for review.`
    case 'no_site':
      // NOT "your location is unavailable". It is the JOB that has no place on
      // a map, and nobody on site can fix that from here.
      return `${did}. This job has no map location yet, so distance from site could not be checked - `
        + `add or correct the job address in project settings.`
    case 'no_fix':
      return `${did} - but your phone did not provide a location. Flagged for review.`
  }
}

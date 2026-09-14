// ─────────────────────────────────────────────────────────────────────────────
// Asking the phone where it is, and KEEPING the answer when it says no.
//
// Both punch screens had their own copy of this:
//
//   navigator.geolocation.getCurrentPosition(
//     p => resolve({ lat, lng }),
//     () => resolve(null),                         // <- the whole reason, gone
//     { enableHighAccuracy: true, timeout: 10000 },
//   )
//
// `GeolocationPositionError` carries a `code`: 1 is the person saying no, 2 is
// the device having no fix to give, 3 is it taking too long. All three became
// `null`, and null became "no GPS" on a screen and a flag against a worker -
// so "location is off", "you are in a basement" and "ten seconds was not
// enough" are indistinguishable, to the worker and to whoever reviews it.
//
// AND THE TIMEOUT IS THE LIKELY ONE. `enableHighAccuracy: true` with no
// `maximumAge` asks for a fresh satellite fix and refuses a perfectly good one
// taken thirty seconds ago; inside a building that is exactly the request that
// runs out the clock. A coarse fix is worth far more than nothing to a
// 250m geofence, so a refusal is asked again the cheap way before giving up.
// ─────────────────────────────────────────────────────────────────────────────

export type GeoFailure = 'unsupported' | 'denied' | 'unavailable' | 'timeout' | 'unknown'

export interface GeoFix { lat: number; lng: number; accuracy: number | null }
export type GeoResult = { ok: true; fix: GeoFix } | { ok: false; why: GeoFailure }

/** The browser's numbers, which are a spec constant and not worth re-deriving. */
export function geoFailure(code: number | null | undefined): GeoFailure {
  if (code === 1) return 'denied'
  if (code === 2) return 'unavailable'
  if (code === 3) return 'timeout'
  return 'unknown'
}

/** Said to the person holding the phone, so it has to name what THEY can do. */
export function geoFailureMessage(why: GeoFailure): string {
  switch (why) {
    case 'denied':
      return 'Location is turned off for SyteNav. Allow it in Settings → Privacy → Location Services.'
    case 'unavailable':
      return 'Your phone could not get a location fix - this usually means no signal indoors.'
    case 'timeout':
      return 'Your phone took too long to find a location.'
    case 'unsupported':
      return 'This device cannot report a location.'
    case 'unknown':
      return 'Your phone did not provide a location.'
  }
}

function ask(options: PositionOptions): Promise<GeoResult> {
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ ok: true, fix: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy ?? null } }),
      err => resolve({ ok: false, why: geoFailure(err?.code) }),
      options,
    )
  })
}

/**
 * TWICE, unless the answer was "no".
 *
 * A precise fix is worth waiting a few seconds for; after that a coarse or
 * recent one beats nothing, because the thing it is compared against is a
 * 250m circle. `denied` is never retried - the second ask cannot change an
 * answer the person gave on purpose, and asking again is how a permission
 * prompt turns into nagging.
 */
export async function getPosition(): Promise<GeoResult> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return { ok: false, why: 'unsupported' }
  }
  const precise = await ask({ enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 })
  if (precise.ok || precise.why === 'denied') return precise
  return ask({ enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 })
}

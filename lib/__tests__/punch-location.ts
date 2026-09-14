// "Clock in and out says no GPS. But I allowed location while using the app."
//
// They had. The row the app wrote at that moment:
//
//   clock_in_lat          40.6701718866206
//   clock_in_lng          -74.0044932185092
//   clock_in_distance_m   null
//   clock_in_flagged      true
//
// A full-precision fix, on both halves of the punch. The phone did exactly
// what they said it did. What was missing was the OTHER coordinate - the job
// site's. That project's address is "1 Test Lane, Testville, NY 10001", which
// no geocoder can resolve, so there was nothing to measure the distance TO.
//
// The route collapsed both into one else - `else { flagged = true }`, commented
// "no GPS available" - and the screen printed "your location is unavailable"
// and " · no GPS" while holding their latitude. Two facts, one message, and it
// named the one the worker cannot do anything about. The flag is a mark
// against THEM for an address only the office can fix.

import { punchLocation, punchFixLabel, punchMessage, metresBetween, GEOFENCE_RADIUS_M } from '../punch-location'
import { geoFailure, geoFailureMessage } from '../geo-position'
import { ok, done, code } from './_helpers'

// The reported punch, to the digit.
const WORKER = { lat: 40.6701718866206, lng: -74.0044932185092 }
const UNMAPPED = { lat: null, lng: null }

// ── the four outcomes ───────────────────────────────────────────────────────
const reported = punchLocation(WORKER, UNMAPPED)
ok(reported.fix === 'no_site',
  `THE BUG: a worker with a fix and a job with none is 'no_site', not 'no GPS' (${reported.fix})`)
ok(reported.distance === null, '...there is genuinely nothing to measure')
ok(reported.flagged, '...and it is still flagged, because unverified is unverified')

const noPhone = punchLocation(UNMAPPED, { lat: 40.67, lng: -74.0 })
ok(noPhone.fix === 'no_fix', 'a phone that gave nothing is the OTHER reason, and it has its own name')

// Both missing: still the phone. That is the half the person holding it can
// act on, and sending them to the office instead wastes the trip.
ok(punchLocation(UNMAPPED, UNMAPPED).fix === 'no_fix',
  'when neither is known the worker is told about the one they can fix')

const onSite = punchLocation(WORKER, { lat: 40.6702, lng: -74.0045 })
ok(onSite.fix === 'ok' && !onSite.flagged, 'standing at the job site is not flagged')
ok(onSite.distance != null && onSite.distance < 20, `...and the distance is real (${onSite.distance}m)`)

// One degree of latitude is ~111km, so a tenth of one is comfortably outside.
const away = punchLocation({ lat: WORKER.lat + 0.1, lng: WORKER.lng }, { lat: WORKER.lat, lng: WORKER.lng })
ok(away.fix === 'far' && away.flagged, 'genuinely far away IS about the worker, and is flagged')
ok(away.distance != null && away.distance > GEOFENCE_RADIUS_M,
  `...outside the ${GEOFENCE_RADIUS_M}m fence (${away.distance}m)`)

// The fence edge, from both sides.
ok(!punchLocation(WORKER, WORKER).flagged, 'zero metres is not flagged')
const dist = Math.round(metresBetween(WORKER, { lat: WORKER.lat + 0.002, lng: WORKER.lng }))
ok(dist > 200 && dist < 240, `haversine is in metres and roughly right (${dist}m for 0.002 degrees)`)

// ── one labeller, because three screens used to write their own ─────────────
ok(punchFixLabel('no_site', null) === 'job site not mapped',
  'the label blames the job, not the phone')
ok(!/GPS/i.test(punchFixLabel('no_site', null)),
  'THE STRING THAT WAS WRONG: nothing about GPS appears beside a stored latitude')
ok(punchFixLabel('no_fix', null) === 'no location from the phone', 'and the phone when it IS the phone')
ok(punchFixLabel('far', 800) === '800m from site', 'a measured distance says the distance')

const said = punchMessage('in', reported)
ok(/no map location/.test(said), 'the sentence after the button names the missing address')
ok(!/your location is unavailable/i.test(said),
  'THE SENTENCE THAT WAS WRONG: it no longer tells somebody their location failed when it did not')
ok(/project settings/.test(said), '...and says who can fix it, which is not the person on site')
ok(/did not provide a location/.test(punchMessage('in', { fix: 'no_fix', distance: null, flagged: true })),
  'and the phone case still says the phone')

// ── the reason the phone gave, which used to be thrown away ─────────────────
ok(geoFailure(1) === 'denied', 'code 1 is the person saying no')
ok(geoFailure(2) === 'unavailable', 'code 2 is no fix to be had')
ok(geoFailure(3) === 'timeout', 'code 3 is it taking too long')
ok(geoFailure(undefined) === 'unknown', 'and anything else is admitted to be unknown')
ok(/Settings/.test(geoFailureMessage('denied')),
  'a refusal tells them where to turn it back on')
ok(geoFailureMessage('timeout') !== geoFailureMessage('denied'),
  'and the three do not share one sentence - the fix for each is different')

// ── the route and the screens ───────────────────────────────────────────────
const route = code('app/api/projects/[id]/time/punch/route.ts')
ok(/punchLocation\(/.test(route), 'the route asks the shared rule')
ok(!/flagged = true/.test(route),
  'THE else THAT CAUSED IT is gone - it set the flag with no idea which reason it was')
ok(/clock_in_fix: fix/.test(route) && /clock_out_fix: fix/.test(route),
  'and the reason is STORED, so the review screen can say it months later')

const page = code('app/(dashboard)/projects/[id]/time/page.tsx')
ok(!/no GPS/.test(page), "the screen no longer prints ' · no GPS' beside a latitude")
ok(/punchFixLabel\(/.test(page) && /punchMessage\(/.test(page),
  '...it reads the one labeller instead of composing its own')
ok(/Site not mapped/.test(page),
  'and the badge on the row says which kind of flag it is')

// ── asking the phone: one reader, and a second chance ───────────────────────
const geo = code('lib/geo-position.ts')
ok(/why: geoFailure\(err\?\.code\)/.test(geo), 'the error code survives the callback')
ok(/maximumAge: 30000/.test(geo),
  'a fix from thirty seconds ago is still a fix - refusing one is what runs out the clock indoors')
ok(/precise\.why === 'denied'\) return precise/.test(geo),
  'a refusal is never re-asked: the second prompt cannot change a deliberate no')
ok(/enableHighAccuracy: false/.test(geo),
  'and a coarse fix is tried before giving up, because the target is a 250m circle')

for (const [file, label] of [
  ['app/(dashboard)/projects/[id]/time/page.tsx', 'the project time screen'],
  ['app/field/clock-card.tsx', 'Field Mode'],
] as const) {
  const src = code(file)
  ok(/from '@\/lib\/geo-position'/.test(src), `${label} uses the one reader`)
  ok(!/getCurrentPosition/.test(src), `...and no longer keeps its own copy of it`)
}

done()

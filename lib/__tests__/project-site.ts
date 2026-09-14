// "The geofence still cannot work." It could - it was reading the wrong column.
//
// A `projects` row carried four columns for one fact. `lat`/`lng` (migration
// 047) are written by the address autocomplete, the project form, the bulk
// creator and the map sweep, and 94 of the 100 live rows have them.
// `latitude`/`longitude` (migration 014) were written by the demo seed and by
// one private Nominatim call inside the punch route, and by nothing else, ever.
//
// The clock-in geofence read `latitude`/`longitude`. A query against the wrong
// name comes back null, null reads as "this job has no location", and nothing
// errors - so every punch on every real job came back flagged, and the earlier
// fix (#444) made it say "job site not mapped" very honestly about a job that
// had been on the map for months.
//
// The second half is a pin that is present and WRONG. `geocoded_address`
// records the address a pin was resolved from; editing the address without
// picking a suggestion leaves the old coordinates behind:
//
//   address            17 Fairview Terrace, Maplewood, NJ 07040
//   geocoded_address   17 Fairview Avenue, Frederick, MD 21701
//
// - a real row, two hundred miles out. Fourteen of the hundred looked like
// that. A wrong pin does not read as missing, it reads as a worker who is not
// where they say they are.

import {
  projectSite, siteLabel, siteAdvice, sameAddress, validPin, type ProjectSiteRow,
} from '../project-site'
import { ok, done, code, read } from './_helpers'

// ── the three states ────────────────────────────────────────────────────────
const MAPPED: ProjectSiteRow = {
  address: '110 Point Pleasant Drive, Palm Coast, FL 32164',
  lat: 29.505482, lng: -81.205205,
  geocoded_address: '110 Point Pleasant Drive, Palm Coast, FL 32164',
}
ok(projectSite(MAPPED).state === 'mapped', 'a pin resolved from the job\'s own address is usable')
ok(projectSite(MAPPED).coords?.lat === 29.505482, '...and it hands the coordinate over')

// The row as it actually stands in the database.
const STALE: ProjectSiteRow = {
  address: '17 Fairview Terrace, Maplewood, NJ 07040',
  lat: 39.4166278, lng: -77.4325548,
  geocoded_address: '17 Fairview Avenue, Frederick, MD 21701',
}
const stale = projectSite(STALE)
ok(stale.state === 'stale', 'a pin for an address the job no longer has is NOT a usable pin')
ok(stale.coords === null,
  'THE ONE THAT MATTERS: a pin we will not vouch for never becomes a coordinate, because a coordinate becomes a distance and a distance flags a worker')
ok(stale.pinnedTo === '17 Fairview Avenue, Frederick, MD 21701',
  '...and it still knows what the pin WAS for, so the screen can say so')

ok(projectSite({ address: '1 Test Lane, Testville, NY 10001' }).state === 'unmapped',
  'no coordinates at all is unmapped')
ok(projectSite({}).state === 'unmapped', 'and an empty row does not throw')

// The 15 rows the demo seed wrote, and anything older than migration 047's
// third column: coordinates with no record of what they were resolved from.
ok(projectSite({ address: '210 Cedar Lane, Edison, NJ', lat: 40.5187, lng: -74.4121 }).state === 'mapped',
  'a pin with no geocoded_address is trusted - we cannot show it is stale, and calling every one of them stale takes the working geofence off the jobs that have one')

// ── same address, allowing for a hand edit ──────────────────────────────────
ok(sameAddress('17 Main St, Lakewood, NJ', '17 Main St,  Lakewood , NJ'), 'spacing and a stray comma do not make it a different place')
ok(sameAddress('17 MAIN ST, LAKEWOOD, NJ', '17 Main St, Lakewood, NJ'), 'nor does case')
ok(!sameAddress('17 Main St, Lakewood, NJ', '17 Main Ave, Lakewood, NJ'), 'a different street is a different place')
ok(!sameAddress(null, null), 'two blanks are not "the same address" - that would make every empty row mapped')
ok(!sameAddress('', '17 Main St'), 'and neither is a blank against a real one')

// ── one labeller, read by two screens ───────────────────────────────────────
ok(/on the map/.test(siteLabel(projectSite(MAPPED))), 'the mapped sentence says it is checked')
ok(siteLabel(stale).includes('17 Fairview Avenue, Frederick, MD 21701'),
  'the stale sentence NAMES the address the pin is stuck on - "not mapped" would be a lie about a job with a pin on the screen')
ok(/not being checked/.test(siteLabel(stale)), '...and says the consequence, which is the part that matters')
ok(siteAdvice(projectSite(MAPPED)) === '', 'a job that is fine is told to do nothing')
ok(siteAdvice(stale).length > 0 && siteAdvice(projectSite({})).length > 0,
  'and the two broken states both come with something to do about them')

// ── a coordinate somebody typed or tapped ───────────────────────────────────
ok(validPin(40.0646, -74.2099)?.lat === 40.0646, 'a real point is taken')
ok(validPin(0, 0) === null, '0,0 is the Atlantic and is what an empty form posts')
ok(validPin(91, 0) === null && validPin(0, 181) === null, 'off the globe is refused')
ok(validPin('40.06', '-74.2')?.lng === -74.2, 'a JSON body sends strings, and they are numbers')
ok(validPin(null, -74) === null && validPin('east', 3) === null, 'and nothing else gets through')

// ── the route that was reading the empty column ─────────────────────────────
const punch = code('app/api/projects/[id]/time/punch/route.ts')
ok(!/latitude/.test(punch),
  'THE BUG: the punch route no longer reads projects.latitude, the pair nothing in the app writes')
ok(/select\('address, lat, lng, geocoded_address'\)/.test(punch),
  '...it reads the columns the map and the project form have always written')
ok(/projectSite\(/.test(punch), 'and it goes through the one reader rather than picking the row apart itself')
ok(/site\.coords \?\? \{ lat: null, lng: null \}/.test(punch),
  'a stale pin reaches punchLocation as no pin at all')
// read(), and the domain: code() strips `//` to end of line, which is most of
// an https:// URL, so this assertion could never have failed through it.
ok(!/nominatim\.openstreetmap\.org/i.test(read('app/api/projects/[id]/time/punch/route.ts')),
  'THE GEOCODER THAT PINNED A US JOB TO LONDON is gone from this route')
ok(/lookUpAddress\(/.test(punch), '...replaced by the shared lookup, which verifies its answer')
ok(/console\.error/.test(punch),
  'and a lookup that fails is recorded - the screen says "not mapped" and this is the only record of why')

// Nothing anywhere still reads the retired pair.
for (const f of [
  'app/api/projects/route.ts',
  'app/api/projects/[id]/route.ts',
  'app/api/projects/bulk/route.ts',
  'lib/seed-demo.ts',
]) {
  ok(!/\blatitude\b/.test(code(f)), `${f} writes one pair of coordinates, not two`)
}
ok(/DROP COLUMN IF EXISTS latitude/.test(code('supabase/migrations/105_one_home_for_a_jobs_coordinates.sql')),
  'and the second home is dropped, so a future route cannot ask for it again')

// ── the screens that have to say it ─────────────────────────────────────────
const page = code('app/(dashboard)/projects/[id]/time/page.tsx')
ok(/siteLabel\(/.test(page),
  'the Time tab says whether the job has a pin - a column of flagged punches with no explanation IS a missing pin')
ok(/'Location checked' : 'Location recorded, not checked'/.test(page),
  'THE CLAIM THAT WAS NOT TRUE: the chip under the punch button now depends on whether the job has a pin')
ok(!/\/> Location checked</.test(page),
  '...and the unconditional line it replaced is gone')
ok(/Ask the office/.test(page),
  'and somebody who cannot open project settings is told who can')

const timeRoute = code('app/api/projects/[id]/time/route.ts')
ok(/projectSite\(/.test(timeRoute), 'the state comes from the same reader as the geofence')
ok(/Promise\.all/.test(timeRoute), '...without a second sequential round trip for it')

const settings = code('components/layout/edit-project-button.tsx')
ok(/<SitePinField/.test(settings), 'project settings carries the pin control')
ok(/address=\{address\}/.test(settings),
  'and it reads the address as the FORM has it, so typing over a mapped address warns while the dialog is still open')

const pinField = code('components/projects/site-pin-field.tsx')
ok(/siteLabel\(/.test(pinField) && /siteAdvice\(/.test(pinField),
  'the dialog and the Time tab describe the state with the same words')
ok(/function PinPicker/.test(pinField) && !/const PinPicker = \(/.test(pinField),
  'the map is hoisted out - a component declared inside a component is a new type every render, and React would throw the Leaflet map away mid-drag')
ok(/data-overlay/.test(pinField) && /className="overlay/.test(pinField),
  'and it is a real overlay, so it is frozen behind and fits inside the notch')
ok(!/disabled=\{[^}]*!pin/.test(pinField),
  'Save is disabled for IN FLIGHT only - pressing it with no pin answers with the thing it is waiting for')

const pinRoute = code('app/api/projects/[id]/pin/route.ts')
ok(/requirePermission\(db, request, 'projects', 'edit'\)/.test(pinRoute),
  'setting a job site by hand is gated, on the route, not just hidden in the UI')
ok(/geocoded_address: \(project as any\)\.address/.test(pinRoute),
  'a hand-placed pin records the address it stands for, so the map sweep leaves it alone and a later address edit still makes it stale')
ok(/validPin\(/.test(pinRoute), 'and a body cannot post a point that is not on Earth')

// ── the sweep that is supposed to heal them ─────────────────────────────────
const sweep = code('app/api/projects/geocode/route.ts')
ok(/projectSite\(p\)\.state !== 'mapped'/.test(sweep),
  'the sweep picks up a stale pin as well as a missing one')
ok(/!sameAddress\(p\.geocoded_address, p\.address\)/.test(sweep),
  'THE CACHE THAT NEVER CACHED: the old filter began `p.lat == null ||`, so every address we had failed to place was re-sent to the geocoder on every map open')
ok(/lat: null, lng: null, geocoded_address: p\.address/.test(sweep),
  'and a miss CLEARS the old pin rather than leaving a wrong one on the map marked as settled')

const map = code('components/projects/projects-map.tsx')
ok(/projectSite\(p\)\.state !== 'mapped'/.test(map),
  'and the map itself asks for the sweep when a pin is stale, not only when one is missing')

done()

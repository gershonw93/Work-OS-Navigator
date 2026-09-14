// A project row, live, when this was written:
//
//   name       Test
//   address    1 North St
//   latitude   51.5392957
//   longitude  0.0752215
//
// That is a street in east London. The job is in the United States. The punch
// route asked Nominatim for "1 North St", took the first thing it offered and
// stored it, and the geofence then measured every clock-in on that job against
// a point three and a half thousand miles away.
//
// A NULL coordinate says "we do not know where this is" and the app can say so.
// A WRONG one says "we know exactly where this is" and flags an honest worker
// standing in the right place. Vague question in, confident answer out - so
// there are two refusals here: a question too vague to have one answer is never
// asked, and an answer that contradicts the question is never stored.

import { stateIn, zipIn, tooVagueToPin, matchProblem } from '../geocode-match'
import { ok, done, code, read } from './_helpers'

// ── reading a written address ───────────────────────────────────────────────
ok(stateIn('17 Fairview Terrace, Maplewood, NJ 07040') === 'NJ', 'a two-letter code beside a ZIP')
ok(stateIn('420 Maple Street, Brooklyn, NY') === 'NY', 'a code on its own at the end')
ok(stateIn('3208 Toronto Avenue Southeast, Palm Bay, FL 32909') === 'FL', 'a street with four words in it does not confuse it')
ok(stateIn('17 Fairview Avenue, Frederick, Maryland 21701') === 'MD', 'and a full state name, which is how Photon answers')
ok(stateIn('1 North St') === null,
  'THE ADDRESS THAT BECAME LONDON: one line, no state, no ZIP - and it says so rather than guessing')

// A street can be named after a state, and the street line is not where a state
// lives. Reading one out of it would let a good match be refused for
// contradicting something the address never said.
ok(stateIn('123 Washington') === null, 'a street named after a state is not a state')
ok(stateIn('123 Washington Blvd, Toledo, OH') === 'OH', '...and the real one is still found beside it')

ok(zipIn('110 Point Pleasant Drive, Palm Coast, FL 32164') === '32164', 'a ZIP is found')
ok(zipIn('12345 Main St, Anytown, TX 78701') === '78701',
  'the LAST five digits, not the first: a five-digit house number is not a postal code')
ok(zipIn('1 Elm St, Dover, DE 19901-4321') === '19901', 'ZIP+4 reduces to the five')
ok(zipIn('1 North St') === null, 'and none is none')

// ── refusing to ask ─────────────────────────────────────────────────────────
ok(tooVagueToPin('1 North St') !== null,
  'THE REFUSAL: an address with neither a state nor a ZIP is not sent to a geocoder at all')
ok(/city and state/.test(tooVagueToPin('1 North St') ?? ''),
  '...and the sentence names the fix, because it is shown to the person who can make it')
ok(tooVagueToPin('') !== null && tooVagueToPin(null) !== null, 'no address at all is refused too')
ok(/no address/.test(tooVagueToPin('') ?? ''), '...and says that, rather than asking for a state')
ok(tooVagueToPin('110 Point Pleasant Drive, Palm Coast, FL 32164') === null, 'a complete address is asked')
ok(tooVagueToPin('420 Maple Street, Brooklyn, NY') === null, 'a state with no ZIP is enough')
ok(tooVagueToPin('1 Elm St, 08701') === null, 'and a ZIP with no state is enough')

// ── refusing the answer ─────────────────────────────────────────────────────
// The exact pair off the live row, which is how the Maplewood job came to be
// pinned in Maryland.
const wrongState = matchProblem(
  '17 Fairview Terrace, Maplewood, NJ 07040',
  '17 Fairview Avenue, Frederick, MD 21701',
)
ok(wrongState !== null, 'a match in a different state is refused')
ok(/NJ/.test(wrongState ?? '') && /MD/.test(wrongState ?? ''),
  '...and the refusal names both, so it can be read on the screen and believed')

ok(matchProblem('1 Elm St, Lakewood, NJ 08701', '1 Elm St, Lakewood, NJ 08753') !== null,
  'a different ZIP in the same state is refused too - a neighbouring town is still the wrong job')
ok(matchProblem('110 Point Pleasant Drive, Palm Coast, FL 32164',
  '110 Point Pleasant Drive, Palm Coast, FL 32164') === null,
  'the same place is accepted')
ok(matchProblem('420 Maple Street, Brooklyn, NY', '420 Maple Street, Brooklyn, New York 11225') === null,
  'a ZIP the question never mentioned cannot contradict it')
ok(matchProblem('1 Elm St, Dover, DE', null) === null,
  'a provider that echoes no label gets the benefit of the doubt - refusing every unlabelled answer takes the map away from addresses that are fine')

// ── one lookup, with the refusals in it ─────────────────────────────────────
const geo = code('lib/geocode.ts')
ok(/tooVagueToPin\(/.test(geo) && /matchProblem\(/.test(geo),
  'the shared lookup asks both questions')
ok(/if \(problem\) return \{ ok: false/.test(geo),
  'a contradicted match is a refusal, not a coordinate')
// read(), not code(): the comment stripper eats `//` and everything after it on
// the line, and every one of these patterns lives inside an https:// URL. Run
// through code() the assertion is searching text that is never there, which is
// a check that cannot fail - exactly what the README warns about.
const geoRaw = read('lib/geocode.ts')
ok(geoRaw.split('photon.komoot.io').length - 1 === 1 && geoRaw.split('maps.googleapis.com').length - 1 === 1,
  'and there is one of each provider in the file, not one per caller')
ok(/why: string/.test(geo),
  'a refusal carries the reason - the route shows it AND logs it, rather than being the only place it exists')

// There were three copies of the provider order: this one, one in the map sweep
// with its own rules, and Nominatim inside the punch route. Nominatim is the
// one that answered London, and it answered because it was the only one nobody
// had thought about since.
for (const f of ['app/api/projects/geocode/route.ts', 'app/api/projects/[id]/time/punch/route.ts']) {
  ok(/lookUpAddress\(/.test(code(f)), `${f} asks the one lookup`)
  // Raw again, and matched on the DOMAIN rather than the product name, so the
  // punch route's comment about what it used to do cannot pass this for it.
  ok(!/photon\.komoot\.io|maps\.googleapis\.com|nominatim\.openstreetmap\.org/i.test(read(f)),
    `...and no longer keeps its own geocoder`)
}

done()

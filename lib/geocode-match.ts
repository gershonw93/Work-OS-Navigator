// ─────────────────────────────────────────────────────────────────────────────
// Does the geocoder's answer actually describe the address we asked about?
//
// THE BUG. A project row, live, at the moment this was written:
//
//   name       Test
//   address    1 North St
//   latitude   51.5392957
//   longitude  0.0752215
//
// That is a street in east London. The job is in the United States. The punch
// route asked Nominatim for "1 North St", got the first thing it offered, and
// stored it with no check - and the geofence then measured every clock-in on
// that job against a point three and a half thousand miles away.
//
// A NULL coordinate says "we do not know where this is", and the app can say
// so. A WRONG one says "we know exactly where this is" and then flags an
// honest worker standing in the right place. The wrong one is worse, and it is
// the one a geocoder produces when you hand it an address with no state and no
// ZIP: there are a hundred "North St"s and it has no way to prefer yours, so
// it picks. Vague in, confident out.
//
// Two rules, both pure, both cheap:
//
//   * REFUSE TO ASK a question too vague to have one answer. An address with
//     neither a state nor a ZIP cannot pin a job site.
//   * REFUSE AN ANSWER that contradicts the question. If the address says NJ
//     and the match says MD, the match is not of this address, whatever its
//     confidence score says.
//
// Deliberately narrow. It is not a validator and it does not score similarity;
// it looks for a flat contradiction in the two facts a US address states
// unambiguously. Anything cleverer would start refusing good matches, and the
// cost of refusing a good one is a job the user has to pin by hand.
// ─────────────────────────────────────────────────────────────────────────────

import { usState } from './validate'

/** The last 5-digit ZIP in a string, or null. */
export function zipIn(address: string | null | undefined): string | null {
  // The LAST one, not the first: "12345 Main St, Anytown, TX 78701" opens with
  // a five-digit house number, and a street number is not a postal code.
  const all = String(address ?? '').match(/\b\d{5}(?:-\d{4})?\b/g)
  if (!all?.length) return null
  return all[all.length - 1].slice(0, 5)
}

/**
 * The US state a written address names, as a two-letter code, or null.
 *
 * ONLY LOOKS AFTER THE FIRST COMMA. A state never lives in the street line, and
 * plenty of streets are named after one - "123 Washington" would otherwise read
 * as WA and could then contradict a perfectly good match in Ohio. A one-part
 * string has no state as far as this is concerned, which is the same answer it
 * gives for "1 North St" and for the same reason: not enough was said.
 */
export function stateIn(address: string | null | undefined): string | null {
  // Take the ZIP out first, so "NJ 07040" reduces to a part that is just "NJ".
  const text = String(address ?? '').replace(/\b\d{5}(?:-\d{4})?\b/g, ' ')
  const parts = text.split(',').map(p => p.trim()).filter(Boolean)
  for (let i = parts.length - 1; i >= 1; i--) {
    const words = parts[i].split(/\s+/).filter(Boolean)
    // The whole part ("New Jersey"), then its last two words, then its last
    // one - a city and state share a comma part often enough ("Brooklyn NY").
    for (const n of [words.length, 2, 1]) {
      if (n <= 0 || n > words.length) continue
      const code = usState(words.slice(words.length - n).join(' ')).value
      if (code) return code
    }
  }
  return null
}

/**
 * Why this address cannot be pinned at all, or null if it can be looked up.
 *
 * The sentence is user-facing: it is shown on the project, and the fix it names
 * is one the person reading it can actually carry out.
 */
export function tooVagueToPin(address: string | null | undefined): string | null {
  const a = String(address ?? '').trim()
  if (a.length < 5) return 'there is no address on this job yet'
  if (!stateIn(a) && !zipIn(a)) {
    return 'the address needs a city and state (or a ZIP) before it can be placed on a map'
  }
  return null
}

/**
 * Why this match cannot be trusted for that query, or null if it can.
 *
 * `matched` is whatever label the provider echoed back. A provider that returns
 * no label gets the benefit of the doubt - there is nothing to contradict, and
 * refusing every unlabelled answer would take the map away from addresses that
 * are fine.
 */
export function matchProblem(query: string, matched: string | null | undefined): string | null {
  if (!matched) return null

  const qState = stateIn(query), mState = stateIn(matched)
  if (qState && mState && qState !== mState) {
    return `the job is in ${qState} and the closest match is in ${mState}`
  }

  const qZip = zipIn(query), mZip = zipIn(matched)
  if (qZip && mZip && qZip !== mZip) {
    return `the job is in ${qZip} and the closest match is in ${mZip}`
  }

  return null
}

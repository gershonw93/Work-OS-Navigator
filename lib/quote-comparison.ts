// What a comparison is called, and the one place the placeholder is spelled.
//
// THE REPORT: "upload quote doesn't do anything". It did - the PDF was read,
// the vendor, the $317,750 total, the scope, the inclusions and the exclusions
// all came back correctly. What appeared on screen was a COLLAPSED row labelled
// "Untitled comparison", which is indistinguishable from nothing having
// happened. The work was done and the screen did not say so.
//
// "Untitled comparison" was written by the CLIENT as a hardcoded string and
// then never replaced by anything, even though the upload route extracts a
// vendor name out of the document seconds later. A placeholder that nothing
// ever writes over is a default making a claim - here, the claim that we do not
// know what this is, made about a file we have just read in full.
//
// The tell it had already leaked: `award/route.ts` carries
// `comp.title !== 'Untitled comparison' ? comp.title : null`, a special case
// for a string a third file happened to spell the same way. Three spellings of
// one placeholder is how the fourth one quietly stops matching.

/** The name a comparison has before anything has been read into it. */
export const UNTITLED_COMPARISON = 'Untitled comparison'

/** True when this title is the placeholder rather than something meant. */
export function isUntitled(title: string | null | undefined): boolean {
  return !title?.trim() || title.trim() === UNTITLED_COMPARISON
}

export interface NamedQuote {
  vendor_name?: string | null
}

/**
 * What to call a comparison, given the quotes read into it.
 *
 * One quote is named after who sent it, because that is what somebody scanning
 * the list is looking for. Several are named after the vendors too - two by
 * both names, three or more by the first plus a count - because "2 quotes" is
 * a description of the row's own shape and tells a reader nothing they cannot
 * already see.
 *
 * `trade` is the COMPARISON's trade (the `trade` column on `quote_comparisons`),
 * passed in by the caller. THE BUG THIS ARGUMENT REPLACES: the first version
 * read `q.trade` off each quote, and `quotes` has never had a `trade` column -
 * it is on the comparison, one table over. A field that describes no table is
 * checked by nothing: it compiled, every read was `undefined`, and so every
 * bulk upload fell through to the count and landed on "2 quotes" while the
 * single-file path looked perfect. Reported as bulk uploads keeping a useless
 * name, two days after the naming was supposedly fixed.
 *
 * Returns null when there is nothing better than the placeholder, so the caller
 * writes nothing rather than writing a worse name over a real one.
 */
export function comparisonTitle(quotes: NamedQuote[], trade?: string | null): string | null {
  const named = quotes
    .map(q => q.vendor_name?.trim())
    .filter((v): v is string => !!v)
  if (!named.length) return null

  const suffix = trade?.trim() ? ` - ${trade.trim()}` : ''
  if (named.length === 1) return named[0]
  if (named.length === 2) return `${named[0]} and ${named[1]}${suffix}`
  return `${named[0]} + ${named.length - 1} others${suffix}`
}

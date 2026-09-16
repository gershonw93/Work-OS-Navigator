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
  /** The trade, when the quote or its request knows one. */
  trade?: string | null
}

/**
 * What to call a comparison, given the quotes read into it.
 *
 * One quote is named after who sent it, because that is what somebody scanning
 * the list is looking for. Several are named by how many, plus the trade when
 * every quote agrees on one - "3 quotes" is more useful than any one vendor's
 * name, and a trade nobody agrees on is not a fact about the comparison.
 *
 * Returns null when there is nothing better than the placeholder, so the caller
 * writes nothing rather than writing a worse name over a real one.
 */
export function comparisonTitle(quotes: NamedQuote[]): string | null {
  const named = quotes.map(q => q.vendor_name?.trim()).filter((v): v is string => !!v)
  if (!named.length) return null

  if (named.length === 1) return named[0]

  const trades = Array.from(new Set(quotes.map(q => q.trade?.trim()).filter(Boolean)))
  const trade = trades.length === 1 ? trades[0] : null
  return trade ? `${named.length} quotes - ${trade}` : `${named.length} quotes`
}

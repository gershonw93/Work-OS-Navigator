// Does the name somebody typed on an inspection belong to a Directory contact?
//
// `inspections.inspector_name` is FREE TEXT and always has been - the real rows
// read "TW", "Paul Klink", "City Inspections Bureau", "QA Test Inspector". So
// there is no foreign key to follow to a contact card, and the only honest way
// to offer one is to ask whether that exact name IS a contact.
//
// EXACT AND UNAMBIGUOUS OR NOTHING. Same rule as `lib/geocode-match.ts`, which
// refuses a question too vague to have one answer: a fuzzy match here would put
// a link under "TW" pointing at whichever inspector happened to sort first, and
// a wrong contact card is worse than no link at all. Two contacts sharing a
// name is exactly that case, so it returns null for it too.
//
// Pure, so the matching rule is testable without a database or a browser.

export interface LinkableContact {
  id?: string | null
  name?: string | null
  type?: string | null
}

/** Trimmed, case-folded, inner whitespace collapsed. Nothing cleverer. */
const key = (v: unknown): string =>
  typeof v === 'string' ? v.trim().toLowerCase().replace(/\s+/g, ' ') : ''

/**
 * The Directory contact this inspector name refers to, or null.
 *
 * Null is the common answer and is not a failure: "TW" is a set of initials
 * somebody typed at the desk, not a contact anybody filed.
 */
export function inspectorContactId(
  inspectorName: string | null | undefined,
  contacts: LinkableContact[],
): string | null {
  const wanted = key(inspectorName)
  if (!wanted) return null

  const hits = contacts.filter(c => c.id && key(c.name) === wanted)
  // One, or none. Two contacts with one name cannot be told apart, and picking
  // either is the guess this module exists to refuse.
  return hits.length === 1 ? (hits[0].id as string) : null
}

/** Where that contact's card lives. The Directory opens it from this. */
export function contactCardHref(contactId: string): string {
  return `/directory?contact=${encodeURIComponent(contactId)}`
}

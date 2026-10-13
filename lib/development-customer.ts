// ─────────────────────────────────────────────────────────────────────────────
// A development's customer, and its houses.
//
// "why cant i assign the entire job to a customer?" - the Projects list's Edit
// box had a free-text Client field that wrote `projects.client` and nothing
// else (the one-fact-two-homes bug #586 fixed on the create form), and a
// development's houses are separate jobs: naming the customer on the
// development reached none of them. A split cheque can only be ONE QuickBooks
// payment when every house is billed to the same customer, so this is the
// thing that makes that possible.
//
// WHICH HOUSES FOLLOW: one with no customer, or still on the development's old
// one - both mean "whoever the development is for". A house somebody set to a
// DIFFERENT customer was a decision (a lot sold to its own buyer), so it is
// left alone, and named so nobody thinks it moved.
// ─────────────────────────────────────────────────────────────────────────────

export interface HouseCustomer { id: string; name: string; customer_id: string | null }

export function housesToFollow(
  houses: readonly HouseCustomer[], oldCustomerId: string | null,
): { follow: string[]; kept: string[] } {
  const follow: string[] = [], kept: string[] = []
  for (const h of houses) {
    if (!h.customer_id || (oldCustomerId && h.customer_id === oldCustomerId)) follow.push(h.id)
    else kept.push(h.name)
  }
  return { follow, kept }
}

/** What the save did to the houses, for the message after it - or null when there are none to mention. */
export function housesSentence(h: { updated: number; kept: string[] } | undefined | null): string | null {
  if (!h || (!h.updated && !h.kept.length)) return null
  const n = (k: number) => `${k} ${k === 1 ? 'house' : 'houses'}`
  const parts: string[] = []
  if (h.updated) parts.push(`Customer set on ${n(h.updated)} in this development.`)
  if (h.kept.length) parts.push(`Left alone: ${h.kept.length > 3 ? n(h.kept.length) : h.kept.join(', ')} - ${h.kept.length === 1 ? 'it has' : 'they have'} a different customer of ${h.kept.length === 1 ? 'its' : 'their'} own.`)
  return parts.join(' ')
}

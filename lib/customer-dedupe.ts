// Is the customer somebody is about to create already on the list?
//
// FOUND LOOKING AT the demo company, which showed two "QA Client - Weisblum"
// cards. The rows were QA data - created fourteen minutes apart, the second
// with no email, no contact and no projects - but the door they came through
// is real: POST /api/customers inserted whatever it was given, so the New
// Customer form would file the same client twice without a word, and every
// project and invoice after that is split between two cards. It is the ONLY
// place a customer row is created (a project picks an existing customer or
// none; it never makes one), so the guard lives on that route.
//
// Pure, so the rule is tested rather than trusted. Same stance as
// `lib/inspector-link.ts`: a name is compared trimmed, case-folded and
// whitespace-collapsed - exact after that, never fuzzy. "Smith" and "Smith
// Residence" are allowed to be two customers; "smith " and "Smith" are not.

export interface CustomerKey {
  id: string
  name: string | null
  email: string | null
}

const norm = (s: string | null | undefined) => (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * The existing customer this one would duplicate, and which fact matched -
 * or null. An email match counts on its own (one inbox is one client, whatever
 * the card is called); a blank email never matches anything.
 */
export function duplicateCustomer(
  existing: CustomerKey[],
  incoming: { name: string | null | undefined; email?: string | null },
): { customer: CustomerKey; by: 'name' | 'email' } | null {
  const name = norm(incoming.name)
  const email = norm(incoming.email)
  if (email) {
    const hit = existing.find(c => norm(c.email) === email)
    if (hit) return { customer: hit, by: 'email' }
  }
  if (name) {
    const hit = existing.find(c => norm(c.name) === name)
    if (hit) return { customer: hit, by: 'name' }
  }
  return null
}

/** The sentence the New Customer form shows, naming the card that exists. */
export function duplicateCustomerMessage(d: { customer: CustomerKey; by: 'name' | 'email' }): string {
  return d.by === 'email'
    ? `${d.customer.name ?? 'Another customer'} already uses that email. Open that customer instead of adding a second one.`
    : `You already have a customer called ${d.customer.name}. Open that one instead of adding a second.`
}

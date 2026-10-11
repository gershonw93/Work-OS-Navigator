// One conversation per quote invite: the sub who was asked, and the GC who
// asked them. Pure - the routes and both screens ask these, so the rule about
// who may read a thread and what a message may be lives in one place.
//
// WHY THE SUB NEEDS AN ACCOUNT. The quote link needs none, and that stays true
// for pricing. A conversation is different: an answer has to reach somebody,
// and a link with no person behind it has nobody to tell. So the thread opens
// for a signed-in person on the sub's side, and the account is free and only
// ever a VENDOR account - it sees the jobs it is invited to and cannot open a
// job of its own (`read_only` has `projects: view` and nothing else).

export const MESSAGE_MAX = 4000

export interface BidMessage {
  id: string
  side: 'gc' | 'sub'
  author_name: string | null
  body: string
  created_at: string
}

export interface InviteForThread {
  vendor_company_id: string | null
  vendor_email: string | null
}

export interface Viewer {
  companyId: string | null
  /** From the auth server, never from a request body. */
  email: string | null
}

const fold = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()

/**
 * May this signed-in person read and write the sub's side of this thread?
 *
 * Either they belong to the company the invite was sent to, or they are the
 * address it was sent to - the second covers a sub who already had a SyteNav
 * account of their own before this GC ever asked them.
 */
export function canUseThread(invite: InviteForThread, viewer: Viewer): boolean {
  if (invite.vendor_company_id && viewer.companyId && invite.vendor_company_id === viewer.companyId) return true
  const sentTo = fold(invite.vendor_email)
  return !!sentTo && sentTo === fold(viewer.email)
}

/** Why this message cannot be sent, or null. Asked by the box AND the route. */
export function messageProblem(body: unknown): string | null {
  if (typeof body !== 'string' || !body.trim()) return 'Write a message first.'
  if (body.length > MESSAGE_MAX) return `Keep it under ${MESSAGE_MAX.toLocaleString('en-US')} characters - attach a file to your quote for anything longer.`
  return null
}

/**
 * Where to land somebody after they sign in from a quote link, or null.
 *
 * Only ever a quote page. It rides in user metadata and a query string, both
 * of which the person holding the browser can write, so anything else - an
 * absolute URL, `//evil.example`, a path with a dot segment - is refused
 * rather than followed.
 */
export function bidReturnPath(next: unknown): string | null {
  if (typeof next !== 'string') return null
  return /^\/bid\/[A-Za-z0-9_-]{8,128}$/.test(next) ? next : null
}

// Change orders on the client's portal link. Pure: the routes and both screens
// ask these, so what a client may see and say about a change order lives here.
//
// SHARED, NEVER AUTOMATIC: a change order tied to a subcontract carries the
// SUB's price - our cost - so one reaches the client only when somebody presses
// Share (`client_shared_at`).
//
// WHEN THE CLIENT'S YES IS THE DECISION: "let client approval count for non-sub
// change orders". A change order with no subcontract is the owner's own change
// to their own contract - the client IS the party who agrees to it, so their
// approval approves it (`approvalCounts`). One tied to a subcontract also folds
// money into a SUB's contract, which is the GC's commitment to make, so there
// the client's answer stays a record beside the GC's decision. A decline is a
// record either way: the GC may revise and re-share rather than close it.
//
// AND A YES THAT MOVES MONEY NEEDS A PERSON BEHIND IT. The link alone is a
// bearer token that gets forwarded; an approval requires the client to sign in
// with a code sent to the address on their customer record
// (`lib/portal-login.ts`), and the address is stored with the answer.

export type ClientResponse = 'approved' | 'declined'

export const RESPONSE_NOTE_MAX = 1000

/** Whether the client's approval approves this change order on its own. */
export function approvalCounts(co: { subcontract_id: string | null }): boolean {
  return !co.subcontract_id
}

export interface CoForClient {
  status: string
  client_shared_at: string | null
}

/**
 * Why the client may not answer this change order, or null. Asked by the
 * portal's buttons AND the route. They can change their mind until the GC
 * decides; once approved or rejected, a different answer is a conversation,
 * not a button - the thread is right there.
 */
export function clientResponseProblem(co: CoForClient | null, response: unknown, note: unknown): string | null {
  if (!co || !co.client_shared_at) return 'This change order is not on your page.'
  if (response !== 'approved' && response !== 'declined') return 'Approve or decline?'
  if (co.status !== 'pending') {
    return `This change order has already been ${co.status === 'approved' ? 'approved' : 'closed'} - ask a question below if something needs another look.`
  }
  if (note != null && (typeof note !== 'string' || note.length > RESPONSE_NOTE_MAX)) return `Keep the note under ${RESPONSE_NOTE_MAX} characters.`
  return null
}

/** What the client's answer says, for the GC's card: "Approved by Sam on Thu Oct 15". */
export function responseLine(co: { client_response: string | null; client_response_name: string | null }, when: string | null): string | null {
  if (!co.client_response) return null
  const verb = co.client_response === 'approved' ? 'Client approved' : 'Client declined'
  return [verb, co.client_response_name ? `(${co.client_response_name})` : null, when ? `on ${when}` : null].filter(Boolean).join(' ')
}

/** The client's own words for where a change order stands. */
export function clientCoStatus(co: { status: string; client_response: string | null }): string {
  if (co.status === 'approved') return 'Approved'
  if (co.status === 'rejected') return 'Withdrawn'
  if (co.client_response === 'approved') return 'You approved this'
  if (co.client_response === 'declined') return 'You declined this'
  return 'Waiting on your answer'
}

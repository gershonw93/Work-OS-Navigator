// A client's questions about one selection, and the GC's answers.
//
// "can you communicate w a question like when a sub sends a question on quote
// submission? ... i think we need it all over" - this is the client portal's
// first door, on selections.
//
// PURE. The two routes (the client's, by portal token; the GC's, signed in) and
// both screens ask these, so the rules live in one place.
//
// WHY THE CLIENT NEEDS NO ACCOUNT, when a sub on a quote does: the sub's quote
// link has nobody behind it, but the job's client does - their address is on
// the customer record - so an answer can reach them by email with the same
// link they already hold. Making a homeowner create a login to ask "does the
// tile come in grey?" is the friction that sends the question back to a text
// message nobody else can see.

import { messageProblem, MESSAGE_MAX } from './bid-thread'

export { messageProblem, MESSAGE_MAX }

export type SelectionSide = 'client' | 'gc'

export interface SelectionMessage {
  id: string
  side: SelectionSide
  author_name: string | null
  body: string
  created_at: string
}

/**
 * How many messages a portal link may post in an hour, across every selection
 * on the job. The link is the only credential and it can be forwarded; a cap
 * is what stops a forwarded link becoming a way to fill the GC's inbox. Far
 * above what a person asking questions ever reaches.
 */
export const CLIENT_MESSAGES_PER_HOUR = 30

/** Refuse a client post over the cap, or null. The route counts; this decides. */
export function clientRateProblem(sentInLastHour: number): string | null {
  return sentInLastHour >= CLIENT_MESSAGES_PER_HOUR
    ? 'That is a lot of messages in one go - give us a little while to catch up, or call us.'
    : null
}

/**
 * The thread's shape without its words: how many messages, and whether the
 * client spoke last - the one that wants an answer from the GC. The board's row
 * says "Client asked a question" off this, and the portal says "We replied".
 */
export function selectionThreadSummary(
  messages: { side: string; created_at: string }[] | null | undefined,
): { count: number; waitingOnGc: boolean; waitingOnClient: boolean } {
  const list = [...(messages ?? [])].sort((a, b) => a.created_at.localeCompare(b.created_at))
  const last = list[list.length - 1]
  return { count: list.length, waitingOnGc: last?.side === 'client', waitingOnClient: last?.side === 'gc' }
}

/** The name a client message is signed with: what they typed, else the job's client. */
export function clientAuthor(typed: unknown, projectClient: string | null | undefined): string {
  const t = typeof typed === 'string' ? typed.trim().slice(0, 120) : ''
  return t || (projectClient ?? '').trim() || 'The client'
}

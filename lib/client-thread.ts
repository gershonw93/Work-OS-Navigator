// A client's questions from their portal link, and the GC's answers.
//
// "can you communicate w a question like when a sub sends a question on quote
// submission? ... i think we need it all over" - then "do the client portal
// threads, start with selections", then "make em all".
//
// PURE. Every door - the client's (by portal token) and the GC's (signed in) -
// and every screen asks these, so what a client may ask about, who answers it
// and who is told live in ONE table here (`SUBJECTS`) rather than once per
// screen. A fifth thing to ask about is one entry, not a fifth copy.
//
// WHY THE CLIENT NEEDS NO ACCOUNT, when a sub on a quote does: a quote link has
// nobody behind it, but a job's client does - their address is on the customer
// record - so an answer reaches them by email with the link they already hold.
// Making a homeowner create a login to ask "what is this charge?" is the
// friction that sends the question back to a text nobody else can see.

import { messageProblem, MESSAGE_MAX } from './bid-thread'

export { messageProblem, MESSAGE_MAX }

export type ClientSubject = 'selection' | 'invoice' | 'payment_request' | 'project'
export type ClientSide = 'client' | 'gc'

export interface ClientMessage {
  id: string
  side: ClientSide
  author_name: string | null
  body: string
  created_at: string
}

export interface SubjectRule {
  /** The client_messages column naming the record, or null for the job itself. */
  column: 'selection_id' | 'client_invoice_id' | 'payment_request_id' | null
  /**
   * The permission that answers it - the same one that owns the record. Billing
   * questions go to whoever can see Billing the client, never to the whole crew.
   */
  permission: 'selections' | 'payments' | 'client-portal'
  /** The catalog type the GC is told under. */
  notifyType: 'selection_question' | 'client_billing_question' | 'client_question'
  /** Where on the job the GC answers it. */
  tab: 'selections' | 'payments' | 'overview'
  /** The client's page that holds it, relative to /portal/<token>. */
  portalPath: '' | '/selections'
}

export const SUBJECTS: Record<ClientSubject, SubjectRule> = {
  selection: { column: 'selection_id', permission: 'selections', notifyType: 'selection_question', tab: 'selections', portalPath: '/selections' },
  invoice: { column: 'client_invoice_id', permission: 'payments', notifyType: 'client_billing_question', tab: 'payments', portalPath: '' },
  payment_request: { column: 'payment_request_id', permission: 'payments', notifyType: 'client_billing_question', tab: 'payments', portalPath: '' },
  project: { column: null, permission: 'client-portal', notifyType: 'client_question', tab: 'overview', portalPath: '' },
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * What a request says it is asking about, checked. A record subject needs a
 * real id; the job needs none (and any id sent with it is ignored). Anything
 * else is null - the route refuses rather than guessing.
 */
export function parseSubject(subject: unknown, id: unknown): { subject: ClientSubject; id: string | null } | null {
  if (typeof subject !== 'string' || !(subject in SUBJECTS)) return null
  const s = subject as ClientSubject
  if (SUBJECTS[s].column === null) return { subject: s, id: null }
  return typeof id === 'string' && UUID.test(id) ? { subject: s, id } : null
}

/**
 * How many messages a portal link may post in an hour, across the whole job.
 * The link is the only credential and it can be forwarded; a cap is what stops
 * a forwarded link becoming a way to fill the GC's inbox.
 */
export const CLIENT_MESSAGES_PER_HOUR = 30

export function clientRateProblem(sentInLastHour: number): string | null {
  return sentInLastHour >= CLIENT_MESSAGES_PER_HOUR
    ? 'That is a lot of messages in one go - give us a little while to catch up, or call us.'
    : null
}

/**
 * The thread's shape without its words: how many messages, and who spoke last.
 * A row says "client asked a question" off `waitingOnGc`; the portal says "We
 * replied" off `waitingOnClient`. Decided by time, not by row order.
 */
export function threadShape(
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

/** A client_messages row with its subject columns, for grouping into threads. */
export interface MessageRow {
  side: string
  created_at: string
  selection_id?: string | null
  client_invoice_id?: string | null
  payment_request_id?: string | null
}

/** Which thread a row belongs to. */
export function subjectOf(m: MessageRow): { subject: ClientSubject; id: string | null } {
  if (m.selection_id) return { subject: 'selection', id: m.selection_id }
  if (m.client_invoice_id) return { subject: 'invoice', id: m.client_invoice_id }
  if (m.payment_request_id) return { subject: 'payment_request', id: m.payment_request_id }
  return { subject: 'project', id: null }
}

/**
 * The threads on a job where the client spoke last - the ones waiting on us.
 * The project Overview counts these, so a question asked on an invoice is not
 * only findable by somebody who happens to open Billing.
 */
export function threadsWaitingOnGc(rows: MessageRow[]): { subject: ClientSubject; id: string | null }[] {
  const byThread = new Map<string, MessageRow[]>()
  for (const r of rows) {
    const s = subjectOf(r)
    const k = `${s.subject}:${s.id ?? ''}`
    byThread.set(k, [...(byThread.get(k) ?? []), r])
  }
  return Array.from(byThread.values())
    .filter(list => threadShape(list).waitingOnGc)
    .map(list => subjectOf(list[0]))
}

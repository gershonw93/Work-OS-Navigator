/**
 * What a bill's detail screen SAYS, worked out away from the screen.
 *
 * Two screens share this shape: a sub's bill to you (Bills from subs) and your
 * invoice to the client (Billing the client). Both are "a document asking for
 * money, moving through steps", so both get the same header - who, how much,
 * when - and the same track of steps underneath it. The steps are DERIVED from
 * the row, never stored: a step that reads "Approved" is lit because
 * `approved_at` exists, not because somebody ticked it.
 *
 * Pure and tested (`lib/__tests__/bill-view.ts`).
 */

import { formatDate } from './dates'

export interface Step {
  label: string
  done: boolean
  /** The date (and who) under the step, or what it is waiting on. */
  note: string
}

export interface Countdown {
  text: string
  /** `late` is red, `soon` is today or tomorrow, `plain` says nothing extra. */
  tone: 'late' | 'soon' | 'plain'
}

const DAY = 86400000

/**
 * "in 7 days", "today", "3 days overdue" - the answer beside a due date.
 *
 * Anchored to LOCAL midnight, like `lib/expiry.ts`: due today is still on
 * time today. A date that has passed is OVERDUE, never silence - the reason
 * this is a function and not a `null` for the past.
 */
export function dueCountdown(due: string | null | undefined, now: Date = new Date()): Countdown | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(due ?? ''))
  if (!m) return null
  const day = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diff = Math.round((day.getTime() - today.getTime()) / DAY)
  if (diff < 0) {
    const n = -diff
    return { text: `${n} ${n === 1 ? 'day' : 'days'} overdue`, tone: 'late' }
  }
  if (diff === 0) return { text: 'due today', tone: 'soon' }
  if (diff === 1) return { text: 'due tomorrow', tone: 'soon' }
  return { text: `in ${diff} days`, tone: 'plain' }
}

const day = (v: string | null | undefined) => formatDate(v)
const short = (v: string | null | undefined) => formatDate(v, { month: 'short', day: 'numeric' })

// ── A sub's bill to you ─────────────────────────────────────────────────────

export interface SubBillFacts {
  status: string
  created_at: string
  approved_at: string | null
  approved_by_name: string | null
  sent_at: string | null
  /** Written by the status move to paid (lib/writes/sub-bill.ts). */
  paid_at?: string | null
}

/**
 * Received -> Approved -> Queued -> Paid.
 *
 * Queued is OPTIONAL, and says so: plenty of shops approve and pay the same
 * day, and a track that showed a gap there would be calling a normal bill
 * unfinished. A bill paid without being queued reads "Skipped", not "Not yet".
 */
export function subBillSteps(b: SubBillFacts): Step[] {
  const approved = b.status !== 'pending_approval' && b.status !== 'rejected'
  const paid = b.status === 'paid'
  const queued = b.status === 'sent' || (paid && !!b.sent_at)
  return [
    { label: 'Received', done: true, note: day(b.created_at) },
    {
      label: 'Approved',
      done: approved,
      note: approved
        ? [b.approved_at ? short(b.approved_at) : null, b.approved_by_name].filter(Boolean).join(' · ') || 'Approved'
        : 'Waiting on you',
    },
    {
      label: 'Queued',
      done: queued,
      note: queued ? (b.sent_at ? short(b.sent_at) : 'Queued') : paid ? 'Skipped' : 'Optional',
    },
    // The day it was marked paid. A bill paid before that column was written
    // says that it was, rather than inventing when.
    { label: 'Paid', done: paid, note: paid ? (b.paid_at ? short(b.paid_at) : 'Paid') : 'Not yet' },
  ]
}

export interface SubBillDocFacts {
  status: string
  document_url?: string | null
  lien_waiver_url: string | null
  lien_waiver_type: string | null
}

export interface DocRow {
  key: 'invoice' | 'conditional' | 'unconditional'
  label: string
  /** On file - the link to it, when there is one. */
  url: string | null
  /** What it is for, or what is wrong. */
  hint: string
  /** The hint is a warning: this is owed now. */
  warn: boolean
  /** Covered by another document, so there is nothing to upload here. */
  covered: boolean
}

/**
 * The three pieces of paper behind a sub's bill.
 *
 * A bill holds ONE lien waiver (`lien_waiver_url` + its type), so the
 * conditional and the unconditional are one slot read two ways. An
 * unconditional on file COVERS the conditional - it is the stronger release -
 * so that row is satisfied, not missing. Counting it as missing would ask for
 * a document nobody needs any more.
 */
export function subBillDocs(b: SubBillDocFacts): { rows: DocRow[]; onFile: number } {
  const paid = b.status === 'paid'
  const waiver = b.lien_waiver_url ?? null
  const cond = waiver && b.lien_waiver_type === 'conditional' ? waiver : null
  // An untyped waiver predates the type column; the old screen called it
  // unconditional, so this does too.
  const uncond = waiver && b.lien_waiver_type !== 'conditional' ? waiver : null
  const rows: DocRow[] = [
    {
      key: 'invoice', label: 'Vendor invoice', url: b.document_url ?? null,
      hint: 'The bill the sub sent you', warn: false, covered: false,
    },
    {
      key: 'conditional', label: 'Conditional waiver', url: cond,
      hint: uncond ? 'Covered by the unconditional' : 'Get this before you pay',
      warn: !cond && !uncond && !paid, covered: !!uncond,
    },
    {
      key: 'unconditional', label: 'Unconditional waiver', url: uncond,
      hint: paid && !uncond ? 'Payment released - this is owed now' : 'Collect after payment clears',
      warn: paid && !uncond, covered: false,
    },
  ]
  return { rows, onFile: rows.filter(r => r.url || r.covered).length }
}

/** Which of the three markup answers a bill is on. */
export function markupMode(b: { markup_pct?: number | string | null; markup_excluded?: boolean | null }): 'cost' | 'project' | 'custom' {
  if (b.markup_excluded) return 'cost'
  return b.markup_pct === null || b.markup_pct === undefined || b.markup_pct === '' ? 'project' : 'custom'
}

// ── Your invoice to the client ──────────────────────────────────────────────

export interface ClientInvoiceFacts {
  status: string
  issue_date: string
  sent_at?: string | null
  paid_at?: string | null
  viewed_at: string | null
  last_viewed_at: string | null
  view_count: number | null
  settlement: { state?: string; paid?: number; total?: number; amount?: number } | null
}

/**
 * Drafted -> Issued -> Opened -> Paid.
 *
 * Paid is a SUM, not a flag (`lib/invoice-settlement.ts`): part paid lights
 * nothing and says how much has come in. Opened is the client's link being
 * read, which is the one thing the GC cannot otherwise see.
 */
export function clientInvoiceSteps(b: ClientInvoiceFacts, money: (n: number) => string): Step[] {
  const issued = b.status === 'sent' || b.status === 'paid' || b.status === 'void'
  const opened = !!(b.last_viewed_at ?? b.viewed_at)
  const paid = b.status === 'paid' || b.settlement?.state === 'paid'
  const part = !paid && b.settlement?.state === 'partly_paid'
  const views = Number(b.view_count) || 0
  return [
    { label: 'Drafted', done: true, note: day(b.issue_date) },
    { label: 'Issued', done: issued, note: issued ? (b.sent_at ? short(b.sent_at) : 'Issued') : 'Not yet' },
    {
      label: 'Opened',
      done: opened,
      note: opened
        ? `${short(b.last_viewed_at ?? b.viewed_at)}${views > 1 ? ` · ${views} times` : ''}`
        : issued ? 'Not yet' : 'Once issued',
    },
    {
      label: 'Paid',
      done: paid,
      note: paid
        ? (b.paid_at ? short(b.paid_at) : 'Paid')
        : part
          ? `${money(Number(b.settlement?.paid ?? b.settlement?.amount ?? 0))} of ${money(Number(b.settlement?.total ?? 0))}`
          : 'Not yet',
    },
  ]
}

// ── A change order ──────────────────────────────────────────────────────────

export interface ChangeOrderFacts {
  status: string
  created_at: string
  applied_to_contract?: boolean | null
  client_shared_at?: string | null
  client_response?: string | null
  client_response_at?: string | null
}

/**
 * Raised -> On the client's link -> Client answered -> Approved (or Rejected).
 *
 * Sharing is OPTIONAL - plenty of change orders are agreed on site and never go
 * near the portal - so an unshared one reads "Optional", never "Not yet", and a
 * decision made without it reads "Skipped". The client's answer is a record
 * beside the decision, not the decision: it lights its own step and nothing
 * else.
 */
export function changeOrderSteps(c: ChangeOrderFacts): Step[] {
  const decided = c.status === 'approved' || c.status === 'rejected'
  const shared = !!c.client_shared_at
  const answered = !!c.client_response
  return [
    { label: 'Raised', done: true, note: day(c.created_at) },
    {
      // Short words: four columns share 340px on a phone.
      label: 'Shared',
      done: shared,
      note: shared ? short(c.client_shared_at) : decided ? 'Skipped' : 'Optional',
    },
    {
      label: 'Answered',
      done: answered,
      note: answered
        ? `${c.client_response === 'approved' ? 'Approved' : 'Declined'}${c.client_response_at ? ` ${short(c.client_response_at)}` : ''}`
        : shared ? 'Waiting on them' : decided ? 'Skipped' : 'Once shared',
    },
    {
      label: c.status === 'rejected' ? 'Rejected' : 'Approved',
      done: decided,
      note: c.status === 'approved'
        ? (c.applied_to_contract ? 'Added to the contract' : 'Approved')
        : c.status === 'rejected' ? 'Not going ahead' : 'Waiting on you',
    },
  ]
}

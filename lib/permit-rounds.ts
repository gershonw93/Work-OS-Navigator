// ─────────────────────────────────────────────────────────────────────────────
// Where a permit stands, worked out from its history.
//
// THE PROBLEM. A permit was one row with one status. "Pending" meant both
// "the city has had it three weeks" and "the city sent it back and we have
// not fixed the energy calc", and those are the only two facts anybody chasing
// a permit wants. Each submission and each answer overwrote the last, so there
// was no answer to "when did it go in" or "what did they ask for", and on a
// development that history lived in somebody's inbox.
//
// THE SHAPE. A permit has ROUNDS (one submission and the answer to it) and
// ITEMS (one thing the reviewer asked for). Who has it now is DERIVED:
//
//   * a round with no answer        -> with THEM, since the day it went in;
//   * an answer of corrections      -> with US while any item is open, and
//                                      "ready to resubmit" once none are;
//   * rejected                      -> with US;
//   * approved                      -> done.
//
// Never stored, because a stored "ball in court" column is a second home for
// a fact the rounds already hold, and the first time they disagree the screen
// lies. Pure, so the permit list, the development board and the routes ask
// the same function.
// ─────────────────────────────────────────────────────────────────────────────

import { GRANTED_STATUSES, permitProblem, type PermitFacts } from './permit-rules'
import { expiredAgo, expiryLabel, expiryState } from './expiry'

export const OUTCOMES = ['approved', 'corrections', 'rejected'] as const
export type Outcome = typeof OUTCOMES[number]

export const OUTCOME_LABEL: Record<Outcome, string> = {
  approved: 'Approved',
  corrections: 'Corrections needed',
  rejected: 'Rejected',
}

/**
 * Past this many days with no answer and no promised date, a permit reads as
 * overdue for a chase. Three weeks is long enough that a normal plan review is
 * not flagged and short enough that a file lost on somebody's desk is.
 */
export const CHASE_AFTER_DAYS = 21

export interface RoundFile { name: string; url: string; type?: string | null; size?: number | null }

export interface PermitRound {
  id: string
  permit_id: string
  submitted_on: string
  submitted_note?: string | null
  expected_by?: string | null
  sent_files?: RoundFile[] | null
  outcome?: Outcome | null
  outcome_on?: string | null
  outcome_note?: string | null
  received_files?: RoundFile[] | null
  created_by_name?: string | null
  outcome_by_name?: string | null
  created_at?: string | null
}

export interface PermitItem {
  id: string
  permit_id: string
  round_id?: string | null
  label: string
  /** The file(s) that close the item - the revised site plan, the energy calc. */
  files?: RoundFile[] | null
  done_at?: string | null
  done_by_name?: string | null
  created_at?: string | null
}

/** A Sharing link sent from a permit, and what came back on it. */
export interface PermitShare {
  id: string
  permit_id: string
  name: string
  recipient_name?: string | null
  recipient_email?: string | null
  status?: string | null
  created_at: string
  viewed_at?: string | null
  responded_at?: string | null
  revoked_at?: string | null
  uploads: (RoundFile & { id: string; note?: string | null; created_at: string })[]
}

/**
 * Files that came back through a link and are not yet part of any answer -
 * what "Record their answer" offers to use, so the expeditor's upload does not
 * have to be downloaded and dropped in again.
 */
export function unusedUploads(shares: PermitShare[], rounds: Pick<PermitRound, 'received_files'>[]): PermitShare['uploads'] {
  const used = new Set<string>()
  for (const r of rounds) for (const f of r.received_files ?? []) used.add(f.url)
  return shares.flatMap(s => s.uploads).filter(u => !used.has(u.url))
}

/** Oldest first: the order a thread is read in. Same-day rounds by when they were typed. */
export function sortRounds<T extends Pick<PermitRound, 'submitted_on' | 'created_at'>>(rounds: T[]): T[] {
  return [...rounds].sort((a, b) =>
    a.submitted_on === b.submitted_on
      ? String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      : a.submitted_on.localeCompare(b.submitted_on))
}

export const openRound = <T extends Pick<PermitRound, 'outcome'>>(rounds: T[]): T | null =>
  rounds.find(r => !r.outcome) ?? null

export const everApproved = (rounds: Pick<PermitRound, 'outcome'>[]) =>
  rounds.some(r => r.outcome === 'approved')

/** Whole days from one YYYY-MM-DD to another, as calendar dates (no clock, no zone). */
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10))
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/** Today as YYYY-MM-DD in the reader's own calendar. */
export function todayIso(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** "Oct 3" - a date-only string spelled from a fixed table, so server and browser agree. */
export function shortDay(iso: string): string {
  return `${SHORT_MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}`
}

export type Court = 'none' | 'them' | 'us' | 'done'
export type StandingTone = 'neutral' | 'info' | 'warn' | 'danger' | 'success'

export interface Standing {
  court: Court
  /** The sentence for a permit's own panel: "With Lakewood Township since Oct 3 (12 days)". */
  label: string
  /** The few words a board cell has room for: "City · 12d", "3 to fix". */
  short: string
  tone: StandingTone
  /** With them past the promised date, or past CHASE_AFTER_DAYS with no promise. */
  chase: boolean
  openItems: number
  rounds: number
}

/** "Oct 3", with the year only when it is not this year's. */
export function dayLabel(iso: string, today: string): string {
  return iso.slice(0, 4) === today.slice(0, 4) ? shortDay(iso) : `${shortDay(iso)}, ${iso.slice(0, 4)}`
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

export type Stage = 'draft' | 'fix' | 'city' | 'renew' | 'issued' | 'closed'
export type Group = 'you' | 'city' | 'iss'
/** The four steps every permit walks, drawn as the bar on a row and the path in the panel. */
export const STEP_NAMES = ['Apply', 'City review', 'Issued', 'Closed out'] as const
const STEP_OF: Record<Stage, number> = { draft: 0, fix: 1, city: 1, renew: 2, issued: 2, closed: 3 }

export interface PermitFactsForStage {
  status?: string | null
  issuing_authority?: string | null
  expiry_date?: string | null
  issued_date?: string | null
  created_at?: string | null
}

export interface PermitStage {
  stage: Stage
  /** Which group of the list it sits in: your move, with the city, or issued. */
  group: Group
  /** 0-3 along Apply, City review, Issued, Closed out. */
  step: number
  rejected: boolean
  /** The row's sentence: what happens next. */
  next: string
  time: string
  timeTone: '' | 'warn' | 'bad'
  /** Lower comes first within its group: most urgent, or waiting longest. */
  sortKey: number
  /** The panel's next-step card. */
  head: string
  sub: string
  pill: string
  /** With them past the promised date, or past CHASE_AFTER_DAYS with no promise. */
  chase: boolean
  /** Who it goes to - the issuing authority, or "the reviewer". */
  who: string
  /** The asks this round is about - what the checklist in the panel shows. */
  asks: PermitItem[]
  openAsks: number
  waiting: PermitRound | null
  rounds: PermitRound[]
}

/**
 * Where a permit stands, worked out from its history - the ONE answer the list,
 * the panel and the development board all read. `status` is the permit's own
 * column, read only where there is no history to read instead (every permit
 * filed before rounds existed still has to say something true) and for the two
 * facts no round can hold: an expiry date that has passed, and closed out.
 */
export function permitStage(
  permit: PermitFactsForStage,
  roundsIn: PermitRound[],
  items: PermitItem[],
  today: string,
): PermitStage {
  const rounds = sortRounds(roundsIn)
  const who = (permit.issuing_authority ?? '').trim() || 'the reviewer'
  const waiting = openRound(rounds)
  const last = rounds.length ? rounds[rounds.length - 1] : null
  const status = permit.status ?? ''
  // Expiry is asked of lib/expiry.ts - the one answer, anchored to local
  // midnight, so "expires today" is still good today and the morning after it
  // reads Expired whatever the row was last set to.
  const todayDate = new Date(`${today}T12:00:00`)
  const expiry = expiryState(permit.expiry_date, { today: todayDate })
  const lapsed = expiry === 'expired'
  const granted = GRANTED_STATUSES.indexOf(status) !== -1

  // The asks this round is about: what the last answer asked for, anything
  // typed in since, and anything still open from before - a list that hid an
  // unfinished item because a new round started would be lying about the work.
  const asks = items.filter(i =>
    !i.done_at
    || !last
    || i.round_id === last.id
    || (!i.round_id && String(i.created_at ?? '') >= String(last.created_at ?? '')))
  const openAsks = asks.filter(i => !i.done_at).length

  let stage: Stage
  let rejected = false
  if (status === 'closed') stage = 'closed'
  else if (waiting) stage = 'city'
  else if (!last) {
    if (granted) stage = lapsed ? 'renew' : 'issued'
    else if (status === 'expired') stage = 'renew'
    else if (status === 'rejected') { stage = 'fix'; rejected = true }
    else if (openAsks) stage = 'fix'
    else stage = 'draft'
  } else if (everApproved(rounds) && last.outcome !== 'corrections') {
    // A rejected REVISION does not un-issue an approved permit.
    stage = lapsed ? 'renew' : 'issued'
  } else if (last.outcome === 'rejected') { stage = 'fix'; rejected = true }
  else stage = 'fix'

  const group: Group = stage === 'city' ? 'city' : stage === 'issued' || stage === 'closed' ? 'iss' : 'you'
  const base = { stage, group, step: STEP_OF[stage], rejected, who, asks, openAsks, waiting, rounds }
  const created = (permit.created_at ?? '').slice(0, 10)

  if (stage === 'city') {
    const w = waiting as PermitRound
    const days = Math.max(0, daysBetween(w.submitted_on, today))
    const promised = w.expected_by ?? null
    const chase = promised ? daysBetween(promised, today) > 0 : days >= CHASE_AFTER_DAYS
    const n = rounds.length
    return {
      ...base, chase, pill: 'With them',
      next: `Waiting on round ${n} answer`,
      time: days === 0 ? 'Sent today' : chase
        ? (promised ? `${plural(days, 'day')}, was due ${dayLabel(promised, today)}` : `${days} days, follow up`)
        : plural(days, 'day'),
      timeTone: chase ? 'warn' : '',
      sortKey: -days,
      head: chase ? `${plural(days, 'day')} with ${who}. Follow up.` : `Waiting on ${who}`,
      sub: `Round ${n} sent ${dayLabel(w.submitted_on, today)}${days ? `, ${plural(days, 'day')} ago.` : ', today.'}`
        + (promised ? ` Answer expected ${dayLabel(promised, today)}.` : ''),
    }
  }

  if (stage === 'renew') {
    const ago = permit.expiry_date ? Math.max(0, daysBetween(permit.expiry_date, today)) : 0
    return {
      ...base, chase: false, pill: 'Your move',
      next: 'Renew it, it expired',
      time: expiredAgo(permit.expiry_date, todayDate) ?? 'Expired',
      timeTone: 'bad',
      sortKey: -100000 - ago,
      head: permit.expiry_date ? `Expired ${dayLabel(permit.expiry_date, today)}. Renew it.` : 'Expired. Renew it.',
      sub: `Send the renewal to ${who}.`,
    }
  }

  if (stage === 'fix') {
    const back = last?.outcome_on ?? null
    const days = back ? Math.max(0, daysBetween(back, today)) : 0
    const head = rejected && !asks.length ? 'Rejected. Fix it and send it back.'
      : !asks.length ? 'Add what they asked for'
      : openAsks ? `Fix ${plural(openAsks, 'thing')}, then send it back`
      : 'All fixed. Send it back.'
    return {
      ...base, chase: false, pill: 'Your move',
      next: rejected && !asks.length ? 'Rejected, fix it and resubmit'
        : !asks.length ? 'Add what they asked for'
        : openAsks ? `Fix ${plural(openAsks, 'thing')} and send it back`
        : 'All fixed, send it back',
      time: back ? (days === 0 ? 'Back today' : `Back ${plural(days, 'day')}`) : '',
      timeTone: days >= 14 ? 'warn' : '',
      sortKey: -50000 - days,
      head,
      sub: back ? `${who} ${rejected ? 'rejected it' : 'answered'} ${dayLabel(back, today)}.` : `${who} sent it back.`,
    }
  }

  if (stage === 'draft') {
    const days = created ? Math.max(0, daysBetween(created, today)) : 0
    return {
      ...base, chase: false, pill: 'Your move',
      next: 'Send the application',
      time: created ? `Added ${dayLabel(created, today)}` : '',
      timeTone: '',
      sortKey: -days,
      head: 'Send the application',
      sub: `Nothing is logged as sent to ${who}. If it already went in, log the day it did.`,
    }
  }

  const approvedRound = [...rounds].reverse().find(r => r.outcome === 'approved')
  const issuedOn = permit.issued_date ?? approvedRound?.outcome_on ?? null
  if (stage === 'closed') {
    return {
      ...base, chase: false, pill: 'Closed',
      next: 'Closed out', time: issuedOn ? `Issued ${dayLabel(issuedOn, today)}` : '', timeTone: '',
      sortKey: 1_000_000,
      head: 'Closed out', sub: 'Nothing left to do on this one.',
    }
  }
  return {
    ...base, chase: false, pill: 'Issued',
    // Inside the expiry window the row warns before the renewal is due, and
    // says the date in the column that is coloured.
    next: expiry === 'soon' ? 'Expiring soon, plan the renewal' : (expiryLabel(permit.expiry_date, { today: todayDate }) ?? 'No expiry'),
    time: expiry === 'soon' ? (expiryLabel(permit.expiry_date, { today: todayDate }) as string)
      : issuedOn ? `Issued ${dayLabel(issuedOn, today)}` : 'Issued',
    timeTone: expiry === 'soon' ? 'warn' : '',
    sortKey: permit.expiry_date ? daysBetween(today, permit.expiry_date) : 500_000,
    head: issuedOn ? `Issued ${dayLabel(issuedOn, today)}` : 'Issued',
    sub: permit.expiry_date ? `Nothing to do. Expires ${dayLabel(permit.expiry_date, today)}.` : 'Nothing to do.',
  }
}

/**
 * The few words a development board cell has room for, and the filter it
 * answers to - derived from `permitStage`, never computed a second way.
 */
export function permitStanding(
  permit: PermitFactsForStage,
  rounds: PermitRound[],
  items: PermitItem[],
  today: string,
): Standing {
  const st = permitStage(permit, rounds, items, today)
  const court: Court = st.stage === 'draft' ? 'none'
    : st.group === 'city' ? 'them' : st.group === 'iss' ? 'done' : 'us'
  const days = st.waiting ? Math.max(0, daysBetween(st.waiting.submitted_on, today)) : 0
  const short = st.stage === 'draft' ? 'Not sent'
    : st.stage === 'city' ? `With city · ${days}d`
    : st.stage === 'renew' ? 'Renew'
    : st.stage === 'issued' ? 'Issued'
    : st.stage === 'closed' ? 'Closed'
    : st.openAsks ? `${st.openAsks} to fix`
    : st.asks.length ? 'Resubmit'
    : st.rejected ? 'Rejected' : 'Add asks'
  const tone: StandingTone = st.stage === 'draft' ? 'neutral'
    : st.stage === 'city' ? (st.chase ? 'warn' : 'info')
    : st.stage === 'renew' || (st.rejected && !st.asks.length) ? 'danger'
    : st.group === 'iss' ? 'success' : 'warn'
  return { court, label: st.head, short, tone, chase: st.chase, openItems: st.openAsks, rounds: rounds.length }
}

// ── What each door refuses ──────────────────────────────────────────────────

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export interface SubmitInput {
  submitted_on?: string | null
  expected_by?: string | null
}

/** Asked by the dialog AND the route (single and bulk) before a round is written. */
export function submitProblem(input: SubmitInput, rounds: Pick<PermitRound, 'outcome' | 'submitted_on'>[]): string | null {
  if (!isDate(input.submitted_on)) return 'Add the date it was submitted.'
  if (input.expected_by && !isDate(input.expected_by)) return 'The answer-expected date is not a date.'
  if (input.expected_by && input.expected_by < input.submitted_on) {
    return 'The answer cannot be expected before it was submitted.'
  }
  const waiting = openRound(rounds)
  if (waiting) {
    return `It is already with the reviewer (submitted ${shortDay(waiting.submitted_on)}). Record their answer first.`
  }
  return null
}

export interface OutcomeInput {
  outcome?: string | null
  outcome_on?: string | null
  /** The corrections asked for, one per entry. */
  items?: string[] | null
  /** An approval names the permit: its number and the day it was issued. */
  permit_number?: string | null
  issued_date?: string | null
}

/**
 * Asked by the dialog AND the route before an answer is recorded.
 * `permit` is the permit as stored, so an approval is checked by the same
 * `permitProblem` that guards the Edit form - a status that claims something
 * carries it.
 */
export function outcomeProblem(
  input: OutcomeInput,
  round: Pick<PermitRound, 'outcome' | 'submitted_on'> | null,
  permit: PermitFacts,
): string | null {
  if (!round) return 'There is no submission waiting on an answer.'
  if (round.outcome) return 'That submission already has an answer.'
  if (!input.outcome || (OUTCOMES as readonly string[]).indexOf(input.outcome) === -1) {
    return 'Pick what they said: approved, corrections needed or rejected.'
  }
  if (!isDate(input.outcome_on)) return 'Add the date they answered.'
  if (input.outcome_on < round.submitted_on) {
    return `They cannot have answered before it was submitted (${shortDay(round.submitted_on)}).`
  }
  // Corrections WITHOUT a list is allowed: the answer is usually recorded the
  // moment the letter arrives, and the list is typed after reading it. The
  // permit then says "Add what they asked for" until somebody does.
  if (input.outcome === 'approved') {
    const after = {
      ...permit,
      status: 'approved',
      permit_number: input.permit_number ?? permit.permit_number,
      issued_date: input.issued_date ?? permit.issued_date,
    }
    return permitProblem(after)
  }
  return null
}

/** Trimmed, de-blanked, de-duplicated - a pasted list carries empty lines and bullets. */
export function cleanItems(items: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of items ?? []) {
    const label = String(raw).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()
    const key = label.toLowerCase()
    if (!label || seen.has(key)) continue
    seen.add(key)
    out.push(label)
  }
  return out
}

// ── The status column, now that rounds exist ────────────────────────────────

export const ALL_STATUSES = ['pending', 'approved', 'active', 'recorded', 'expired', 'rejected', 'closed'] as const

/**
 * The statuses a permit may be SET to by hand. With no history, all of them -
 * that is every permit filed before rounds. Once rounds exist they decide the
 * review half (pending / approved / rejected), so the dropdown cannot say
 * "approved" over a round still waiting on the city. What happens after an
 * approval - active, recorded, expired - is still a person's call.
 * Expired is always allowed: it is a fact about a date, not about a review.
 */
export function allowedStatuses(rounds: Pick<PermitRound, 'outcome' | 'submitted_on' | 'created_at'>[]): string[] {
  if (!rounds.length) return [...ALL_STATUSES]
  if (everApproved(rounds)) return ['approved', 'active', 'recorded', 'expired', 'closed']
  const sorted = sortRounds(rounds)
  const last = sorted[sorted.length - 1]
  if (last.outcome === 'rejected') return ['rejected', 'expired']
  return ['pending', 'expired']
}

/** Asked by the PATCH (the Permits tab and Claude both reach it) when a status is set. */
export function statusMoveProblem(
  current: string | null | undefined,
  next: string,
  rounds: Pick<PermitRound, 'outcome' | 'submitted_on' | 'created_at'>[],
): string | null {
  if (next === current) return null
  if (allowedStatuses(rounds).indexOf(next) !== -1) return null
  return `This permit's history decides that: it can be ${allowedStatuses(rounds).join(', ')} right now. ` +
    'To change it, log a submission or record the answer to the latest one.'
}

/**
 * What the status column becomes after a round event, or null to leave it.
 * Only the review half moves, and never once the permit has been approved -
 * a revision to an issued permit does not make it pending again.
 */
export function statusAfter(
  event: 'submitted' | Outcome,
  current: string | null | undefined,
  priorRounds: Pick<PermitRound, 'outcome'>[],
): string | null {
  if (everApproved(priorRounds)) return null
  const next = event === 'submitted' || event === 'corrections' ? 'pending'
    : event === 'approved' ? 'approved'
    : 'rejected'
  // Approved over active/recorded would be a step backwards.
  if (next === 'approved' && GRANTED_STATUSES.indexOf(current ?? '') !== -1) return null
  return next === current ? null : next
}

// ── Files ───────────────────────────────────────────────────────────────────

/**
 * The fixes a resubmission should carry: every file attached to an item that
 * has not already gone in with a round. The resubmission IS the fixes, so the
 * dialog starts with these ticked and the route accepts only these.
 */
export function carryableFiles(
  items: Pick<PermitItem, 'label' | 'files'>[],
  rounds: Pick<PermitRound, 'sent_files'>[],
): (RoundFile & { item: string })[] {
  const sent = new Set<string>()
  for (const r of rounds) for (const f of r.sent_files ?? []) sent.add(f.url)
  const out: (RoundFile & { item: string })[] = []
  const seen = new Set<string>()
  for (const i of items) for (const f of i.files ?? []) {
    if (sent.has(f.url) || seen.has(f.url)) continue
    seen.add(f.url)
    out.push({ ...f, item: i.label })
  }
  return out
}

/**
 * The permit's main document after an approval: the LAST file that came back
 * with it. "The latest one in the permit is the final file" - a revision
 * approved later replaces it the same way. Null leaves the column alone.
 */
export function finalFileAfter(outcome: string, received: RoundFile[]): string | null {
  if (outcome !== 'approved' || !received.length) return null
  return received[received.length - 1].url
}

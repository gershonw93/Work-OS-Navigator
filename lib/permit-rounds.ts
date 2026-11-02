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

/**
 * Where a permit stands. `status` is the permit's own column, read only when
 * there is no history to read instead - every permit filed before rounds
 * existed still has to say something true.
 */
export function permitStanding(
  permit: { status?: string | null; issuing_authority?: string | null },
  roundsIn: PermitRound[],
  items: Pick<PermitItem, 'done_at'>[],
  today: string,
): Standing {
  const rounds = sortRounds(roundsIn)
  const openItems = items.filter(i => !i.done_at).length
  const who = (permit.issuing_authority ?? '').trim() || 'the reviewer'
  const base = { openItems, rounds: rounds.length }

  if (!rounds.length) {
    // No history. A permit already marked granted was granted before anybody
    // logged rounds; anything else simply has not been logged, which is NOT
    // the same as "not submitted" - it may well be sitting at the city.
    if (GRANTED_STATUSES.indexOf(permit.status ?? '') !== -1) {
      return { ...base, court: 'done', label: 'Issued', short: 'Issued', tone: 'success', chase: false }
    }
    if (permit.status === 'rejected') {
      return { ...base, court: 'us', label: 'Rejected', short: 'Rejected', tone: 'danger', chase: false }
    }
    if (openItems) {
      return { ...base, court: 'us', label: `With us: ${openItems} to fix`, short: `${openItems} to fix`, tone: 'warn', chase: false }
    }
    return { ...base, court: 'none', label: 'No submission logged', short: 'Not logged', tone: 'neutral', chase: false }
  }

  const waiting = openRound(rounds)
  if (waiting) {
    const days = Math.max(0, daysBetween(waiting.submitted_on, today))
    const promised = waiting.expected_by ?? null
    const late = promised ? daysBetween(promised, today) > 0 : days >= CHASE_AFTER_DAYS
    const n = rounds.length
    const lead = `With ${who} since ${shortDay(waiting.submitted_on)}`
    const age = days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'}`
    const tail = promised && late
      ? `answer was due ${shortDay(promised)}`
      : age
    return {
      ...base,
      court: 'them',
      label: `${lead} (${tail})${n > 1 ? ` - round ${n}` : ''}`,
      short: `With city · ${days}d`,
      tone: late ? 'warn' : 'info',
      chase: late,
    }
  }

  // Every round has an answer. The latest one decides, except that a permit
  // once approved stays approved: a later round is a REVISION to an issued
  // permit, and a rejected revision does not un-issue the permit.
  const last = rounds[rounds.length - 1]
  if (everApproved(rounds) && last.outcome !== 'corrections') {
    const approved = [...rounds].reverse().find(r => r.outcome === 'approved')!
    return {
      ...base, court: 'done',
      label: `Approved ${shortDay(approved.outcome_on as string)}`,
      short: 'Approved', tone: 'success', chase: false,
    }
  }
  if (last.outcome === 'rejected') {
    return { ...base, court: 'us', label: `Rejected ${shortDay(last.outcome_on as string)}`, short: 'Rejected', tone: 'danger', chase: false }
  }
  // corrections
  if (openItems > 0) {
    return {
      ...base, court: 'us',
      label: `With us: ${openItems} item${openItems === 1 ? '' : 's'} to fix`,
      short: `${openItems} to fix`, tone: 'warn', chase: false,
    }
  }
  return { ...base, court: 'us', label: 'Ready to resubmit', short: 'Resubmit', tone: 'warn', chase: false }
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
  if (input.outcome === 'corrections' && !cleanItems(input.items).length) {
    return 'List what they asked for - one item per line. That list is what tells everybody the permit is waiting on us.'
  }
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

export const ALL_STATUSES = ['pending', 'approved', 'active', 'recorded', 'expired', 'rejected'] as const

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
  if (everApproved(rounds)) return ['approved', 'active', 'recorded', 'expired']
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

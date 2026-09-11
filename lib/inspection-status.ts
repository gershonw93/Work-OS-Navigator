// ─────────────────────────────────────────────────────────────────────────────
// What an inspection's status means, in one place.
//
// THE BUG THIS EXISTS TO STOP. A tester reported "1 inspection to book" with two
// pending. The overview counts `status === 'requested'` and nothing else
// (overview/route.ts), while the inspections page's own pending bucket counts
// four statuses. They disagreed, and the request form is what put a row into the
// state neither of them agreed about:
//
//     status: scheduledDate ? 'scheduled' : schedulerId ? 'requested' : 'not_scheduled'
//
// So an inspection somebody asked for, with nobody assigned yet, is saved as
// `not_scheduled` - and is then invisible to the counter whose whole job is to
// say what still needs booking. The unassigned one is exactly the one that
// needs attention.
//
// THE RULE, and it is the same one behind three of the tester's findings: AN
// INCOMPLETE RECORD IS STILL A RECORD. It is counted, it is logged, and it is
// never silently dropped from a total because somebody has not finished filling
// it in.
//
// Pure, so the rules can be tested without a database - like lib/committed.ts
// and lib/notification-routing.ts. Rules that need a server to test are rules
// nobody tests.
// ─────────────────────────────────────────────────────────────────────────────

/** Every status an inspection may hold. */
export const INSPECTION_STATUSES = [
  'not_scheduled',
  'requested',
  'scheduled',
  'passed',
  'failed',
  'pending_reinspection',
  'void',
] as const

export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]

export function isInspectionStatus(v: unknown): v is InspectionStatus {
  return typeof v === 'string' && (INSPECTION_STATUSES as readonly string[]).includes(v)
}

/**
 * Still needs somebody to book it.
 *
 * BOTH of these, which is the fix. `not_scheduled` means "asked for, nobody on
 * it yet" and `requested` means "asked for, somebody is on it" - the first is
 * more outstanding than the second, not less.
 */
export const TO_BOOK: readonly InspectionStatus[] = ['not_scheduled', 'requested']

/** Anything still in flight - what the page's "pending" list shows. */
export const OPEN: readonly InspectionStatus[] = [
  'not_scheduled', 'requested', 'scheduled', 'pending_reinspection',
]

/** Finished, one way or the other. */
export const CLOSED: readonly InspectionStatus[] = ['passed', 'failed']

export const needsBooking = (s: unknown): boolean =>
  isInspectionStatus(s) && TO_BOOK.includes(s)

export const isOpen = (s: unknown): boolean => isInspectionStatus(s) && OPEN.includes(s)

/**
 * Voided: kept for the record, out of the working list.
 *
 * A status value rather than a `deleted_at` column, because that is what this
 * codebase already does - see the void on client invoices, whose comment is the
 * doctrine: "Not delete. A client already has this document, so it stays in the
 * list with its number, greyed out."
 */
export const isVoid = (s: unknown): boolean => s === 'void'

/** Hide voided rows unless somebody has asked to see them. */
export function visibleInspections<T extends { status?: string | null }>(
  rows: T[],
  showVoided = false,
): T[] {
  return showVoided ? rows : rows.filter(r => !isVoid(r.status))
}

// ── who hears about a status change ─────────────────────────────────────────

/**
 * An OUTCOME is news the office acts on. LOGISTICS is a scheduling detail that
 * matters to whoever asked and whoever is booking it, and to nobody else.
 *
 * THE BUG. Every status flip notified the whole routed audience: ten minutes of
 * testing sent eight notifications to the office. The fix is a principle rather
 * than a rate limit, deliberately - a threshold is a rule people cannot predict,
 * and a bell that sometimes fires and sometimes does not is one people stop
 * opening. This way the answer to "why didn't I hear about that" is a sentence.
 */
export const OUTCOMES: readonly InspectionStatus[] = ['passed', 'failed', 'pending_reinspection']

export type Reach = 'outcome' | 'logistics' | 'silent'

export function reachFor(status: unknown): Reach {
  if (!isInspectionStatus(status)) return 'silent'
  if (OUTCOMES.includes(status)) return 'outcome'
  if (status === 'scheduled') return 'logistics'
  // Voiding and the two "asked for" states are not status-change news: a void
  // is a Job History entry, and a request notifies through its own path.
  return 'silent'
}

/** Whether the company-wide routed audience is consulted for this change. */
export const notifiesRoutedAudience = (status: unknown): boolean =>
  reachFor(status) === 'outcome'

// ── the invalid state behind four symptoms ──────────────────────────────────

/**
 * `scheduled` with no date was allowed to exist. It fired an "is scheduled"
 * notification to the office, the card read "No date yet", and the overview's
 * booked list never showed it - because that list requires a date. Four
 * symptoms, one state that should never have been storable.
 */
export function scheduleProblem(
  status: unknown,
  scheduledDate: string | null | undefined,
): string | null {
  if (status !== 'scheduled') return null
  if (scheduledDate && String(scheduledDate).trim()) return null
  return 'Pick the date it is booked for. "Scheduled" without a date tells the office it is booked when nobody knows when.'
}

/**
 * What a REQUEST is missing, which is a different question from the one above.
 *
 * THE BUG. Request Inspection accepted a fully blank submit: it created an
 * inspection AND sent a real notification to three schedulers - "Inspection to
 * book: Foundation at QA Ground-Up 2026" - for a request carrying nothing.
 *
 * `scheduleProblem` was already here and stood aside, correctly: it fires on
 * `scheduled`, and a request is `requested`. And the type could not be caught
 * because the form's dropdown defaults to 'Foundation', so "Foundation" was
 * never a value anybody chose. A default on a required field is a claim nobody
 * made.
 *
 * THE DATE IS NOT OPTIONAL ON A REQUEST, and that is not the same as demanding
 * a booking. The field is labelled "Preferred / Scheduled Date": a request is
 * somebody being asked to book an inspection, and "when do you need it" is the
 * whole content of the ask. Without it the notification is three people being
 * told to act with nothing to act on.
 */
export function requestProblem(
  inspectionType: unknown,
  scheduledDate: string | null | undefined,
): string | null {
  if (!inspectionType || !String(inspectionType).trim()) {
    return 'Pick which inspection this is - whoever books it needs to know what to call it.'
  }
  if (!scheduledDate || !String(scheduledDate).trim()) {
    return 'Add the date you need it by. A request with no date is somebody being asked to book something with nothing to book it for.'
  }
  return null
}

/**
 * Moving back to a pending state clears the completion stamp.
 *
 * A record reading "PENDING Re-inspection" and "Completed 9/5/2026" at the same
 * time is telling two stories, and on a compliance record that is the kind of
 * contradiction somebody eventually has to explain to a third party.
 */
export const clearsCompletion = (status: unknown): boolean =>
  status === 'pending_reinspection' || status === 'not_scheduled' || status === 'requested'

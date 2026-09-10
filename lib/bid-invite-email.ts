import { tokenLinkEmail } from './email'
import { formatDate } from './dates'

// ─────────────────────────────────────────────────────────────────────────────
// The letter that asks a sub for a price, and the nudge when they have not sent
// one. One builder, because they are the same letter in two moods.
//
// THE BUG THIS COMES OUT OF. "+ Invite" on a quote request sent NOTHING - not
// on the typed-email path and not on the directory path either, which only ever
// fired an in-app bell to subs who already had an account. The first thing a
// sub actually received was whatever you sent afterwards from the Send panel,
// and that arrived reading "Still need your price" - a chase for a request they
// had never been given.
//
// Two separate faults produced that one sentence:
//
//   1. nothing sent on invite (fixed in the invites route), and
//   2. `bid_invites.status` is NOT NULL DEFAULT 'invited', so a row was BORN
//      claiming it had been told. `isReminder` reads that status, so the first
//      real email was already a reminder. The default is 'pending' now.
//
// Keeping both moods in one function is the point: the invite and the chase are
// sent from two different routes, and they were one edit away from becoming two
// different letters about the same job.
// ─────────────────────────────────────────────────────────────────────────────

export interface BidInviteEmailInput {
  /** Have they already been told? A chase reads differently from a first ask. */
  isReminder: boolean
  /** What is being priced - "Electrical rough-in - Electrical". */
  scope: string
  /** ISO date the GC wants it back by, if there is one. */
  dueDate?: string | null
  /** The GC's company, as the sub knows them. */
  gcName?: string | null
  /** Who pressed the button. */
  fromName?: string | null
  vendorName?: string | null
  /** The sub's private link to the scope. */
  url: string
  /** A line the sender typed, when they chose to write one. */
  note?: string | null
}

export function bidInviteEmail({
  isReminder, scope, dueDate, gcName, fromName, vendorName, url, note,
}: BidInviteEmailInput) {
  const gc = (gcName ?? '').trim()
  const due = dueDate ? `Please get it back by ${formatDate(dueDate)}.` : null

  return tokenLinkEmail({
    recipientName: vendorName,
    eyebrow: isReminder ? 'Quote reminder' : 'Request for quote',
    heading: isReminder ? `Still need your price: ${scope}` : `Quote request: ${scope}`,
    lines: isReminder
      ? [
          `Just a nudge - ${gc || 'a contractor'} is still waiting on your price for ${scope}.`,
          'Your link is below; the scope and any plans are on it, and you can submit straight from there.',
          ...(due ? [due] : []),
        ]
      : [
          `${gc || 'A contractor'} would like your price for ${scope}.`,
          'The link has the scope and any plans attached, and you can submit your quote straight from it.',
          ...(due ? [due] : []),
        ],
    ctaLabel: 'View scope and quote',
    url,
    fromName,
    companyName: gcName,
    note,
  })
}

/** "Electrical rough-in - Electrical", or something usable when neither is set. */
export function bidScopeLine(title?: string | null, trade?: string | null): string {
  return [title, trade].filter(Boolean).join(' - ') || 'a scope of work'
}

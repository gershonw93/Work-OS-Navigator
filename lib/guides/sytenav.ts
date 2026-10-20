// ─────────────────────────────────────────────────────────────────────────────
// What the guides say about SyteNav itself, written ONCE.
//
// Every comparison guide ends with the same three facts - who it is for, what
// it costs, and what it does not do - and fourteen hand-typed copies of them is
// "one fact, one home" broken fourteen times. The day QuickBooks becomes a
// two-way sync, or the entry price moves, this is the file that changes and
// every guide follows.
//
// THE POSITIONING IS DELIBERATELY NOT A SIZE. The owner's decision: SyteNav is
// not a small-GC tool, so the guides describe the kind of company it fits -
// money that leaks between the quote and the invoice - and the plans run from
// a few active jobs to unlimited. Only the one guide written for the search
// phrase "construction management software for small contractors" says small.
//
// Prices and the trial are read from lib/plans.ts, never typed: a digit can be
// derived, a sentence restating one cannot.
// ─────────────────────────────────────────────────────────────────────────────

import { PLANS, TRIAL_DAYS } from '../plans'
import type { GuideLink } from './schema'

/** Who SyteNav is for, as a clause: "SyteNav is built for ..." */
export const SYTENAV_FIT =
  'general contractors whose money leaks between the quote and the invoice, whether they run a few jobs or a few dozen'

/** The pricing sentence's linked half. Exported so a guide's `links` can name it. */
export const PLANS_LINK_TEXT =
  `Plans start at $${PLANS[0].monthly} a month with unlimited team members, subs and clients`

/** The whole pricing sentence, trial included - a guide that names the price names the trial. */
export const PLANS_SENTENCE =
  `${PLANS_LINK_TEXT} - you buy project capacity, not seats - and SyteNav is invite-only, with your first ${TRIAL_DAYS} days free.`

export const plansLink: GuideLink = { text: PLANS_LINK_TEXT, href: '/pricing' }

/** The QuickBooks answer, as a clause. */
export const QBO_ONE_WAY =
  'its QuickBooks integration is a one-way push from SyteNav into QuickBooks Online rather than a two-way sync'

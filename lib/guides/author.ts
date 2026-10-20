// ─────────────────────────────────────────────────────────────────────────────
// Who the guides are credited to.
//
// ONE HOME, because this fact is stated in two places that must not disagree:
// the byline a reader sees, and the `author` of the Article structured data.
// A byline that says one thing while the markup credits another is a page
// telling a reader and a crawler two different things about who wrote it.
//
// THE COMPANY, NOT A PERSON - the owner's decision. The guides first carried a
// named founder as a Person node; that name was taken off the site on request.
// So the byline and the markup both credit SyteNav, and the author IS the
// Organization node the marketing layout already defines - pointed at, never
// repeated, so there is no second description of the company to drift.
// ─────────────────────────────────────────────────────────────────────────────

import { CANONICAL_ORIGIN } from '@/lib/canonical'

export const GUIDE_AUTHOR = {
  /** The Organization node in the marketing layout's graph. */
  id: `${CANONICAL_ORIGIN}/#organization`,
  /** The byline, as printed. */
  byline: 'By the SyteNav team',
  /** One line, under the byline. */
  bio: 'SyteNav builds construction management software around the job-cost, billing and field-record problems small contractors face every day.',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Who writes the guides.
//
// ONE HOME, because this fact is stated in two places that must not disagree:
// the byline a reader sees, and the Person node in the Article structured data.
// A byline that names a person while the markup credits the organisation is a
// page telling a reader and a crawler two different things about who wrote it.
//
// The `@id` is a fragment on the canonical origin, so the Person is a stable
// node every guide's graph can point at - the same way the Organization node in
// the marketing layout is pointed at rather than repeated.
// ─────────────────────────────────────────────────────────────────────────────

import { CANONICAL_ORIGIN } from '@/lib/canonical'

export const GUIDE_AUTHOR = {
  id: `${CANONICAL_ORIGIN}/#gershon-weisblum`,
  name: 'Gershon Weisblum',
  jobTitle: 'Founder',
  /** The byline, as printed. */
  byline: 'By Gershon Weisblum, founder of SyteNav',
  /** One line, used under the byline AND as the Person description. */
  bio: 'Gershon Weisblum builds SyteNav around the job-cost, billing, and field-record problems small contractors face every day.',
} as const

/** The Person node for a guide's JSON-LD graph. */
export const authorNode = {
  '@type': 'Person',
  '@id': GUIDE_AUTHOR.id,
  name: GUIDE_AUTHOR.name,
  jobTitle: GUIDE_AUTHOR.jobTitle,
  worksFor: { '@id': `${CANONICAL_ORIGIN}/#organization` },
  description: GUIDE_AUTHOR.bio,
}

import { billingAccess, type BillingRow } from './billing-state'
import { wholeDaysSince } from './onboarding-nudges'

// ─────────────────────────────────────────────────────────────────────────────
// WHO A CAMPAIGN GOES TO.
//
// Pure, and deliberately so: who gets bulk mail is the one decision in this
// feature that cannot be taken back. A segment is a function over facts we
// already hold, testable with a fixture and no database - the same shape as
// `nextNudge`, and for the same reason.
//
// A SUBCONTRACTOR IS NEVER ON A LIST. A sub was invited onto a job by one of
// our customers; they never asked to hear from us, they cannot buy anything,
// and the one thing they get from SyteNav is a bid request from somebody they
// already work with. Marketing mail to them is mail to a stranger's staff. So
// `peopleFor` drops everybody at a non-GC company BEFORE any segment is asked,
// which is the only arrangement where a new segment cannot forget the rule.
//
// AND IT IS `companies.type`, NOT "has a billing row". The migration-118
// backfill gave every company a `company_billing` row, subcontractor tenants
// included, so the billing row does not distinguish them and never will again.
//
// TWO SEGMENTS HOLD NO PEOPLE ON PURPOSE - one address, and a pasted list.
// Those are addresses somebody typed, so they are not selected from anybody and
// `peopleFor` answers with nothing for them; the sender builds the recipients
// from `custom_emails` instead. Typing an address is a deliberate act about one
// person, which is exactly what a test send is.
// ─────────────────────────────────────────────────────────────────────────────

/** Everything a segment may ask about one person. Assembled in bulk server-side. */
export interface CampaignPerson {
  profileId: string
  email: string
  firstName: string | null
  companyId: string
  companyName: string | null
  /** `companies.type` - 'gc', 'subcontractor', 'inspector', … */
  companyType: string | null
  /** Their company's `company_billing` row, or null when there is none. */
  billing: BillingRow | null
  /** Active jobs, counted the same way the plan meter counts them. */
  projects: number
  lastSignInAt: string | null
}

export interface Segment {
  key: string
  label: string
  /** The sentence under the option. Says who this is, in people's words. */
  describe: string
  /**
   * True when this person belongs in the segment.
   *
   * It is never asked about somebody at a non-GC company - `peopleFor` has
   * already dropped them - so no segment here restates that rule, and none of
   * them can get it wrong.
   */
  matches: (p: CampaignPerson, now: Date) => boolean
  /**
   * The addresses come from a box rather than from the database.
   * `matches` is never asked for one of these.
   */
  custom?: boolean
}

/** Is this person's company one of OUR customers, rather than a sub on a job? */
export const isTenant = (p: CampaignPerson): boolean => p.companyType === 'gc'

/** Days since they last signed in - null when they never have. */
const quietFor = (p: CampaignPerson, now: Date): number | null =>
  wholeDaysSince(p.lastSignInAt, now)

/** Quiet for at least this many days, counting "never signed in" as quiet. */
const quiet = (p: CampaignPerson, now: Date, days: number): boolean => {
  const since = quietFor(p, now)
  return since === null || since >= days
}

export const SEGMENTS: Segment[] = [
  {
    key: 'everyone',
    label: 'Everyone',
    describe: 'Every person at a builder using SyteNav - trial, paying, comped or locked out.',
    matches: () => true,
  },
  {
    key: 'trial',
    label: 'On a free trial',
    describe: 'Inside their free days, whatever they have or have not done with it.',
    matches: (p, now) => billingAccess(p.billing, now).state === 'trial',
  },
  {
    key: 'trial-ending',
    label: 'Trial ending (3 days or less)',
    describe: 'Still on the trial with three days or fewer left on it.',
    matches: (p, now) => {
      const a = billingAccess(p.billing, now)
      return a.state === 'trial' && a.daysLeft !== null && a.daysLeft <= 3
    },
  },
  {
    key: 'paid',
    label: 'On a plan',
    describe: 'A live subscription. The people who are paying us.',
    matches: (p, now) => billingAccess(p.billing, now).state === 'paid',
  },
  {
    key: 'comped',
    label: 'Free access',
    describe: 'Companies we have given the product to on purpose.',
    matches: (p, now) => billingAccess(p.billing, now).state === 'comped',
  },
  {
    key: 'locked',
    label: 'Read-only',
    describe: 'The trial ran out or the plan was cancelled, so they can read but not write.',
    matches: (p, now) => billingAccess(p.billing, now).state === 'locked',
  },
  {
    key: 'no-project',
    label: 'No job yet',
    describe: 'They have an account and have never put a job in it.',
    matches: p => p.projects === 0,
  },
  {
    key: 'never-signed-in',
    label: 'Never signed in',
    describe: 'The account exists and nobody has ever used it.',
    matches: p => p.lastSignInAt === null,
  },
  {
    key: 'quiet-7',
    label: 'Quiet for a week',
    describe: 'Not signed in for 7 days or more, including people who never have.',
    matches: (p, now) => quiet(p, now, 7),
  },
  {
    key: 'quiet-14',
    label: 'Quiet for a fortnight',
    describe: 'Not signed in for 14 days or more, including people who never have.',
    matches: (p, now) => quiet(p, now, 14),
  },
  {
    key: 'one-address',
    label: 'One address (test)',
    describe: 'Send it to yourself first. Nothing else gets it.',
    matches: () => false,
    custom: true,
  },
  {
    key: 'pasted-list',
    label: 'A list I paste in',
    describe: 'Addresses you type or paste. Nobody is selected from the database.',
    matches: () => false,
    custom: true,
  },
]

export const segmentByKey = (key: string): Segment | null =>
  SEGMENTS.find(s => s.key === key) ?? null

/**
 * The people in a segment.
 *
 * THE TENANT GATE IS HERE, ABOVE EVERY SEGMENT, not repeated inside each one.
 * A rule written once per segment is a rule the twelfth segment forgets, and
 * the cost of forgetting it is bulk mail to a subcontractor who never asked us
 * for anything.
 *
 * One address per person, too: two people at one company are two recipients,
 * but one person with two profiles is not.
 */
export function peopleFor(
  key: string,
  people: CampaignPerson[],
  now: Date = new Date(),
): CampaignPerson[] {
  const segment = segmentByKey(key)
  if (!segment || segment.custom) return []

  const seen = new Set<string>()
  const out: CampaignPerson[] = []
  for (const p of people) {
    if (!isTenant(p)) continue
    if (!segment.matches(p, now)) continue
    const address = normaliseEmail(p.email)
    if (!address || seen.has(address)) continue
    seen.add(address)
    out.push(p)
  }
  return out
}

/**
 * One spelling of an address, everywhere.
 *
 * A suppression is keyed on the address, and `Dana@X.com` unsubscribing has to
 * stop `dana@x.com` receiving the next one - the unique index on
 * `campaign_recipients` is `lower(email)` for the same reason. One function so
 * the list build, the send and the unsubscribe cannot disagree about what two
 * addresses being "the same" means.
 */
export const normaliseEmail = (email: string | null | undefined): string =>
  (email ?? '').trim().toLowerCase()

/** The addresses out of a pasted box - commas, semicolons or newlines. */
export function parseAddressList(text: string): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of (text ?? '').split(/[\s,;]+/)) {
    const address = normaliseEmail(raw)
    if (!address || !address.includes('@') || seen.has(address)) continue
    seen.add(address)
    out.push(address)
  }
  return out
}

/**
 * Drop the addresses that have asked us to stop.
 *
 * ASKED WHEN THE LIST IS BUILT **AND** AGAIN AT SEND TIME, and the second one
 * is the one that matters: somebody can unsubscribe between a campaign being
 * scheduled on Monday and going out on Thursday, and the list built on Monday
 * has no way of knowing.
 */
export function withoutSuppressed<T extends { email: string }>(
  rows: T[],
  suppressed: Iterable<string>,
): T[] {
  const stop = new Set(Array.from(suppressed, normaliseEmail))
  return rows.filter(r => !stop.has(normaliseEmail(r.email)))
}

// ─────────────────────────────────────────────────────────────────────────────
// The plans. One list, for the website and the app.
//
// THE ORIGINAL BUG. There were two lists and they did not agree about anything.
// The pricing page offered Crew / Company / Scale with no prices and a "Book a
// setup" button; Settings -> Billing offered Starter / Pro / Enterprise, with
// different limits, and put **$49 / mo** on the middle one. A customer saw $49
// inside the product and "book a setup" on the website.
//
// PRICES ARE HERE NOW, and the tiers are capacity rather than feature sets: you
// pay for how many projects are ACTIVE at once, and every plan is the whole
// product. That is the thing to keep straight when editing this file - there is
// no stripped-down tier, so `features` is one shared list and not a per-plan
// one. A feature that lands on one plan and not another does not belong here.
//
// STILL AN INVITE-ONLY BETA, AND FREE WHILE YOU ARE IN IT. These are what the
// plans will cost at launch, which is a different claim from what they cost
// today, and every screen that prints a number has to say which it is
// (`PRICING_STATUS`). A price published as though it were being charged, while
// the product is free and the door is a waitlist, is the same class of lie as a
// button that says "Start free trial" and opens a request form.
//
// THE ANNUAL FIGURES ARE DERIVED, never typed. The copy quotes "$82.50/month"
// and "Save $198 a year" - both fall out of the monthly price and the
// ten-months-for-twelve rule, and a stored copy of either stops being true the
// first time a price moves. Same reason a guide's read time is computed.
// Pinned in `lib/__tests__/plans-and-landing.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export interface Plan {
  /** A lucide icon name. Each screen maps it - the data stays serialisable. */
  icon: 'HardHat' | 'Building2' | 'Landmark'
  name: string
  who: string
  /** What the tier actually meters. */
  projects: string
  /** Included AI document reads per month. */
  scans: number
  /** List price per month, billed monthly, in whole dollars. */
  monthly: number
  /** The one the pricing page highlights. */
  featured: boolean
}

/** Annual billing is ten months for twelve. One number, one place. */
export const ANNUAL_MONTHS_CHARGED = 10

export const PLANS: Plan[] = [
  {
    icon: 'HardHat',
    name: 'Up to 3 active projects',
    who: 'For a contractor running a few jobs at a time.',
    projects: '3 active projects',
    scans: 150,
    monthly: 99,
    featured: false,
  },
  {
    icon: 'Building2',
    name: 'Up to 10 active projects',
    who: 'For a growing GC with several jobs moving at once.',
    projects: '10 active projects',
    scans: 300,
    monthly: 199,
    featured: true,
  },
  {
    icon: 'Landmark',
    name: 'Unlimited active projects',
    who: 'For a company that does not want to count jobs.',
    projects: 'Unlimited active projects',
    scans: 750,
    monthly: 399,
    featured: false,
  },
]

// ── the arithmetic, in one place ─────────────────────────────────────────────

/** What a year costs up front: ten months charged, twelve months of service. */
export const annualTotal = (p: Plan): number => p.monthly * ANNUAL_MONTHS_CHARGED

/** The per-month figure to print beside an annual price. Can be fractional. */
export const annualPerMonth = (p: Plan): number => annualTotal(p) / 12

/** What paying annually saves against twelve monthly charges. */
export const annualSaving = (p: Plan): number => p.monthly * 12 - annualTotal(p)

/**
 * Money, the way this product prints it: no cents when there are none.
 *
 * $99 rather than $99.00, but $82.50 rather than $83 - rounding a price DOWN in
 * a savings claim is a number the customer can catch you on.
 */
export function planPrice(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  return `$${rounded.toLocaleString('en-US', {
    minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

// ── what every plan includes ─────────────────────────────────────────────────

export interface PlanFeature {
  t: string
  d: string
}

/**
 * ONE list, because there is one product. The $99 plan is not a cut-down
 * version; the tiers sell project capacity and nothing else. If you find
 * yourself wanting to move an entry onto some plans and not others, the tier
 * model has changed and this file needs restructuring rather than a flag.
 */
export const PLAN_FEATURES: PlanFeature[] = [
  {
    t: 'Unlimited team members, subs and clients',
    d: 'Bring the office, PMs and crew in without buying another seat. Subs and clients use links, not logins.',
  },
  {
    t: 'AI scanning',
    d: 'Scan quotes, sub invoices and inspector cards instead of retyping them. AI scanning is included: 150, 300 or 750 scans per month, based on your plan.',
  },
  {
    t: 'A budget that keeps its math',
    d: 'See committed, actual and remaining on every line.',
  },
  {
    t: 'Change orders that move the money',
    d: 'An approved change order moves the budget and the sub contract it belongs to.',
  },
  {
    t: 'Client invoices with markup',
    d: 'Turn approved job costs into a client invoice and carry the markup with them.',
  },
  {
    t: 'Daily logs',
    d: 'Keep the notes, photos, crew and site record on the day they happened.',
  },
  {
    t: 'Time clock with a location check',
    d: 'Crew clock in and out from the job. The location check shows whether they were on site.',
  },
  {
    t: 'Permits, inspections and compliance',
    d: 'Track what was requested, what was booked, what passed and what expires next.',
  },
  {
    t: 'Field Mode',
    d: 'A stripped-down mobile view for the work that happens on site.',
  },
  {
    t: 'Job History',
    d: 'Every action on the project stays in one record.',
  },
  {
    t: 'Spreadsheet import',
    d: 'Bring an existing job in without starting from a blank screen.',
  },
]

/**
 * WHAT THE NUMBERS ON THE SCREEN MEAN TODAY.
 *
 * Every screen that prints a price prints this beside it. The product is free
 * while the beta is on, so an unqualified "$199/month" is a charge nobody is
 * making - and the pricing page's own buttons open a request form, not a
 * checkout. One sentence, one home, so the two screens cannot drift into
 * telling different stories about the same numbers.
 */
export const PRICING_STATUS = {
  short: 'Launch pricing',
  line: 'SyteNav is an invite-only beta and free while you are in it. These are what the plans will cost when billing starts.',
} as const

/** Where "Book a setup" goes, from either screen. */
export const PLAN_CTA_HREF = '/contact'

/**
 * The website's primary button and the app's differ ON PURPOSE, because the
 * audiences do. A prospect on /pricing has no account and wants in; somebody
 * reading Settings -> Billing is already inside the beta and wants to talk
 * about what happens at launch. The PRICES are shared; the door is not.
 */
export const PLAN_CTA_APP = 'Book a setup'
export const PLAN_CTA_WEB = 'Request access'
export const PLAN_CTA_WEB_HREF = '/signup'

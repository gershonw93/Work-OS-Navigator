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
// STILL INVITE-ONLY, AND THE FIRST FIFTEEN DAYS ARE FREE. The door has not
// moved - `/signup` is a request form behind a waitlist - so the trial is a
// fact about what happens once somebody is let in, never a button a stranger
// can press. Every screen that prints a number prints `PRICING_STATUS` beside
// it, because a published price with nothing qualifying it is a charge
// somebody believes is already happening; that was the same class of lie as a
// button saying "Start free trial" over a product that had no trial.
//
// THE ANNUAL FIGURES ARE DERIVED, never typed. The copy quotes "$82.50/month"
// and "Save $198 a year" - both fall out of the monthly price and the
// ten-months-for-twelve rule, and a stored copy of either stops being true the
// first time a price moves. Same reason a guide's read time is computed.
// Pinned in `lib/__tests__/plans-and-landing.ts`.
// ─────────────────────────────────────────────────────────────────────────────

export type PlanKey = 'up-to-3' | 'up-to-10' | 'unlimited'

export interface Plan {
  /**
   * The stable id. Never shown to anybody: a Stripe price, a `company_billing`
   * row and an admin screen all name a plan, and naming it by `name` means the
   * day marketing rewords a tier every stored row points at nothing.
   */
  key: PlanKey
  /** A lucide icon name. Each screen maps it - the data stays serialisable. */
  icon: 'HardHat' | 'Building2' | 'Landmark'
  name: string
  who: string
  /**
   * How many active projects the tier allows, or null for no limit.
   *
   * A NUMBER, because something has to COUNT against it. This was the string
   * '3 active projects', which reads fine and cannot be compared with
   * anything - and the screen that was supposed to be counting printed a
   * hardcoded `0 / 10` under a tier name no plan has ever had. The sentence is
   * derived from the number now (`projectLimitLabel`), so the cap the copy
   * promises and the cap the app enforces are the same fact.
   */
  projectLimit: number | null
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
    key: 'up-to-3',
    icon: 'HardHat',
    name: 'Up to 3 active projects',
    who: 'For a contractor running a few jobs at a time.',
    projectLimit: 3,
    scans: 150,
    monthly: 99,
    featured: false,
  },
  {
    key: 'up-to-10',
    icon: 'Building2',
    name: 'Up to 10 active projects',
    who: 'For a growing GC with several jobs moving at once.',
    projectLimit: 10,
    scans: 300,
    monthly: 299,
    featured: true,
  },
  {
    key: 'unlimited',
    icon: 'Landmark',
    name: 'Unlimited active projects',
    who: 'For a company that does not want to count jobs.',
    projectLimit: null,
    scans: 750,
    monthly: 499,
    featured: false,
  },
]

// ── the trial ────────────────────────────────────────────────────────────────

/**
 * How long a new company runs before a plan is needed. ONE number.
 *
 * The draft pricing copy once carried "Start free trial - 14 days. No card."
 * over a product with no trial at all, and it was removed for promising a verb
 * nothing could honour. There is a trial now, so the claim is allowed - but it
 * is allowed to say FIFTEEN, and only because this constant says so. The pin
 * reads every "N-day" on a public page and checks N against this, which is the
 * check that would have caught the 14 as well as a future drift.
 *
 * THE DOOR HAS NOT CHANGED. `/signup` is still a request form behind a
 * waitlist: the fifteen days begin when somebody is let IN, which is why the
 * website states the trial as a fact about what happens after approval and
 * never as a button a stranger can press.
 */
export const TRIAL_DAYS = 15

// ── the arithmetic, in one place ─────────────────────────────────────────────

/** The plan a stored `plan_key` names, or null if it names nothing we sell. */
export function planByKey(key: string | null | undefined): Plan | null {
  return PLANS.find(p => p.key === key) ?? null
}

/**
 * The sentence for a project cap, DERIVED from the number that enforces it.
 *
 * Both used to exist: a `projects` string for the screen and nothing at all for
 * the counting. Deriving one from the other is the whole point - a tier cannot
 * advertise ten and enforce three.
 */
export function projectLimitLabel(p: Plan): string {
  return p.projectLimit === null ? 'Unlimited active projects' : `${p.projectLimit} active projects`
}

/** The cheapest plan that fits this many active projects, or null if none does. */
export function planForProjects(count: number): Plan | null {
  return PLANS.find(p => p.projectLimit === null || p.projectLimit >= count) ?? null
}

/** The cheapest plan that covers this many scans a month, or null if none does. */
export function planForScans(count: number): Plan | null {
  return PLANS.find(p => p.scans >= count) ?? null
}

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
 * Every screen that prints a price prints this beside it, because a published
 * price with nothing qualifying it is a charge somebody thinks is already
 * happening. It used to say the beta was free full stop; billing exists now, so
 * it says the thing that is true for a company arriving today - fifteen days,
 * no card, then a plan.
 *
 * IT IS THE GENERAL SENTENCE, NOT ANY ONE COMPANY'S. Inside the app, Settings
 * -> Billing prints the state of the company actually looking (still in the
 * trial, on a plan, given free access), derived from its own row. A customer
 * we have comped reading "your first fifteen days are free" is being told
 * somebody else's facts.
 */
export const PRICING_STATUS = {
  short: 'Launch pricing',
  line: `SyteNav is invite-only. Once you are approved your first ${TRIAL_DAYS} days are free - the whole product on a real job, with no card - and these are what the plans cost after that.`,
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

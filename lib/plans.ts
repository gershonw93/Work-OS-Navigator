// ─────────────────────────────────────────────────────────────────────────────
// The plans. One list, for the website and the app.
//
// THE BUG. There were two, and they did not agree about anything. The pricing
// page offers Crew / Company / Scale with no prices and a "Book a setup" button
// - and an FAQ entry headed "Why is there no price on this page?", so the
// absence is a decision, not an oversight. Settings -> Billing offered
// Starter / Pro / Enterprise, with different limits, and put **$49 / mo** on
// the middle one.
//
// So a customer saw $49 inside the product and "book a setup" on the website.
// The app was quoting a price the business had deliberately not published, and
// naming three tiers that do not exist.
//
// Prices are still not here, on purpose. When they arrive they arrive once, in
// this file, and both screens change together.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanLimit {
  /** A lucide icon name. Each screen maps it - the data stays serialisable. */
  icon: 'Users' | 'FolderKanban' | 'ScanLine'
  t: string
}

export interface Plan {
  icon: 'HardHat' | 'Building2' | 'Landmark'
  name: string
  who: string
  blurb: string
  limits: PlanLimit[]
  features: string[]
  cta: string
  /** The one the pricing page highlights. */
  featured: boolean
}

export const PLANS: Plan[] = [
  {
    icon: 'HardHat',
    name: 'Crew',
    who: 'For solo subs and small crews',
    blurb: 'Everything you need to turn quotes into running jobs and get paid on time.',
    limits: [
      { icon: 'Users', t: '5 team members' },
      { icon: 'FolderKanban', t: '5 active projects' },
      { icon: 'ScanLine', t: '50 AI scans / mo' },
    ],
    features: [
      'AI quote & receipt scanning',
      'Line-item budgets & progress',
      'Scheduling with overlap warnings',
      'Daily logs, tasks & photos',
      'Stage invoicing',
      'Time clock for your crew',
    ],
    cta: 'Book a setup',
    featured: false,
  },
  {
    icon: 'Building2',
    name: 'Company',
    who: 'For GCs and growing teams',
    blurb: 'Run multiple jobs and subs with the master views, RFQs, and approvals that keep a company straight.',
    limits: [
      { icon: 'Users', t: '15 team members' },
      { icon: 'FolderKanban', t: 'Unlimited projects' },
      { icon: 'ScanLine', t: '300 AI scans / mo' },
    ],
    features: [
      'Everything in Crew',
      'RFQs out & AI bid comparison',
      'Client payments & escrow tracking',
      'Master calendar & money views',
      'Roles & approval workflows',
      'Permits, inspections & compliance',
    ],
    cta: 'Book a setup',
    featured: true,
  },
  {
    icon: 'Landmark',
    name: 'Scale',
    who: 'For high-volume operations',
    blurb: 'For companies running serious volume, with the controls, support, and onboarding to match.',
    limits: [
      { icon: 'Users', t: 'Unlimited team' },
      { icon: 'FolderKanban', t: 'Unlimited projects' },
      { icon: 'ScanLine', t: '1,000 AI scans / mo' },
    ],
    features: [
      'Everything in Company',
      'Priority support & onboarding',
      'Advanced permissions & audit trail',
      'Company-wide reporting',
      'Dedicated success contact',
      'Custom scan volume available',
    ],
    cta: 'Book a setup',
    featured: false,
  },
]

/** Where "Book a setup" goes, from either screen. */
export const PLAN_CTA_HREF = '/contact'

// ─────────────────────────────────────────────────────────────────────────────
// What a job needs before it goes Active, and how to ask for it.
//
// THE BUG, as reported: a Building To Sell job "activated with $0 budget and 0%
// markup, no complaint". Both halves of that are real, and they are separate
// faults.
//
// 1. THE COMPLAINT NEVER RAN. There is a pre-flight, and it is wired to exactly
//    one door - the status badge in the project header. Two others go straight
//    through:
//      * the Edit Project dialog on /projects, a plain Status <select>
//      * Quote -> Convert (api/projects/[id]/quote, action: 'convert')
//    and the route behind all three took `status` as ANY string, unvalidated.
//    The guard was on one menu rather than on the transition, which is #358 and
//    #359 over again. So the rule lives HERE and the route enforces it, and
//    every door lands on the same answer.
//
// 2. IT WOULD HAVE ASKED THE WRONG QUESTION. The pre-flight tested
//    `contractor_fee_pct > 0` on every job. lib/contract-type.ts is explicit
//    that the markup is what you are paid on COST-PLUS only - on a spec build
//    there is no client and revenue is the sale price. So a Building To Sell
//    job was going to be told "No markup set on the budget", about a number
//    that does not affect its pay, while nobody ever asked for the sellout
//    figure that does. That is #357 - demanding a client from a job that cannot
//    have one - in a second place.
//
//    Checked against production: `sellout_amount` is null on EVERY spec project
//    there, one of them active with 106 budget lines. profitFor() returns
//    nothing without it, so those jobs show no profit at all and nothing has
//    ever said why.
//
// A WARNING WITH A LATCH, NOT A BLOCK. Jobs do genuinely go under contract
// before the budget is typed up, and some really are at cost. Refusing those
// would be the app inventing a rule the trade does not have. So the serious
// concerns have to be acknowledged explicitly - the caller names them back -
// which cannot be done by accident and cannot be done by a door that never
// showed them.
//
// Pure, like lib/committed.ts, lib/company-owner.ts and lib/pay-app-rules.ts.
// ─────────────────────────────────────────────────────────────────────────────

import {
  type ContractType,
  usesMarkup,
  usesRevenue,
  revenueAsk,
  revenueLabel,
} from './contract-type'

export interface ActivationFacts {
  /** 'cost_plus' | 'fixed_price' | 'spec', or null if never answered. */
  contractType: ContractType | null
  budgetLines: number
  /** The cost-plus rate, as a FRACTION (0.15 = 15%), as stored. */
  contractorFeePct: number
  /** Contract value or sale price. Null means "no figure yet", not zero. */
  selloutAmount: number | null
  /** 'simple' | 'aia'. An AIA job is priced by its schedule of values. */
  billingMode: string
}

export interface Concern {
  key: string
  /** The heading, as a fact about the job. */
  label: string
  /** What is there now, or what is missing. */
  detail: string
  /**
   * True when going live without it puts a wrong number in front of somebody.
   * These are the ones that have to be acknowledged by name.
   */
  serious: boolean
  /** Tab slug that fixes it. */
  href: string
}

const n = (v: unknown): number => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}

/**
 * Everything about this job that Active would make worse.
 *
 * Returned in the order they should be answered: the contract type first,
 * because it decides which price question the job even has.
 */
export function activationConcerns(f: ActivationFacts): Concern[] {
  const out: Concern[] = []

  if (!f.contractType) {
    out.push({
      key: 'contract',
      label: 'This job has no pay model yet',
      detail: 'Cost-plus, fixed price or building to sell. It decides what the budget is measured against.',
      serious: true,
      href: 'budget',
    })
  }

  if (f.budgetLines <= 0) {
    out.push({
      key: 'budget',
      label: 'This job has no budget',
      detail: 'Nothing budgeted yet. Committed, actual and every "what is left" answer are measured against these lines, so all of them read zero until there are some.',
      serious: true,
      href: 'budget',
    })
  }

  const price = priceConcern(f)
  if (price) out.push(price)

  return out
}

/**
 * The price question this job actually has - which is not the same question on
 * every job.
 *
 * Returns null when it is answered, or when the job type has no such question.
 */
function priceConcern(f: ActivationFacts): Concern | null {
  // An AIA job is priced by its schedule of values on each application, not by
  // a rate or a contract figure set here. Asking for one is asking twice.
  if (f.billingMode === 'aia') return null

  // No pay model yet: the 'contract' concern above already covers it, and
  // guessing which price to ask for would be the original mistake in reverse.
  if (!f.contractType) return null

  if (usesMarkup(f.contractType)) {
    if (n(f.contractorFeePct) > 0) return null
    return {
      key: 'price',
      label: 'This job has no markup set',
      detail: 'Going active locks the markup as your billed fee. At 0% you will bill this job at cost and earn nothing on it.',
      serious: true,
      href: 'budget',
    }
  }

  if (usesRevenue(f.contractType)) {
    if (f.selloutAmount != null && n(f.selloutAmount) > 0) return null
    return {
      key: 'price',
      // "What will this job sell for?" on a spec build, "What are you charging
      // for this job?" on a fixed price - the words the job's own type uses.
      label: revenueAsk(f.contractType),
      detail: `No ${revenueLabel(f.contractType).toLowerCase()} set. It is what profit is measured against on this kind of job - without it the Budget tab can show you costs but no margin at all.`,
      serious: true,
      href: 'budget',
    }
  }

  return null
}

/**
 * The concerns that must be acknowledged by name before Active.
 *
 * By NAME rather than a single "I confirm" flag, so a caller cannot acknowledge
 * a job it never looked at: the keys it sends back have to be the keys this job
 * actually has.
 */
export function seriousKeys(f: ActivationFacts): string[] {
  return activationConcerns(f).filter(c => c.serious).map(c => c.key)
}

/**
 * Has the caller acknowledged everything serious about this job?
 *
 * Extra keys are ignored - a stale browser that names a concern since fixed is
 * not a reason to refuse. Missing ones are not.
 */
export function acknowledgedAll(f: ActivationFacts, acknowledged: unknown): boolean {
  const need = seriousKeys(f)
  if (!need.length) return true
  const got = new Set(Array.isArray(acknowledged) ? acknowledged.map(String) : [])
  return need.every(k => got.has(k))
}

/** One sentence for a caller that skipped the pre-flight entirely. */
export function activationRefusal(f: ActivationFacts): string {
  const serious = activationConcerns(f).filter(c => c.serious)
  const list = serious.map(c => c.label.replace(/^This job /, '').toLowerCase())
  return `This job is not ready to go active: ${list.join('; ')}. Open the job and use the status badge in the header - it will show you what is missing and let you go ahead anyway.`
}

/** The statuses a project may hold. Anything else was a typo or an attack. */
export const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export function isProjectStatus(v: unknown): v is ProjectStatus {
  return typeof v === 'string' && (PROJECT_STATUSES as readonly string[]).includes(v)
}

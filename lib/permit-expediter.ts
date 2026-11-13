// ─────────────────────────────────────────────────────────────────────────────
// A permit that goes through an expediter.
//
// What an expediter told us, and what each step is here:
//
//   1. HIRE THEM. They send the land survey and their proposal; the GC signs
//      the proposal and sends it back. The signed proposal is recorded as the
//      expediter's SUBCONTRACT on the job - its amount is their fee, so it is
//      on the budget, their bills settle against it and it reaches QuickBooks
//      like any sub's. "Hired" is therefore not stored anywhere: it is whether
//      that subcontract exists. A `hired_on` column beside it would be a second
//      home for the same fact, and the two would disagree the day one of them
//      was edited.
//   2. PLANS WITH THE DOB. The expediter files them and relays what the DOB
//      wants changed. That back-and-forth is the permit's own rounds -
//      submitted, corrections, resubmitted, approved - so nothing new is
//      needed except that Email it goes to the EXPEDITER, not the DOB.
//   3. APPLY FOR THE PERMIT. "One plan covers one unit": a job's other permits
//      wait on that job's plan approval.
//
// The wait applies only where the plan approval goes through an expediter.
// "Plans Review" is an existing type that thirty permits already use as one
// more permit among the rest, with no expediter; turning those jobs' other
// permits into "waiting on plans" overnight would be a rule nobody asked for.
//
// Pure. The loader that reads the subcontracts is lib/permit-expediter-db.ts.
// ─────────────────────────────────────────────────────────────────────────────

/** The trade a Directory company carries to be offered as an expediter. */
export const EXPEDITER_TRADE = 'Permit expediter'

/** The permit type that is the plan approval. The name thirty permits already use. */
export const PLAN_APPROVAL_TYPE = 'Plans Review'

/** "Permit expediter", "Expeditor", "NYC expediting" - all one trade. */
export function isExpediterTrade(trade: string | null | undefined): boolean {
  return /expedit/i.test(String(trade ?? ''))
}

export const isPlanApproval = (type: string | null | undefined) =>
  String(type ?? '').trim().toLowerCase() === PLAN_APPROVAL_TYPE.toLowerCase()

/** What a permit row carries about its expediter, worked out on the server. */
export interface ExpediterFacts {
  expediter_company_id?: string | null
  expediter_name?: string | null
  expediter_email?: string | null
  /** The day their subcontract was written on this job; null until hired. */
  expediter_hired_on?: string | null
  /** The subcontract that IS the hire - its proposal and fee. */
  expediter_subcontract_id?: string | null
  /** This job's plan approval (through an expediter) is not approved yet. */
  plans_pending?: boolean
}

export interface ExpediterCompany { id: string; name: string | null; contact_email?: string | null }
export interface JobSubcontract { id: string; project_id: string; company_id: string | null; created_at?: string | null }

/** The plan approval on a job is approved: its history says so, or its status does. */
export function planApproved(
  permit: { status?: string | null },
  rounds: { outcome?: string | null }[],
): boolean {
  if (rounds.some(r => r.outcome === 'approved')) return true
  return ['approved', 'active', 'recorded', 'closed'].includes(String(permit.status ?? ''))
}

/**
 * The expediter facts for every permit given, from the companies and the
 * subcontracts on their jobs. Permits are grouped by job for the plans gate:
 * a permit waits when its OWN job has a plan approval through an expediter
 * that is not approved yet, and it is not that plan approval itself.
 */
export function expediterFacts<P extends { id: string; project_id: string; permit_type?: string | null; status?: string | null; expediter_company_id?: string | null }>(
  permits: P[],
  roundsFor: (permitId: string) => { outcome?: string | null }[],
  companies: ExpediterCompany[],
  subcontracts: JobSubcontract[],
): (P & ExpediterFacts)[] {
  const company = new Map(companies.map(c => [c.id, c]))
  const pendingJobs = new Set(
    permits
      .filter(p => isPlanApproval(p.permit_type) && p.expediter_company_id && !planApproved(p, roundsFor(p.id)))
      .map(p => p.project_id),
  )
  return permits.map(p => {
    const c = p.expediter_company_id ? company.get(p.expediter_company_id) ?? null : null
    const sub = c ? subcontracts.find(s => s.project_id === p.project_id && s.company_id === c.id) ?? null : null
    return {
      ...p,
      expediter_name: c?.name?.trim() || (p.expediter_company_id ? 'the expediter' : null),
      expediter_email: c?.contact_email?.trim() || null,
      expediter_hired_on: sub ? String(sub.created_at ?? '').slice(0, 10) || null : null,
      expediter_subcontract_id: sub?.id ?? null,
      plans_pending: !isPlanApproval(p.permit_type) && pendingJobs.has(p.project_id),
    }
  })
}

/** The hire, asked by the dialog AND the route: their fee, and the signed copy. */
export function hireProblem(input: { fee?: string | number | null; hasFile?: boolean }): string | null {
  const text = String(input.fee ?? '').replace(/[$,\s]/g, '')
  if (!text) return 'Enter their fee from the proposal - it goes on the budget.'
  const n = Number(text)
  if (!Number.isFinite(n) || n < 0) return 'Their fee should be a dollar amount, like 4500.'
  if (!input.hasFile) return 'Attach the signed proposal.'
  return null
}

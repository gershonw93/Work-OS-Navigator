// ─────────────────────────────────────────────────────────────────────────────
// Which compliance documents a vendor actually owes you.
//
// The defaults are a starting point, not the truth. A one-man sub has no
// workers' comp; a trade that is not licensed in the state has no license. Left
// as "required", both sit as Missing forever and turn a job red over a document
// that was never coming - which trains people to ignore the compliance tab,
// which is the opposite of the point.
//
// One place decides this, because the card's status, the row badges and what a
// document request asks for all have to agree. They used to be three separate
// expressions of the same idea.
// ─────────────────────────────────────────────────────────────────────────────

export type DocType = 'coi' | 'license' | 'w9' | 'workers_comp' | 'other'

export const DOC_TYPES: DocType[] = ['coi', 'license', 'w9', 'workers_comp', 'other']

export const DOC_LABELS: Record<DocType, string> = {
  coi: 'COI',
  license: 'License',
  w9: 'W-9',
  workers_comp: "Workers' comp",
  other: 'Other',
}

/** A stored override: this vendor does not owe this document. */
export interface RequirementOverride {
  company_id: string
  /** null = applies to this vendor on every job. */
  project_id: string | null
  type: string
  required: boolean
  note?: string | null
}

/** Which documents are worth showing at all for this kind of vendor. */
export function docTypesFor(companyType?: string | null): DocType[] {
  if (companyType === 'supplier') return ['w9', 'coi', 'other']
  return DOC_TYPES
}

/** The out-of-the-box expectation, before any per-vendor decision. */
export function defaultRequired(companyType?: string | null): DocType[] {
  if (companyType === 'supplier') return ['w9']
  return ['coi', 'license', 'w9', 'workers_comp']
}

/**
 * Resolve what this vendor owes on this job.
 *
 * A job-specific override beats a company-wide one, so a job that demands
 * workers' comp from everybody can say so without changing the vendor
 * everywhere else.
 */
export function requiredDocsFor(opts: {
  companyType?: string | null
  companyId: string
  projectId?: string | null
  overrides?: RequirementOverride[]
}): DocType[] {
  const { companyType, companyId, projectId, overrides = [] } = opts
  const mine = overrides.filter(o => o.company_id === companyId)

  const decide = (type: DocType): boolean => {
    const forJob = projectId
      ? mine.find(o => o.type === type && o.project_id === projectId)
      : undefined
    if (forJob) return forJob.required
    const companyWide = mine.find(o => o.type === type && o.project_id == null)
    if (companyWide) return companyWide.required
    return defaultRequired(companyType).includes(type)
  }

  return docTypesFor(companyType).filter(decide)
}

/** The override in force for one type, if any - for showing why it was waived. */
export function overrideFor(opts: {
  companyId: string
  projectId?: string | null
  type: string
  overrides?: RequirementOverride[]
}): RequirementOverride | null {
  const { companyId, projectId, type, overrides = [] } = opts
  const mine = overrides.filter(o => o.company_id === companyId && o.type === type)
  return (
    (projectId ? mine.find(o => o.project_id === projectId) : undefined) ??
    mine.find(o => o.project_id == null) ??
    null
  )
}

/**
 * What a document request should ask for.
 *
 * Only what this vendor actually owes AND does not already have in good order -
 * asking a sub to re-send a current COI, or to send a licence they were never
 * going to have, is how these requests get ignored.
 */
export function typesToRequest(opts: {
  required: DocType[]
  /** Resolved status per type: 'approved' and 'pending' are already handled. */
  statusOf: (t: DocType) => string
}): DocType[] {
  const { required, statusOf } = opts
  const outstanding = required.filter(t => !['approved', 'pending'].includes(statusOf(t)))
  // Everything current? Then a request is a re-ask; default to what they owe
  // rather than to nothing, so the button still does something sensible.
  return outstanding.length ? outstanding : required
}

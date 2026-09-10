// ─────────────────────────────────────────────────────────────────────────────
// What the Compliance Report actually has to print.
//
// THE BUG. The printed report said "No compliance documents on record" on every
// project, always, including jobs with real certificates on file - which on an
// owner's or a lender's copy is not an empty section, it is an assertion that a
// sub is uninsured.
//
// The route answers `{ subcontracts, docs, requests, requirements }`. The report
// read `d.documents ?? d.compliance ?? []`. Neither key exists, so both were
// `undefined`, the `??` fell through to the empty array, and nothing downstream
// could tell "none on file" from "asked for the wrong thing". It is the failure
// written up in the working agreement, exactly: read the wrong key off a
// response and a truthiness guard swallows it.
//
// UNDER IT, two more. The report's own type declared `doc_type`,
// `subcontractor_name` and `company_name`; a `compliance_documents` row carries
// `type` and `company_id` and none of those three - so with the key fixed it
// would have printed `undefined` for every document and filed all of them under
// "Unknown", because the NAME only exists on the `subcontracts` array beside
// them. And it decided expired with a raw `new Date(...) < today`, against the
// clock rather than local midnight, so a certificate expiring today printed as
// expired on its last good day.
//
// So: one reader, taking the response the route really sends, resolving the
// name from the subcontracts it came with, and deriving state through the same
// `expiryState` the Compliance tab uses - because a tab and a printout that
// disagree about one certificate is worse than either being wrong alone.
// ─────────────────────────────────────────────────────────────────────────────

import { expiryState } from './expiry'
import { DOC_LABELS, requiredDocsFor, type DocType } from './compliance-requirements'

export type DocStatus =
  | 'missing' | 'pending' | 'approved' | 'expired' | 'expiring_soon' | 'optional' | 'not_required'

/** A `compliance_documents` row, as the route really sends it. */
export interface ComplianceDocRow {
  id: string
  company_id: string
  type: DocType | string
  status: DocStatus
  expiry_date: string | null
  file_url?: string | null
}

/** A `subcontracts` row with its joined company, as the route really sends it. */
export interface ComplianceSubRow {
  id: string
  companies: { id: string; name: string; type?: string | null } | null
}

export interface RequirementRow {
  company_id: string
  project_id: string | null
  type: string
  required: boolean
  note?: string | null
}

export interface ReportDoc {
  id: string
  /** "COI", "W-9" - what the app calls it, not the column value. */
  label: string
  type: string
  status: DocStatus
  expiry_date: string | null
  /** Expired, or required and never filed. The line a lender looks for. */
  onFile: boolean
}

export interface ReportGroup {
  companyId: string
  /** The company's real name. Never "Unknown" while a subcontract carries one. */
  name: string
  docs: ReportDoc[]
  /** Anything expired or missing - what puts "Action required" on the group. */
  actionRequired: boolean
}

/**
 * THE DATE DECIDES.
 *
 * A certificate carrying a date that has not run out is current whatever the row
 * was set to when it was filed - a live COI sitting at "pending" because nobody
 * clicked Approve is a covered sub reading as a problem, and it is the same fact
 * in both directions: an expired one reads as covered no matter what the row
 * says. The stored status only speaks for a document with NO date on it, a W-9
 * or a signed agreement, where there is nothing to derive from.
 *
 * Lifted out of the Compliance page so the tab and the printout are one answer.
 */
export function statusFromExpiry(
  doc: { status: DocStatus; expiry_date: string | null },
  today?: Date,
): DocStatus {
  const state = expiryState(doc.expiry_date, today ? { today } : {})
  if (state === 'expired') return 'expired'
  if (state === 'soon') return 'expiring_soon'
  if (state === 'ok') return 'approved'
  return doc.status
}

const BAD: DocStatus[] = ['expired', 'missing']

function label(type: string): string {
  return DOC_LABELS[type as DocType] ?? type.replace(/_/g, ' ')
}

/**
 * One group per company on the job: what is on file, and what is still owed.
 *
 * `docs` and `subcontracts` are the route's own keys, passed straight through -
 * naming them here is what stops the next caller guessing at `documents` again.
 */
export function complianceReport(input: {
  subcontracts?: ComplianceSubRow[] | null
  docs?: ComplianceDocRow[] | null
  requirements?: RequirementRow[] | null
  projectId?: string | null
  today?: Date
}): ReportGroup[] {
  const subs = input.subcontracts ?? []
  const docs = input.docs ?? []
  const requirements = input.requirements ?? []

  // One card per COMPANY, not per subcontract: a sub with two scopes on one job
  // has one set of insurance.
  const companies = new Map<string, { id: string; name: string; type?: string | null }>()
  for (const s of subs) {
    const c = s.companies
    if (c?.id && !companies.has(c.id)) companies.set(c.id, c)
  }

  const groups: ReportGroup[] = []
  for (const [companyId, company] of Array.from(companies)) {
    const mine = docs.filter(d => d.company_id === companyId)
    const required = requiredDocsFor({
      companyType: company.type, companyId, projectId: input.projectId ?? null,
      overrides: requirements,
    })

    const out: ReportDoc[] = mine.map(d => ({
      id: d.id,
      label: label(String(d.type)),
      type: String(d.type),
      status: statusFromExpiry(d, input.today),
      expiry_date: d.expiry_date,
      onFile: true,
    }))

    // Required, and nothing filed. On an owner's copy an absent COI is the line
    // that matters most, and it cannot be read off a list of what IS there.
    const filed = new Set(mine.map(d => String(d.type)))
    for (const type of required) {
      if (filed.has(type)) continue
      out.push({ id: `missing-${companyId}-${type}`, label: label(type), type, status: 'missing', expiry_date: null, onFile: false })
    }

    if (out.length === 0) continue
    // On file first, then what is owed; within each, worst news at the top.
    out.sort((a, b) =>
      Number(b.onFile) - Number(a.onFile)
      || Number(BAD.includes(b.status)) - Number(BAD.includes(a.status))
      || a.label.localeCompare(b.label))

    groups.push({
      companyId,
      name: company.name,
      docs: out,
      actionRequired: out.some(d => BAD.includes(d.status)),
    })
  }

  return groups.sort((a, b) => a.name.localeCompare(b.name))
}

// "Reports > Compliance Report prints 'No compliance documents on record' even
// when the project has documents on file."
//
// It printed that on EVERY project, always, since the section was written. The
// route answers `{ subcontracts, docs, requests, requirements }` and the report
// read `d.documents ?? d.compliance ?? []` - neither key exists, both were
// `undefined`, the `??` fell through to the empty array. Nothing downstream
// could tell "none on file" from "asked for the wrong thing", which is the
// whole danger of the pattern: on an owner's or a lender's copy an empty
// section is not blank, it is an assertion that a sub is uninsured.
//
// TWO MORE UNDERNEATH IT, both of which would have survived fixing the key:
//
//   * the report's own type declared `doc_type`, `subcontractor_name` and
//     `company_name`, and a compliance_documents row carries `type` and
//     `company_id` and none of those three - so every document would have
//     printed `undefined` and filed under "Unknown", because the NAME is on the
//     subcontracts array beside them;
//   * it decided expired with `new Date(d.expiry_date) < today`, against the
//     clock rather than local midnight, so a certificate expiring today printed
//     as expired on its last good day.

import { complianceReport, statusFromExpiry } from '../compliance-report'
import { ok, done, code } from './_helpers'

const ymd = (offset: number) => {
  const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The response the route really sends, with the two real documents from the
// report: a live COI and a W-9 with no date.
const RESPONSE = {
  subcontracts: [
    { id: 'sc1', companies: { id: 'c1', name: "Joe's Plumbing", type: 'subcontractor' } },
    // Same company, second scope. One set of insurance, one card.
    { id: 'sc2', companies: { id: 'c1', name: "Joe's Plumbing", type: 'subcontractor' } },
  ],
  docs: [
    { id: 'd1', company_id: 'c1', type: 'coi', status: 'pending' as const, expiry_date: ymd(200) },
    { id: 'd2', company_id: 'c1', type: 'w9', status: 'approved' as const, expiry_date: null },
  ],
  requirements: [],
  projectId: 'p1',
}

const groups = complianceReport(RESPONSE)

// ── the key ─────────────────────────────────────────────────────────────────
ok(groups.length === 1, `THE BUG: two real documents produce a report (${groups.length} group)`)
ok(groups[0].docs.filter(d => d.onFile).length === 2,
  `...both of them (${groups[0].docs.filter(d => d.onFile).length} on file)`)
// The bug, reintroduced: the same payload read under the key the report used.
const wrongKey = complianceReport({ docs: (RESPONSE as any).documents, subcontracts: RESPONSE.subcontracts })
ok(wrongKey[0]?.docs.every(d => !d.onFile) ?? true,
  '...and reading `documents` really does produce nothing on file - that was the whole of it')

// ── the name, which is not on the document row ─────────────────────────────
ok(groups[0].name === "Joe's Plumbing",
  `a document is filed under the company's name (${groups[0].name}), never "Unknown"`)
ok(groups[0].companyId === 'c1', '...one card per company, not per subcontract')

// ── the label, which is not the column value ───────────────────────────────
const coi = groups[0].docs.find(d => d.type === 'coi')!
ok(coi.label === 'COI', `a document prints what the app calls it (${coi.label}), not the column`)
ok(!groups[0].docs.some(d => /undefined/.test(d.label)), '...and nothing prints as "undefined"')

// ── the date decides, at MIDNIGHT ───────────────────────────────────────────
ok(coi.status === 'approved',
  `a live COI reads as current even though the row says "pending" (${coi.status}) - `
  + 'the date decides, and a covered sub must not read as a problem')
const expired = complianceReport({ ...RESPONSE, docs: [{ ...RESPONSE.docs[0], expiry_date: ymd(-1) }] })
ok(expired[0].docs[0].status === 'expired', 'one that ran out yesterday is expired whatever the row says')
const today = complianceReport({ ...RESPONSE, docs: [{ ...RESPONSE.docs[0], expiry_date: ymd(0) }] })
ok(today[0].docs[0].status !== 'expired',
  `THE OTHER BUG: one expiring TODAY is still good today (${today[0].docs[0].status}) - `
  + 'comparing against the clock made it expired from midnight')
const soon = complianceReport({ ...RESPONSE, docs: [{ ...RESPONSE.docs[0], expiry_date: ymd(10) }] })
ok(soon[0].docs[0].status === 'expiring_soon', 'and one inside the window says so')
// The W-9 has no date, so the row is all there is to go on.
ok(groups[0].docs.find(d => d.type === 'w9')!.status === 'approved',
  'a document with NO date is whatever the row says - there is nothing to derive from')

// ── what is owed and not filed ──────────────────────────────────────────────
const missing = groups[0].docs.filter(d => !d.onFile).map(d => d.type)
ok(missing.includes('license') && missing.includes('workers_comp'),
  `a required document with nothing filed is listed as Missing (${missing.join(', ')})`)
ok(groups[0].docs.filter(d => !d.onFile).every(d => d.status === 'missing'), '...and says so')
ok(groups[0].actionRequired, '...which is what puts "Action required" on the group')
// ...unless the vendor does not owe it.
const waived = complianceReport({
  ...RESPONSE,
  requirements: [
    { company_id: 'c1', project_id: null, type: 'license', required: false },
    { company_id: 'c1', project_id: null, type: 'workers_comp', required: false },
  ],
})
ok(waived[0].docs.every(d => d.onFile),
  'a document this vendor was excused is not printed as missing - the report must not invent a problem')
ok(!waived[0].actionRequired, '...and the group is clean')

// A supplier owes a W-9 and not a licence.
const supplier = complianceReport({
  subcontracts: [{ id: 's', companies: { id: 'c2', name: 'Ace Supply', type: 'supplier' } }],
  docs: [], requirements: [], projectId: 'p1',
})
ok(supplier[0].docs.map(d => d.type).join(',') === 'w9',
  `a supplier is only asked for what a supplier owes (${supplier[0].docs.map(d => d.type).join(', ')})`)

// Nothing at all is not an error, and is not the same sentence.
ok(complianceReport({ subcontracts: [], docs: [], requirements: [] }).length === 0,
  'a job with no subs produces no groups')

// ── one answer, both screens ────────────────────────────────────────────────
ok(statusFromExpiry({ status: 'pending', expiry_date: ymd(-1) }) === 'expired',
  'the resolver is exported, because the tab and the printout must agree')
const tab = code('app/(dashboard)/projects/[id]/compliance/page.tsx')
ok(/import \{ statusFromExpiry \} from '@\/lib\/compliance-report'/.test(tab),
  '...and the Compliance tab imports it rather than keeping its own copy')
ok(!/function statusFromExpiry\(/.test(tab), '...which it no longer declares')

// ── the page reads the right keys ───────────────────────────────────────────
const report = code('app/(dashboard)/projects/[id]/reports/page.tsx')
ok(/subcontracts: d\.subcontracts, docs: d\.docs/.test(report),
  'THE FIX: the report reads the keys the route actually sends')
ok(!/d\.documents/.test(report) && !/d\.compliance\b/.test(report),
  '...and neither of the two it invented')
// `subcontractor_name` legitimately survives on the Invoice type beside it, so
// what is named here is the interface that described no table at all.
ok(!/doc_type/.test(report), '...nor `doc_type`, which is not a column on compliance_documents')
ok(!/interface ComplianceDoc \{/.test(report),
  '...and the type that declared three columns the row does not have is gone')
ok(/complianceReport\(\{/.test(report), 'the grouping is the shared one, not a second copy')
ok(!/new Date\(d\.expiry_date\) < today/.test(report), 'and it does not decide expiry by the clock any more')

done()

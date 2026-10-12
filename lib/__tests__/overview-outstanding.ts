// "Overview 'Outstanding to vendors' counts unapproved bills" - Maple Street
// Duplex showed "Outstanding to vendors $9,000" on its Overview while the
// Financial Summary and Master Money showed $0. The Overview route kept its
// own arithmetic, counting a bill as billed - and so owed - from the moment it
// was submitted. After #586 "outstanding" means approved and not yet paid,
// everywhere, and the approval queue is shown BESIDE it, never added into it.
//
// And while there: the Financial Summary counted 'approved' only, leaving out
// 'sent' bills (accepted, still unpaid - 22 of them live) that Master Money
// counts, and it summed `numeric` amounts with `+`, which concatenates strings.

import { ok, done, code } from './_helpers'
import { projectEscrow, awaitingApproval } from '../escrow'

const route = code('app/api/projects/[id]/overview/route.ts')
ok(/projectEscrow\(\{/.test(route), 'THE BUG: the Overview money position comes from the shared derivation')
ok(!/i\.status !== 'draft' && i\.status !== 'rejected'/.test(route),
  '...not its own rule counting every submitted bill as billed')
ok(!/Math\.max\(vendorBilled - vendorPaid, 0\)/.test(route), '...and it does not recompute outstanding itself')
ok(/pendingApproval,/.test(route), 'the approval queue travels beside it as its own number')

const page = code('app/(dashboard)/projects/[id]/overview/page.tsx')
ok(/`\$\{money\(pending\)\} more awaiting your approval`/.test(page),
  'the card names the queue in the Financial Summary\'s own words')
ok(/hint: pendingNote/.test(page) && /note: pendingNote/.test(page), '...on the desktop tile AND the phone card')

const fin = code('app/api/projects/[id]/financials/route.ts')
ok(/total_outstanding = projectEscrow\(/.test(fin), 'the Financial Summary reads outstanding from the same derivation')
ok(/ACTUAL_STATUSES\.has\(String\(inv\.status\)\) && inv\.status !== 'paid'/.test(fin),
  '...and counts sent bills as accepted, not only "approved"')
ok(!/sum \+ \(inv\.amount \?\? 0\)/.test(fin) && /toAmount\(inv\.amount\)/.test(fin),
  'amounts are read through toAmount, not concatenated as strings')

// The arithmetic, with amounts quoted the way PostgREST sends them.
const maple = [{ id: 'i1', amount: '9000.00', status: 'pending_approval', client_paid: null, escrow_paid: null }]
const e = projectEscrow({ feePct: 0, payments: [], invoices: maple, budgetLines: [], allocations: [] })
ok(e.outstandingToVendors === 0 && e.vendorBilled === 0, 'Maple Street Duplex: one $9,000 bill awaiting approval is $0 outstanding')
ok(awaitingApproval(maple) === 9000, '...and $9,000 awaiting approval')
const mixed = [
  { id: 'a', amount: '9000.00', status: 'pending_approval' },
  { id: 'b', amount: '5000.00', status: 'sent' },
  { id: 'c', amount: '2500.50', status: 'approved' },
  { id: 'd', amount: '1000.00', status: 'paid' },
]
const m = projectEscrow({ feePct: 0, payments: [], invoices: mixed as any, budgetLines: [], allocations: [] })
ok(m.outstandingToVendors === 7500.5, `sent + approved are outstanding, paid and pending are not (${m.outstandingToVendors})`)
ok(awaitingApproval(mixed as any) === 9000, '...two quoted amounts add as numbers, not strings')

done()

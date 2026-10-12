// "Master Money showed $0 outstanding while the job's Financial Summary had a
// $9k bill pending approval."
//
// Verified against the data: Maple Street Duplex had one $9,000 bill in
// pending_approval and nothing approved. Master Money counts approved-and-
// unpaid (the budget's own line, ACTUAL_STATUSES); the Financial Summary card
// added the approval queue into the same word. Same label, two meanings.

import { ok, done, code } from './_helpers'
import { masterMoneyRows } from '../master-money'

const fin = code('app/(dashboard)/projects/[id]/financials/page.tsx')
ok(/const totalOutstanding = data\.total_outstanding \?\? data\.total_approved\s*\n/.test(fin) && !/total_approved \+ data\.total_pending\s*\n\s*const remaining/.test(fin),
  'THE BUG: the Financial Summary Outstanding card is approved-and-unpaid, not approved + pending')
ok(/more awaiting your approval/.test(fin), '...and names the approval queue beside it rather than hiding it')

const mm = code('app/(dashboard)/master-money/page.tsx')
ok(/Outstanding <InfoHint[^>]*text=\{OUTSTANDING_EXPLAINED\}/.test(mm), 'Master Money says what its Outstanding counts')

// The rollup itself: a pending bill is not outstanding, an approved one is.
const rows = masterMoneyRows({
  projects: [{ id: 'p', name: 'Maple Street Duplex', status: 'active', contractor_fee_pct: 0 }] as any,
  budgetLines: [], subs: [], clientPayments: [], allocations: [],
  invoices: [{ id: 'i1', project_id: 'p', amount: '9000.00', status: 'pending_approval', client_paid: false, escrow_paid: false }] as any,
  committedFor: () => 0,
})
ok(rows[0].outstanding === 0, 'a $9,000 bill awaiting approval is not outstanding')
const approved = masterMoneyRows({
  projects: [{ id: 'p', name: 'x', status: 'active', contractor_fee_pct: 0 }] as any,
  budgetLines: [], subs: [], clientPayments: [], allocations: [],
  invoices: [{ id: 'i1', project_id: 'p', amount: '9000.00', status: 'approved', client_paid: false, escrow_paid: false }] as any,
  committedFor: () => 0,
})
ok(approved[0].outstanding === 9000, '...and the moment it is approved, it is')

done()

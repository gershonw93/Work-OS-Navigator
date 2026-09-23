// Master Money and the job's own tab must print the same escrow.
//
// THE BUG. The job's Billing the client tab worked the contractor fee out bill
// by bill (feeForInvoice); Master Money multiplied all vendor billing by the
// job's rate. So a job with a permit marked AT COST, or a bill SPLIT across a
// line at the job rate and a line at cost, showed two escrow figures. One
// derivation now (lib/escrow.ts), called by both routes.
//
// The fixture is PostgREST-shaped: numeric columns are STRINGS ("80.00"),
// because a fixture that types 80 passes code that breaks on every real row.

import { projectEscrow } from '../escrow'
import { masterMoneyRows } from '../master-money'
import { ok, done, code } from './_helpers'

const P = 'job-1'
const project = { id: P, name: 'Weisblum kitchen', status: 'active', contractor_fee_pct: '0.1500' }
const budgetLines = [
  { id: 'L-framing', project_id: P, budgeted_amount: '40000.00', markup_pct: null, markup_excluded: false },
  { id: 'L-permit', project_id: P, budgeted_amount: '2000.00', markup_pct: null, markup_excluded: true },
]
const invoices = [
  // an ordinary bill at the job rate: fee 15% of 10,000 = 1,500
  { id: 'I-plain', project_id: P, amount: '10000.00', status: 'approved', client_paid: '0', escrow_paid: '0', markup_pct: null, markup_excluded: false },
  // a permit AT COST: no fee
  { id: 'I-permit', project_id: P, amount: '2000.00', status: 'paid', client_paid: '0', escrow_paid: '2000.00', markup_pct: null, markup_excluded: true },
  // one bill split: 6,000 on framing (15%) + 4,000 on the at-cost line (0%) = 900
  { id: 'I-split', project_id: P, amount: '10000.00', status: 'sent', client_paid: '0', escrow_paid: '0', markup_pct: null, markup_excluded: false },
  // a draft does not count
  { id: 'I-draft', project_id: P, amount: '99999.00', status: 'draft', client_paid: null, escrow_paid: null, markup_pct: null, markup_excluded: false },
]
const allocations = [
  { invoice_id: 'I-split', budget_line_item_id: 'L-framing', amount: '6000.00' },
  { invoice_id: 'I-split', budget_line_item_id: 'L-permit', amount: '4000.00' },
]
const clientPayments = [{ project_id: P, amount: '25000.00' }]

// The job's own tab.
const tab = projectEscrow({ feePct: project.contractor_fee_pct, payments: clientPayments, invoices, budgetLines, allocations })
ok(tab.feeEarned === 2400, `the job's tab earns 1,500 + 0 + 900 = 2,400 (${tab.feeEarned})`)
ok(tab.escrowBalance === 25000 - 2000 - 2400, `...so escrow is 25,000 - 2,000 paid from escrow - 2,400 = 20,600 (${tab.escrowBalance})`)

// Master Money, from the same rows.
const [row] = masterMoneyRows({
  projects: [project], budgetLines, subs: [], invoices, clientPayments, allocations, committedFor: () => 0,
})
ok(row.escrow === tab.escrowBalance, `Master Money prints the same escrow as the job's tab (${row.escrow} vs ${tab.escrowBalance})`)
ok(row.billed === tab.vendorBilled && row.paid === tab.vendorPaid && row.received === tab.received
  && row.outstanding === tab.outstandingToVendors,
  '...and the same billed, paid, received and outstanding')

// Both routes call the one derivation and hold no copy of it.
const payments = code('app/api/projects/[id]/payments/route.ts')
const master = code('app/api/master/money/route.ts')
ok(/projectEscrow\(/.test(payments) && !/feeForInvoice\(/.test(payments), "the job's tab calls projectEscrow, not its own fee loop")
ok(/masterMoneyRows\(/.test(master) && !/contractor_fee_pct \?\? 0\)\s*$/m.test(master), 'Master Money builds its rows through masterMoneyRows')
ok(/invoice_allocations/.test(master), 'Master Money loads the allocations the per-bill fee needs')
ok(!/\.in\('project_id', \[/.test(master) && !/for \(const id of ids\)[\s\S]{0,80}await/.test(master),
  '...one query per table across all projects, never one per project')
done()

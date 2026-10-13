// ONE CHEQUE ACROSS A DEVELOPMENT'S HOUSES - "when a customer gives a payment,
// can i split it into different houses?", against invoices AND as lump sums.

import { splitProblem, shareRows, evenSplit, groupMemo } from '../development-payment'
import type { OpenInvoice } from '../invoice-settlement'
import { ok, done, code, read } from './_helpers'

const inv = (id: string, balance: number): OpenInvoice => ({ id, invoice_number: id.toUpperCase(), status: 'sent', balanceCents: balance * 100 })
const byHouse = new Map<string, OpenInvoice[]>([
  ['lot1', [inv('i1', 10000)]],
  ['lot2', [inv('i2', 5000)]],
  ['lot3', []],
])
const name = (id: string) => ({ lot1: 'Lot 1', lot2: 'Lot 2', lot3: 'Lot 3' } as Record<string, string>)[id] ?? id

// ── the split adds up to the cheque, to the cent ────────────────────────────
const both = [
  { project_id: 'lot1', invoices: [{ client_invoice_id: 'i1', amount: '10000' }] },
  { project_id: 'lot2', invoices: [{ client_invoice_id: 'i2', amount: '2500' }], other: '500' },
  { project_id: 'lot3', other: '7000' },
]
ok(splitProblem('20000', both, byHouse, name) === null, 'invoices on two houses, a lump sum on a third, and both on one house - adding up to the cheque - is accepted')
ok(/\$100 of the check is not on a house yet/.test(splitProblem('20100', both, byHouse, name) ?? ''), 'money left over is named, never quietly kept')
ok(/more than the check/.test(splitProblem('19000', both, byHouse, name) ?? ''), '...and so is a split that adds up to more')
ok(/^Lot 2: That is more than invoice I2 still owes/.test(splitProblem('6000', [{ project_id: 'lot2', invoices: [{ client_invoice_id: 'i2', amount: '6000' }] }], byHouse, name) ?? ''),
  'an invoice cannot be paid past what it owes, and the house is named')
ok(/not in this development/.test(splitProblem('10', [{ project_id: 'elsewhere', other: '10' }], byHouse, name) ?? ''), 'a house from another development is refused')
ok(/listed twice/.test(splitProblem('20', [{ project_id: 'lot3', other: '10' }, { project_id: 'lot3', other: '10' }], byHouse, name) ?? ''), 'a house listed twice is refused')
ok(/at least one house/.test(splitProblem('100', [], byHouse, name) ?? ''), 'a cheque on no house is refused')
ok(/Enter the amount/.test(splitProblem('', both, byHouse, name) ?? ''), 'a cheque needs an amount')

// ── what gets written ───────────────────────────────────────────────────────
const rows = shareRows(both)
ok(rows.length === 4, 'a house with invoice money AND a lump sum is TWO payments - an invoice payment and a deposit are different things in QuickBooks')
ok(rows.find(r => r.project_id === 'lot2' && r.allocations.length)?.amountCents === 250000 && rows.find(r => r.project_id === 'lot2' && !r.allocations.length)?.amountCents === 50000,
  '...each with its own amount')
ok(rows.reduce((t, r) => t + r.amountCents, 0) === 2000000, 'the rows add up to the cheque')

const even = evenSplit('100', ['a', 'b', 'c'])
ok(Array.from(even.values()).join() === '3334,3333,3333', '"Divide evenly" gives the odd cent to the first house, so the parts add back to the cheque')
ok(/^Part of check 10452 for \$20,000, split across 3 houses$/.test(groupMemo({ amount: 20000, reference: '10452', houses: 3 })), 'each share says what cheque it is part of')

// ── the routes ──────────────────────────────────────────────────────────────
const route = code('app/api/projects/[id]/development-payments/route.ts')
ok(/requirePermission\(db, request, 'payments', 'edit'\)/.test(route) && /ownedProject/.test(route), 'recording one needs payments:edit, on a development that is yours')
ok(/splitProblem\(body\?\.amount, shares, got\.byHouse/.test(route), 'the route asks the same question as the form, against balances it read itself')
ok(/eq\('parent_project_id', developmentId\)/.test(route), '...and only this development\'s houses can be paid')
ok(/const undo = async/.test(route) && /delete\(\)\.eq\('id', group\.id\)/.test(route), 'any failure takes the whole cheque back out - never half a cheque')
ok(!/insert\(rows\.map/.test(route), 'shares are inserted one at a time, so each is paired with its own invoices')
ok(/pushPaymentGroup\(db, group\.id\)/.test(route), 'and it goes to QuickBooks as a cheque')

const one = code('app/api/projects/[id]/payments/[paymentId]/route.ts')
ok((one.match(/await groupedRefusal\(/g) ?? []).length === 2, 'a single share cannot be edited or deleted from its house - only the whole cheque, from the development')
const del = code('app/api/projects/[id]/development-payments/[groupId]/route.ts')
ok(/syncInvoiceStatus/.test(del) && del.indexOf('client_payment_allocations(client_invoice_id)') < del.indexOf('.delete()'),
  'deleting the cheque reads what it paid FIRST, then puts those invoices back to owing')

// ── QuickBooks: one payment when it can be ──────────────────────────────────
const qb = code('lib/quickbooks-push.ts')
ok(/payment_group_id\) return pushPaymentGroup/.test(qb), 'a share goes across with its cheque - the backlog sync needs no changes')
ok(/allInvoices && nonePushed && oneCustomer/.test(qb), 'ONE QuickBooks payment only when every share pays invoices, none went alone, one customer')
ok(/claimForPush\(db, 'client_payment_groups', groupId\)/.test(qb), '...claimed atomically, like every other push')
ok(/update\(\{ qbo_id: qboId, qbo_synced_at: now, qb_entered: true, qbo_txn_type: 'payment' \}\)\s*\.eq\('payment_group_id', groupId\)/.test(qb),
  '...and every share carries its id, so none is pushed again on its own')
ok(/is not in QuickBooks yet/.test(qb.slice(qb.indexOf('export async function pushPaymentGroup'))), 'an invoice not in QuickBooks yet WAITS rather than splitting the cheque')

const mig = read('supabase/migrations/139_client_payment_groups.sql')
ok(/payment_group_id uuid REFERENCES client_payment_groups \(id\) ON DELETE CASCADE/.test(mig), 'a share is deleted with its cheque')
ok(/splitProblem\(/.test(code('components/projects/development-payment.tsx')), 'the form asks the rule before sending')

done()

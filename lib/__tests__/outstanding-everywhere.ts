// "One leftover: the Projects LIST card still reads 'Contract $48K Paid $0
// Outstanding $9K' for Maple." #586 fixed the Financial Summary and #588 the
// Overview, and each fix covered the screen it was reported on. The list card
// summed approved + pending (and skipped sent); the job Reports page counted
// every bill on record, drafts and rejected included; the sub's own job page
// counted every bill not rejected. Four rules under one word.
//
// So this pins the WORD, not a screen: every place that prints a vendor
// "Outstanding" reads it from lib/escrow.ts, and no file carries the
// approved + pending rule that started it.

import { ok, done, code, walk, read } from './_helpers'
import { vendorPosition } from '../escrow'

const SURFACES: Record<string, RegExp> = {
  'projects list (stats route)': /vendorPosition\(rows\)/,
  'job Reports': /vendorPosition\(invoices\)/,
  "sub's job page": /vendorPosition\(invoices\)/,
  'Overview route': /projectEscrow\(\{/,
  'Financial Summary route': /total_outstanding = projectEscrow\(/,
  'Billing the client route': /projectEscrow\(\{/,
  'Master Money': /projectEscrow\(/,
}
const FILES: Record<string, string> = {
  'projects list (stats route)': 'app/api/projects/stats/route.ts',
  'job Reports': 'app/(dashboard)/projects/[id]/reports/page.tsx',
  "sub's job page": 'app/(dashboard)/my-jobs/[projectId]/page.tsx',
  'Overview route': 'app/api/projects/[id]/overview/route.ts',
  'Financial Summary route': 'app/api/projects/[id]/financials/route.ts',
  'Billing the client route': 'app/api/projects/[id]/payments/route.ts',
  'Master Money': 'lib/master-money.ts',
}
for (const [name, re] of Object.entries(SURFACES)) {
  ok(re.test(code(FILES[name])), `${name} reads Outstanding from lib/escrow.ts`)
}

const stats = code('app/api/projects/stats/route.ts')
ok(!/\['approved', 'pending_approval'\]/.test(stats), 'THE BUG: the list card no longer counts pending bills as outstanding')
ok(/s\.awaitingApproval = v\.awaitingApproval/.test(stats), '...and carries the approval queue as its own number')
ok(/more awaiting your approval/.test(code('app/(dashboard)/projects/page.tsx')), '...which the card names under the figures')

// No file anywhere keeps the rule that started this.
const offenders = [...walk('app'), ...walk('components'), ...walk('lib')]
  .filter(f => !f.includes('__tests__'))
  .filter(f => /\['approved',\s*'pending_approval'\]|\['pending_approval',\s*'approved'\]/.test(read(f)))
ok(offenders.length === 0, `nothing counts approved + pending together${offenders.length ? ` - ${offenders.join(', ')}` : ''}`)

// The per-bill balance in the edit form is a different fact, so a different word.
ok(!/Outstanding to vendor:/.test(code('app/(dashboard)/projects/[id]/invoices/page.tsx')),
  'one bill\'s remaining balance is not called "Outstanding"')

// Maple Street Duplex, amounts quoted the way PostgREST sends them.
const maple = vendorPosition([{ amount: '9000.00', status: 'pending_approval' }])
ok(maple.outstanding === 0 && maple.paid === 0 && maple.awaitingApproval === 9000,
  'Maple: $0 outstanding, $0 paid, $9,000 awaiting approval')
const mix = vendorPosition([
  { amount: '5000.00', status: 'sent' },
  { amount: '2500.50', status: 'approved' },
  { amount: '1000.00', status: 'paid' },
  { amount: '700.00', status: 'draft' },
  { amount: '300.00', status: 'rejected' },
])
ok(mix.billed === 8500.5 && mix.outstanding === 7500.5 && mix.paid === 1000,
  `sent and approved are owed; drafts and rejected are nothing (${JSON.stringify(mix)})`)

done()

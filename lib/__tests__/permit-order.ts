// The expired permit - the only row needing anybody - rendered LAST, because the
// route returns newest-first and the page drew it as-is: approved, pending,
// expired. And its date line said "Expires Sep 8, 2026" fifteen days after Sep
// 8, a past date under a future-tense verb, beside a chip saying "expired".

import { sortPermits, permitRank } from '../permit-order'
import { expiryLabel, expiredAgo } from '../expiry'
import { ok, done, code } from './_helpers'

const TODAY = new Date('2026-09-23T10:00:00')

// ── the order ────────────────────────────────────────────────────────────────
// Exactly the reported list, in the order the route returned it.
const asReturned = [
  { id: 'approved', status: 'approved', expiry_date: '2027-06-01' },
  { id: 'pending', status: 'pending', expiry_date: null },
  { id: 'lapsed', status: 'approved', expiry_date: '2026-09-08' },
]
const sorted = sortPermits(asReturned, TODAY).map(p => p.id)
ok(sorted.join() === 'lapsed,pending,approved',
  `the expired permit goes first, then pending, then approved (got ${sorted.join()})`)
ok(asReturned[0].id === 'approved', '...and the input array is left alone')

const mixed = [
  { id: 'recorded', status: 'recorded', expiry_date: null },
  { id: 'soon-later', status: 'approved', expiry_date: '2026-10-20' },
  { id: 'rejected', status: 'rejected', expiry_date: null },
  { id: 'marked-expired', status: 'expired', expiry_date: null },
  { id: 'lapsed-recent', status: 'pending', expiry_date: '2026-09-20' },
  { id: 'soon-first', status: 'pending', expiry_date: '2026-09-25' },
  { id: 'lapsed-long', status: 'active', expiry_date: '2026-01-02' },
]
const mixedOrder = sortPermits(mixed, TODAY).map(p => p.id).join()
ok(mixedOrder === 'lapsed-long,lapsed-recent,marked-expired,soon-first,soon-later,rejected,recorded',
  `expired (longest lapsed first, undated last), expiring soon (soonest first), pending/rejected, then the rest (got ${mixedOrder})`)

// COMPLIANCE STATUS IS DATE-DRIVEN: the date outranks what the row says.
ok(permitRank({ status: 'approved', expiry_date: '2026-09-22' }, TODAY) === 0,
  'an "approved" permit whose date passed yesterday ranks as expired')
ok(permitRank({ status: 'expired', expiry_date: '2027-01-01' }, TODAY) === 3,
  'a row still marked expired with a date well ahead is current, not expired')
ok(permitRank({ status: 'approved', expiry_date: '2026-09-23' }, TODAY) === 1,
  'one expiring TODAY is still good today - expiring soon, not expired')

// ── the label ────────────────────────────────────────────────────────────────
const past = expiryLabel('2026-09-08', { today: TODAY })
ok(past === 'Expired Sep 8', `a past date reads "Expired Sep 8" (got ${past})`)
ok(expiryLabel('2026-09-23', { today: TODAY }) === 'Expires today', 'today reads "Expires today"')
ok(expiryLabel('2026-12-01', { today: TODAY }) === 'Expires Dec 1', 'a future date this year reads "Expires Dec 1"')
ok(expiryLabel('2027-03-01', { today: TODAY }) === 'Expires Mar 1, 2027', '...and carries the year when it is not this one')
ok(expiryLabel('2025-11-30', { today: TODAY }) === 'Expired Nov 30, 2025', '...both ways')
ok(expiryLabel(null) === null && expiryLabel('') === null && expiryLabel('nonsense') === null,
  'no date, no label')
ok(expiredAgo('2026-09-08', TODAY) === 'Expired 15 days ago', 'the one chip says how long ago')
ok(expiredAgo('2026-09-22', TODAY) === 'Expired 1 day ago', '...singular for one')
ok(expiredAgo('2026-09-23', TODAY) === null, '...and nothing for a permit still good today')

// ── the screens ask it ───────────────────────────────────────────────────────
const permits = code('app/(dashboard)/projects/[id]/permits/page.tsx')
ok(/sortPermits\(permits\)\.map/.test(permits), 'Permits renders the sorted list')
ok(/expiryLabel\(permit\.expiry_date\)/.test(permits), 'Permits words the date through expiryLabel')

// Every screen that printed `Expires ${formatDate(...)}` by hand now asks the
// shared labeller, so none can put a future verb on a past date.
for (const f of [
  'app/(dashboard)/projects/[id]/permits/page.tsx',
  'app/(dashboard)/projects/[id]/compliance/page.tsx',
  'app/(dashboard)/projects/[id]/reports/page.tsx',
  'app/(dashboard)/directory/page.tsx',
]) {
  const src = code(f)
  const name = f.split('/').slice(-2).join('/')
  ok(!/Expires:?\s*(\$\{|\{|<span[^>]*>\{)\s*formatDate\(/.test(src),
    `${name} has no hand-written "Expires <date>"`)
  ok(/expiryLabel\(/.test(src), `${name} uses expiryLabel`)
}

done()

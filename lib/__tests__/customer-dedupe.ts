// One client, one card.
//
// FOUND: the demo company showed two "QA Client - Weisblum" customers, created
// fourteen minutes apart. QA data - but POST /api/customers, the only place a
// customer row is ever created, inserted whatever it was given, so the New
// Customer form would file a real client twice just as happily.

import { ok, done, code } from './_helpers'
import { duplicateCustomer, duplicateCustomerMessage } from '../customer-dedupe'

const list = [
  { id: 'a', name: 'QA Client - Weisblum', email: 'qa.client@example.invalid' },
  { id: 'b', name: 'Smith Residence', email: null },
]

// The report, exactly: same name again, no email.
ok(duplicateCustomer(list, { name: 'QA Client - Weisblum', email: null })?.customer.id === 'a',
  'the same name again is the same customer')
ok(duplicateCustomer(list, { name: '  qa client  -   weisblum ', email: '' })?.by === 'name',
  '...trimmed, case-folded and whitespace-collapsed')
ok(duplicateCustomer(list, { name: 'Pat Test', email: 'QA.Client@example.invalid' })?.by === 'email',
  'one inbox is one client, whatever the new card is called')

// Exact, never fuzzy - a wrong refusal blocks a real second client.
ok(duplicateCustomer(list, { name: 'Smith', email: null }) === null, 'a shorter name is not a match')
ok(duplicateCustomer(list, { name: 'Smith Residence 2', email: null }) === null, 'a longer name is not a match')
ok(duplicateCustomer([{ id: 'c', name: 'X', email: null }], { name: 'Y', email: '' }) === null,
  'a blank email never matches a blank email')

const msg = duplicateCustomerMessage({ customer: list[0], by: 'name' })
ok(/QA Client - Weisblum/.test(msg), 'the refusal names the customer that already exists')

// The route asks, BEFORE the insert, scoped to this company.
const route = code('app/api/customers/route.ts')
const post = route.slice(route.indexOf('export async function POST'), route.indexOf('export async function PATCH'))
ok(/duplicateCustomer\(/.test(post), 'POST /api/customers checks for a duplicate')
ok(post.indexOf('duplicateCustomer(') < post.indexOf('.insert('), '...before it inserts')
ok(/\.eq\('gc_company_id', profile\.company_id\)/.test(post), "...against this company's customers only")
ok(/status: 409/.test(post), '...and refuses with a 409 the form shows')
ok(/if \(listError\)/.test(post), 'a failed duplicate check is not read as "no duplicates"')

done()

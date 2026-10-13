// "why cant i assign the entire job to a customer?" - the Projects list's Edit
// box typed a client into `projects.client` only, and a development's customer
// never reached its houses.

import { housesToFollow, housesSentence } from '../development-customer'
import { ok, done, code } from './_helpers'

const houses = [
  { id: 'a', name: 'Lot 1', customer_id: null },
  { id: 'b', name: 'Lot 2', customer_id: 'old' },
  { id: 'c', name: 'Lot 3', customer_id: 'buyer' },
]
const r = housesToFollow(houses, 'old')
ok(r.follow.join() === 'a,b', 'a house with no customer, or still on the development\'s old one, follows')
ok(r.kept.join() === 'Lot 3', '...a house given its own customer is left alone, and named')
ok(housesToFollow(houses, null).follow.join() === 'a', 'with no old customer, only the houses with none follow')
ok(housesSentence({ updated: 2, kept: ['Lot 3'] }) === 'Customer set on 2 houses in this development. Left alone: Lot 3 - it has a different customer of its own.', 'the save says what it did to the houses')
ok(housesSentence({ updated: 0, kept: [] }) === null, '...and says nothing when there is nothing to say')

const route = code('app/api/projects/[id]/route.ts')
ok(/ownedProject<[^>]*>\(\s*db, actor as any, params\.id/.test(route), 'a job of another company cannot be edited - the cascade writes to its houses')
ok(/from\('customers'\)\.select\('id, name'\)\s*\.eq\('id', customer_id\)\.eq\('gc_company_id'/.test(route), 'a picked customer must be one of yours')
ok(/customerForNewProject\(db, actor\?\.companyId/.test(route), 'a typed new customer becomes a card, by the create form\'s rule')
ok(/updates\.client = customerName = /.test(route), 'what the header prints follows the card')
ok(/housesToFollow\(/.test(route) && /\.eq\('parent_project_id', params\.id\)/.test(route), 'a development\'s customer goes on to its houses')

const page = code('app/(dashboard)/projects/page.tsx')
ok(!/setEditClient|client: editClient/.test(page), 'the Projects list no longer writes a free-text client')
ok(/new_customer_name: editNewCustomer\.trim\(\)/.test(page) && /customer_id: editCustomerId \|\| null/.test(page), '...it picks a customer card, or names a new one')
ok(/customer_id, address, client, lat, lng, geocoded_address, interior_sqft, exterior_sqft, parent_project_id, is_site, unit, floor, billing_mode, default_retainage_pct/.test(code('app/api/projects/route.ts')),
  'the list sends billing_mode - without it the Edit box opened on Simple and saving switched an AIA job')

done()

// "Maple project header says 'Maple Street Properties', but the customer is
// missing from the Customers list and Project Settings shows 'No customer'."
//
// "+ New client…" stored the typed name in projects.client and never created a
// customers row. The header reads the text; Customers reads `customers`;
// Settings reads `customer_id`. Fourteen live jobs, all of them typed clients.

import { ok, done, code, read } from './_helpers'

const route = code('app/api/projects/route.ts')
ok(/customerForNewProject\(admin, profile\.company_id, client\)/.test(route),
  'THE BUG: creating a job with a typed client resolves it to a customer')
ok(/customer_id: customer_id \|\| linked\?\.id \|\| null/.test(route),
  '...and links the job to it')
ok(/client: linked \? linked\.name : client/.test(route),
  '...with the header text taken from the customer, so the two cannot differ')

const helper = code('lib/project-customer.ts')
ok(/duplicateCustomer\(/.test(helper), 'an existing card with that name is reused, by the Customers page rule')
ok(/from\('customers'\)\s*\.insert\(\{ gc_company_id: companyId, name: typed \}\)/.test(helper),
  '...and otherwise one is created in the job owner\'s company')

const edit = code('components/layout/edit-project-button.tsx')
ok(/const client = !customerId \? null/.test(edit),
  'Settings: choosing "No customer" clears the name too, rather than keeping the old one')

const mig = read('supabase/migrations/137_link_typed_clients.sql')
ok(/insert into customers/i.test(mig) && /update projects p\s+set customer_id = c\.id/i.test(mig),
  'the jobs made before the fix are linked by a migration')
ok(/lower\(trim\(c\.name\)\) = lower\(trim\(p\.client\)\)/.test(mig), '...matching the way the Customers page does')

done()

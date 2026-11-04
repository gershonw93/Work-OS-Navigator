// "its not populating my client list" - over Bulk Add Projects, where Client
// was a free-text box: no list, and a batch never reached Customers.

import { ok, done, code } from './_helpers'

const modal = code('components/projects/bulk-add-modal.tsx')
ok(/fetch\('\/api\/customers'/.test(modal), 'the bulk modal loads the company\'s customers')
ok((modal.match(/<ClientPicker /g) ?? []).length === 2, '...and both client boxes (lot list and unit/floor/street) are the picker')
ok(!/id="bulk-client(-l)?" value=\{client\}/.test(modal), '...never a bare text box again')
ok(/^function ClientPicker\(/m.test(modal), 'the picker is hoisted, not declared inside the modal')
ok(/customers === null \? 'Loading your clients\.\.\.'/.test(modal), '"No client" is not said while the list is still loading')

const route = code('app/api/projects/bulk/route.ts')
ok(/\.eq\('id', customer_id\)\.eq\('gc_company_id', profile\.company_id\)/.test(route),
  'a picked customer id must be one of THIS company\'s customers - an id from a body is a claim')
ok(/customerForNewProject\(db as any, profile\.company_id, clientName\)/.test(route),
  'a typed new client becomes a customer card, reusing one with the same name')
ok(/customer_id: customerId/.test(route) && !/\.\.\.\(customer_id \? \{ customer_id \} : \{\}\)/.test(route),
  'the jobs carry the resolved card, never the raw body id')

done()

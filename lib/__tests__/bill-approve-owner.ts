// Approving a sub's bill pushes it into the GC's QuickBooks. The bill route
// asked only `invoices: edit`, so the admin of a sub's own company - invited
// onto the job, holding that permission in their own company - could approve
// or delete their own bill. Both handlers now also ask whose job it is.

import { ok, done, code } from './_helpers'

const src = code('app/api/projects/[id]/invoices/[invoiceId]/route.ts')
for (const verb of ['PATCH', 'DELETE']) {
  const start = src.indexOf(`export async function ${verb}(`)
  const next = src.indexOf('export async function', start + 10)
  const body = src.slice(start, next < 0 ? undefined : next)
  ok(/requirePermission\(db, request, 'invoices', 'edit'\)/.test(body), `${verb} needs invoices: edit`)
  ok(/ownedProject\(db, gate\.actor, params\.id/.test(body) && body.indexOf('ownedProject(') < body.indexOf('request.json') + (verb === 'DELETE' ? 1e9 : 0),
    `${verb} is the GC's job only - a sub on it cannot approve or delete its own bill`)
  ok(!/auth\.getUser\(/.test(body), `${verb} has no second, bare sign-in check`)
}
done()

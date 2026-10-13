// A Directory card's profile returned any company's subcontracts, bills,
// payment schedule and insurance documents - across every GC that company
// works for - to any account that was signed in, by company id alone.
// Now: `directory: view`, only a company the viewer's Directory shows, and
// only rows on jobs the viewer's company is on.

import { ok, done, code } from './_helpers'

const src = code('app/api/directory/[companyId]/profile/route.ts')

ok(!/auth\.getUser\(/.test(src), 'no bare "are you signed in" check')
ok(/requirePermission\(db, request, 'directory', 'view'\)/.test(src), 'reading a profile needs directory: view')
ok(/if \(!related\) return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\)/.test(src),
  'a company with no relationship to the viewer is refused, in the same words as one that does not exist')
ok(/added_by_company_id === mine/.test(src) && /gcOfMine/.test(src) && /\.in\('project_id', ownedIds\)/.test(src),
  '...and "related" is the Directory list\'s own set: added by us, the GC on a job we sub on, a sub on our job')

const subs = src.slice(src.indexOf("db.from('subcontracts')\n      .select('id, scope"))
ok(/\.in\('project_id', onMyJobs\)/.test(subs.slice(0, 300)), 'their subcontracts: only on jobs the viewer is on')
const inv = src.slice(src.indexOf("db.from('invoices')"))
ok(/\.in\('project_id', onMyJobs\)/.test(inv.slice(0, 400)), 'their bills: only on jobs the viewer is on')
const comp = src.slice(src.indexOf("db.from('compliance_documents')"))
ok(/project_id\.is\.null,project_id\.in\./.test(comp.slice(0, 300)), 'their job documents: only on jobs the viewer is on')

done()

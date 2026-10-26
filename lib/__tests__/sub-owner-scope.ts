// THE SUBCONTRACTOR OWNER'S ACCOUNT, checked against the scope review of it
// (October 2026). Company type only ever changed MENUS; the server answers
// role x resource plus "is this your job", so every limit a sub's screens imply
// has to be asked again on the route or it is decoration. Four places where it
// was not, each pinned here.

import { ok, done, code } from './_helpers'

// ── 1. The Estimate is the owner's ─────────────────────────────────────────
// GET /projects/[id]/quote answered any signed-in account holding a project
// id: every budget line, the money received, the hours clocked.
const quote = code('app/api/projects/[id]/quote/route.ts')
const handler = (src: string, verb: string) => {
  const at = src.indexOf(`export async function ${verb}(`)
  const next = src.indexOf('export async function', at + 10)
  return at < 0 ? '' : src.slice(at, next < 0 ? undefined : next)
}
const qGet = handler(quote, 'GET')
ok(qGet.length > 0, 'the quote route has a GET to check')
ok(/ownedProject\(db, actor, params\.id/.test(qGet), 'quote GET: only the company that owns the job reads its estimate')
ok(/actorCan\(actor, 'quotes', 'view'\)/.test(qGet) && /actorCan\(actor, 'progress', 'view'\)/.test(qGet),
  '...and only with quotes (the Estimate tab) or progress (the Progress tab draws these lines)')
for (const verb of ['POST', 'PATCH', 'DELETE']) {
  ok(/ownedProject\(admin\(\), gate\.actor, params\.id/.test(handler(quote, verb)),
    `quote ${verb}: writing the estimate needs the job to be the caller's, not just the permission`)
}

// The tab that leads there asks the same question.
const tabs = code('components/layout/project-tabs.tsx')
ok(/slug === 'quote'\) return isSub && !!ctx\?\.owns && can\('quotes', 'view'\)/.test(tabs),
  'the Estimate tab asks `quotes`, so a field worker is not shown a tab of prices')

// ── 2. A sub's crew sees the jobs they are on ──────────────────────────────
const myJobsRoute = code('app/api/my-jobs/route.ts')
const mjGet = handler(myJobsRoute, 'GET')
ok(/isAssignedOnly\(profile\.role\)/.test(mjGet) && /myJobs\(db, user\.id, profile\)/.test(mjGet),
  'my-jobs: an assigned-only role resolves the jobs THIS person is on')
ok(/own,\n/.test(mjGet) && /\.filter\(\(p: \{ id: string \}\) => assigned\.includes\(p\.id\)\)/.test(mjGet),
  '...and the own-jobs list returned is that filtered one, not the whole company\'s')

const projectsRoute = code('app/api/projects/route.ts')
const subBranch = projectsRoute.slice(projectsRoute.indexOf("type === 'subcontractor'"), projectsRoute.indexOf('// Restricted roles only see projects'))
ok(subBranch.length > 0, 'the projects list still has a subcontractor branch to check')
ok(/RESTRICTED_ROLES\.includes\(profile\.role\)/.test(subBranch) && /projectIds\.includes\(p\.id\)/.test(subBranch),
  'projects list: the subcontractor branch applies the assigned-only rule before it returns')

// ── 3. Awarding is the job owner's, and finds the vendor the GC meant ───────
const award = code('app/api/projects/[id]/quotes/[compId]/award/route.ts')
ok(/ownedProject\(admin\(\), gate\.actor, params\.id/.test(award),
  'award: only the company that owns the job can award on it')
const lookup = award.slice(award.indexOf("const { data: existing } = await db"), award.indexOf('.maybeSingle()', award.indexOf("const { data: existing } = await db")))
ok(lookup.length > 0, 'award: the vendor lookup is still there to check')
ok(/\.eq\('added_by_company_id', myCompanyId\)/.test(lookup),
  'award: a vendor is matched by name only inside THIS company\'s Directory')
ok(/\.ilike\('name', escapeLike\(vendorName\)\)/.test(lookup), '...with the name escaped, so % and _ are not wildcards')
ok(/const invitedId = typeof quote\.data\?\.vendor_company_id === 'string'/.test(award) && /if \(invited\) \{\s*companyId = invited\.id/.test(award),
  'award: the company the GC invited to bid wins over any name match')
const toComparison = code('app/api/projects/[id]/bid-requests/[reqId]/to-comparison/route.ts')
ok(/bid_invites\(vendor_name, vendor_email, vendor_company_id\)/.test(toComparison) &&
   /vendor_company_id: s\.bid_invites\?\.vendor_company_id \?\? null/.test(toComparison),
  '...which means the quote pulled from a bid request carries that company id')

// ── 4. The sub menu is filtered by permission ──────────────────────────────
const sidebar = code('components/layout/sidebar.tsx')
ok(/SUB_NAV\.filter\(item => item\.resource === null \|\| \(!permsLoading && can\(item\.resource, 'view'\)\)\)/.test(sidebar),
  'sidebar: the subcontractor menu drops what the role cannot open')
for (const [label, resource] of [['Customers', 'customers'], ['Directory', 'directory'], ['Files', 'files'], ['Approvals', 'approvals']]) {
  ok(new RegExp(`label: '${label}', href: '[^']+', icon: \\w+, resource: '${resource}'`).test(sidebar.slice(sidebar.indexOf('const SUB_NAV'))),
    `sidebar: sub menu ${label} is gated on ${resource}`)
}
// My Bids must NOT be gated on `bids`: the invited-vendor role (read_only)
// holds bids: N, and it is that role's main screen.
ok(/label: 'My Bids', href: '\/my-bids', icon: \w+, resource: null/.test(sidebar),
  'sidebar: My Bids stays open to every sub - it is their own list')

done()

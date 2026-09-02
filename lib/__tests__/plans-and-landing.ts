// Two small ones the tester found, both the same shape as everything else:
// two sources for one fact.
//
// 1. Opening a job from the Projects list landed on Plans - a file list as the
//    front door of a live job. /projects/<id> has redirected to the Overview for
//    a while; the one screen everybody opens jobs from was linking past it.
// 2. The website offers Crew / Company / Scale with NO prices and an FAQ headed
//    "Why is there no price on this page?". The app's Settings -> Billing
//    offered Starter / Pro / Enterprise and put $49 / mo on the middle one. The
//    product was quoting a price the business had decided not to publish.

import { PLANS, PLAN_CTA_HREF } from '../plans'
import { ok, done, code } from './_helpers'

// ── opening a job lands on the overview ──────────────────────────────────────
const list = code('app/(dashboard)/projects/page.tsx')
ok(/is_site \? `\/projects\/\$\{p\.id\}\/units` : `\/projects\/\$\{p\.id\}`/.test(list),
  'the projects list opens a job at /projects/<id>, which redirects to the overview')
ok(!/`\/projects\/\$\{p\.id\}\/plans`/.test(list), '...and no longer links straight to Plans')

const index = code('app/(dashboard)/projects/[id]/page.tsx')
ok(/redirect\(`\/projects\/\$\{params\.id\}\/overview`\)/.test(index), 'that redirect still points at the overview')

// The overview sends a subcontractor or a site on to Plans itself, which is why
// the list can link to /projects/<id> without knowing who is looking.
const overview = code('app/(dashboard)/projects/[id]/overview/page.tsx')
ok(/router\.replace\(`\/projects\/\$\{params\.id\}\/plans`\)/.test(overview),
  'and anyone without an overview is still sent on to Plans')

const created = code('app/(dashboard)/projects/new/page.tsx')
ok(/router\.push\(`\/projects\/\$\{project\.id\}`\)/.test(created), 'a job you just created opens there too')

// ── one plans list, and it names no price ────────────────────────────────────
ok(PLANS.length === 3, 'there are three plans')
ok(PLANS.map(p => p.name).join(',') === 'Crew,Company,Scale',
  'they are the ones the website offers - Crew, Company, Scale')

// The specific claim that was wrong. No price anywhere in the shared list, and
// the app must not print one of its own.
const asJson = JSON.stringify(PLANS)
ok(!/\$\d/.test(asJson), 'no plan carries a price - the website deliberately prints none')
ok(!/\bPro\b|Starter|Enterprise/.test(asJson), 'and the invented tier names are gone')

const settings = code('app/(dashboard)/settings/page.tsx')
ok(/from '@\/lib\/plans'/.test(settings), 'Settings renders the shared list')
ok(!/\$49/.test(settings), '...and no longer prints $49 / mo')
ok(!/name: 'Pro'/.test(settings), '...or a Pro tier that does not exist')

const pricing = code('app/(marketing)/pricing/page.tsx')
ok(/from '@\/lib\/plans'/.test(pricing), 'the pricing page renders the same list')
ok(!/name: 'Crew'/.test(pricing), '...rather than its own copy of it')

ok(PLAN_CTA_HREF === '/contact', 'both send you to the same place to talk about it')
ok(PLANS.every(p => p.cta === 'Book a setup'), '...with the same call to action')
ok(PLANS.filter(p => p.featured).length === 1, 'exactly one plan is highlighted')

done()

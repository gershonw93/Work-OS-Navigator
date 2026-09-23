// One name per screen.
//
// A UX review found menus and pages disagreeing about what a screen is called:
// the Finance menu said "Summary" and the page said "Financials"; the menu said
// "Pay Apps", the page "Applications for Payment" and the top bar "Pay
// Applications" - three names for one screen. "Quotes & Bids" opened "Quotes",
// "Subs & Team" opened "Team", "Jobs" opened "Jobs on this site", and a link on
// Bills from subs sent you to "Payments", a tab the menu calls "Billing the
// client". Every one of them compiled, rendered and passed every
// suite, because each name was right on its own - it was the PAIR that was
// wrong, and nothing looked at pairs.
//
// The decision: the page title follows the MENU label (that is the word people
// clicked, so it is the word they expect to land on), and URLs stay as they are
// - they are in bookmarks and in emails already sent. "Summary" was the one
// menu label worse than its page: alone as an <h1> it could be the Overview or
// the Project Summary on Reports, so both became "Financial Summary".
//
// What this pins, per menu:
//   * every project tab's label == the first <h1> of its page
//   * the permission grid (Settings -> Permissions) names a tab's screen the way
//     the tab does
//   * the top bar's breadcrumb READS the tab list rather than keeping its own
//   * every sidebar entry == its page's <h1>, where the page has one
//   * every Settings tab == its section's <h2>, where the section has one

import { ok, done, code, exists } from './_helpers'

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/\s+/g, ' ').trim()

/**
 * The text a heading shows, from its source. `{cond ? x : 'Plans'}` shows the
 * literal fallback, which is the name; an icon element beside the words is
 * dropped.
 */
function headingText(inner: string): string {
  if (inner.includes('{')) {
    const lits = Array.from(inner.matchAll(/'([^']+)'/g)).map(m => m[1])
    if (lits.length) return decode(lits[lits.length - 1])
  }
  return decode(inner.replace(/<[^>]*>/g, ''))
}

/** The first page title in a file: an <h1>, or a <PageHeader title="...">. */
function pageTitle(src: string): string | null {
  const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)
  const ph = src.match(/<PageHeader[^>]*?\stitle="([^"]+)"/)
  if (h1 && (!ph || h1.index! < ph.index!)) return headingText(h1[1])
  if (ph) return decode(ph[1])
  return null
}

// ── the project tabs ─────────────────────────────────────────────────────────
const tabsSrc = code('components/layout/project-tabs.tsx')
const tabs = Array.from(tabsSrc.matchAll(/\{ label: '([^']+)', slug: '([^']+)'/g)).map(m => ({ label: m[1], slug: m[2] }))
// Before trusting any "they all match": the parse found the menu.
ok(tabs.length >= 25, `the project menu was parsed (${tabs.length} tabs)`)

const bySlug = new Map(tabs.map(t => [t.slug, t.label]))

// A tab whose page file holds no <h1> of its own - the title, if any, lives in
// a shared component. Named, so a new one cannot slip past as "no title".
const NO_H1_IN_PAGE = new Set(['materials'])

for (const t of tabs) {
  const file = `app/(dashboard)/projects/[id]/${t.slug}/page.tsx`
  if (!exists(file)) { ok(false, `${t.slug}: page file exists`); continue }
  const title = pageTitle(code(file))
  if (NO_H1_IN_PAGE.has(t.slug)) {
    ok(title === null, `${t.slug}: still has no <h1> of its own (else drop it from NO_H1_IN_PAGE)`)
    continue
  }
  ok(title === t.label, `${t.slug}: menu "${t.label}" == page title "${title}"`)
}

// The pairs the review reported, by name - so the generic loop above cannot
// pass by having quietly stopped seeing one of them.
const reported: [string, string][] = [
  ['payments', 'Billing the client'],
  ['financials', 'Financial Summary'],
  ['pay-apps', 'Pay Apps'],
  ['request-quotes', 'Quotes & Bids'],
  ['team', 'Subs & Team'],
  ['units', 'Jobs'],
  ['invoices', 'Bills from subs'],
]
for (const [slug, label] of reported) ok(bySlug.get(slug) === label, `reported pair: /${slug} is "${label}" in the menu`)

// ── the permission grid names the same screens ───────────────────────────────
const perms = code('lib/permissions.ts')
const resources = Array.from(perms.matchAll(/\{ key: '([^']+)',\s*label: '([^']+)',\s*group: '[^']+',\s*slug: '([^']+)' \}/g))
  .map(m => ({ key: m[1], label: m[2], slug: m[3] }))
ok(resources.length >= 20, `the permission resources were parsed (${resources.length})`)
for (const r of resources) {
  const tab = bySlug.get(r.slug)
  if (!tab) continue // `quotes` is a redirect alias with no tab of its own
  ok(r.label === tab, `permission "${r.key}" is labelled "${tab}" like its tab (is "${r.label}")`)
}

// ── the breadcrumb reads the menu ────────────────────────────────────────────
const topNav = code('components/layout/top-nav.tsx')
ok(/export function projectTabLabel/.test(tabsSrc), 'project-tabs exports the one name lookup')
ok(/projectTabLabel\(parts\[3\]\)/.test(topNav), 'the top bar breadcrumb asks projectTabLabel')
ok(!/sectionMap/.test(topNav), 'and keeps no second table of project section names')

// ── in-page links that name another tab use its name ────────────────────────
const invoices = code('app/(dashboard)/projects/[id]/invoices/page.tsx')
ok(/'pay-apps' : 'payments'/.test(invoices), 'fixture: Bills from subs still links to the client-billing tab')
ok(/\? 'Pay Apps' : 'Billing the client'\}/.test(invoices), '...and calls it "Billing the client", not "Payments"')
const payApps = code('app/(dashboard)/projects/[id]/pay-apps/page.tsx')
ok(/\/invoices`\}[^>]*>Bills from subs<\/Link>/.test(payApps), 'Pay Apps links to Bills from subs by that name')

// ── the sidebar ──────────────────────────────────────────────────────────────
const sidebar = code('components/layout/sidebar.tsx')
const navs = Array.from(sidebar.matchAll(/\{ label: '([^']+)', href: '(\/[^']+)'/g)).map(m => ({ label: m[1], href: m[2] }))
ok(navs.length >= 10, `the sidebar was parsed (${navs.length} entries)`)
// `/directory` is being renamed in a parallel change ("Contacts Directory" ->
// "Directory"); remove this line once it has merged.
const SIDEBAR_PENDING = new Set(['/directory'])
let sidebarChecked = 0
for (const n of navs) {
  const file = `app/(dashboard)${n.href}/page.tsx`
  if (SIDEBAR_PENDING.has(n.href) || !exists(file)) continue
  const title = pageTitle(code(file))
  if (title === null) continue // no title on the page to disagree with
  sidebarChecked++
  ok(title === n.label, `sidebar "${n.label}" == ${n.href} title "${title}"`)
}
ok(sidebarChecked >= 6, `sidebar pages with a title were compared (${sidebarChecked})`)

// ── Settings tabs ────────────────────────────────────────────────────────────
const settings = code('app/(dashboard)/settings/page.tsx')
const settingsTabs = Array.from(settings.matchAll(/\{ id: '([^']+)',\s*label: '([^']+)'/g)).map(m => ({ id: m[1], label: m[2] }))
ok(settingsTabs.length >= 10, `the Settings tabs were parsed (${settingsTabs.length})`)
let sectionsChecked = 0
for (const t of settingsTabs) {
  const at = settings.indexOf(`activeTab === '${t.id}' && (`)
  if (at < 0) continue
  const head = settings.slice(at, at + 600).match(/<h2[^>]*>([\s\S]*?)<\/h2>/)
  if (!head) continue
  sectionsChecked++
  ok(headingText(head[1]) === t.label, `Settings tab "${t.label}" == its section heading "${headingText(head[1])}"`)
}
ok(sectionsChecked >= 2, `Settings sections with a heading were compared (${sectionsChecked})`)

done()

// A PREVIEW SHOWS WHAT THAT ROLE WOULD SEE - AND A SCREEN ASKS BEFORE IT LOADS.
//
// The owner's QA of the sub account, six findings:
//  1. View as Worker opened Service Calls (live customers, issues, times, New
//     call), Dispatch and Customers (New call, New Customer, Bulk Add Projects)
//     with every permission at zero. A real Worker was always refused by the
//     ROUTES; the preview lied because its requests carry the admin's token
//     and these pages never asked `can()`. Field Worker saw New call with
//     create = 0 for the same reason.
//  2. The permissions grid printed "Quotes & Bids" twice (pinned in
//     screen-names.ts, which owns resource naming).
//  3. "Preview as a teammate" sat behind an icon-only tab and the visible
//     picker listed only roles.
//  4. Settings > Profile under a preview showed the ADMIN's account with live
//     Save, Change Password and Delete my account.
//  5. A sub's Worker got My Bids and Approvals - empty pages.
//  6. A hard reload painted a menu of "My Work" alone, then filled in.

import { ok, done, code } from './_helpers'

function main() {
  // ── 1. every screen asks, before it fetches ──
  const screens: [string, string][] = [
    ['app/(dashboard)/service-calls/page.tsx', 'service-calls'],
    ['app/(dashboard)/service-calls/[callId]/page.tsx', 'service-calls'],
    ['app/(dashboard)/dispatch/page.tsx', 'dispatch'],
    ['app/(dashboard)/customers/page.tsx', 'customers'],
    ['app/field/calls/page.tsx', 'service-calls'],
  ]
  for (const [file, resource] of screens) {
    const src = code(file)
    ok(src.includes(`useScreenAccess('${resource}')`), `${file} asks for ${resource}: view`)
    ok(/if \(access !== 'yes'\) return <ScreenAccessNotice/.test(src), `${file} renders the notice instead of itself when the answer is not yes`)
  }
  for (const file of ['app/(dashboard)/service-calls/page.tsx', 'app/(dashboard)/dispatch/page.tsx', 'app/field/calls/page.tsx']) {
    ok(/useEffect\(\(\) => \{ if \(access === 'yes'\) load\(\) \}, \[load, access\]\)/.test(code(file)), `${file} fetches nothing until access is yes`)
  }
  ok(/if \(access !== 'yes'\) return\n/.test(code('app/(dashboard)/customers/page.tsx')), 'Customers fetches nothing until access is yes')

  const calls = code('app/(dashboard)/service-calls/page.tsx')
  ok(/canCreate = perms\.can\('service-calls', 'create'\) && !crewMode/.test(calls) && /\{canCreate && <Button/.test(calls), 'New call asks service-calls: create (Field Worker has create = 0)')
  ok(/crewMode = crewView \|\| isAssignedOnly\(perms\.role\)/.test(calls), 'crew-ness follows the role on screen, so a preview of a crew role gets the crew view')
  const board = code('app/(dashboard)/dispatch/page.tsx')
  ok(/isAssignedOnly\(perms\.role\) \? 'no'/.test(board), 'Dispatch is refused to every crew role, as the route refuses them')
  ok(/\{canCreate && <Button onClick=\{\(\) => setCreating/.test(board) && /if \(canCreate\) onSlotClick/.test(board), 'Dispatch offers New call and slot-click only with create')
  const customers = code('app/(dashboard)/customers/page.tsx')
  ok(/canAddCustomer = perms\.can\('customers', 'edit'\)/.test(customers) && /\{canAddCustomer && \(/.test(customers), 'New Customer asks the route\'s own permission (customers: edit)')
  ok(/canBulkAdd = perms\.can\('projects', 'create'\)/.test(customers) && /\{canBulkAdd && \(/.test(customers), 'Bulk Add Projects asks projects: create')
  ok(/\{canAddProject && <button/.test(customers), 'a card\'s Add Project asks projects: create too')
  ok(/if \(!res\.ok\) \{ setFailed/.test(customers), 'a refused or failed customers read is said, never "No customers yet"')
  const detail = code('components/service-calls/call-detail.tsx')
  ok(/crewMode = d\.crewView \|\| isAssignedOnly\(viewRole\)/.test(detail) && !/!d\.crewView/.test(detail), 'the call page\'s office controls follow the role on screen')
  const field = code('app/field/calls/page.tsx')
  ok(/setCalls\(roleOnlyPreview \? \[\] : mine\.sort\(soonest\)\)/.test(field), 'Field Mode in a ROLE preview lists no calls (it would be the admin\'s whole board) and a PERSON preview lists only theirs')

  // ── 3. people are in the picker ──
  const sw = code('components/layout/view-as-switcher.tsx')
  ok(/value=\{`user:\$\{t\.id\}`\}/.test(sw) && /value=\{`role:\$\{r\.value\}`\}/.test(sw), 'one picker lists roles AND teammates')
  ok(!/setTab\(/.test(sw), 'no hidden tab between them')
  ok(/filter\(t => t\.id !== session\.user\.id\)/.test(sw), 'everybody but you is offered')
  ok(/could not load your team/.test(sw), 'a failed teammate read says so in the list')

  // ── 4. a preview is not their account ──
  const settings = code('app/(dashboard)/settings/page.tsx')
  ok(/activeTab === 'profile' && previewing &&/.test(settings) && /activeTab === 'profile' && !previewing &&/.test(settings), 'Profile shows a note, not the admin\'s live account controls, in a preview')

  // ── 5 and 6. the sub menu ──
  const side = code('components/layout/sidebar.tsx')
  ok(/href === '\/my-bids'\) return subAccount === 'guest' \|\| !isAssignedOnly\(role\)/.test(side), 'My Bids is for the office or an old-style guest, not crew')
  ok(/href === '\/approvals'\) return can\('approvals', 'edit'\)/.test(side), 'Approvals needs the power to approve')
  ok(/\{!permsLoading && navItems\.map/.test(side) && /nav-skeleton/.test(side), 'no partial menu while permissions load - placeholder rows instead')

  done()
}

main()

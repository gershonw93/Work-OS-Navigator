// The account-deletion page Google Play links from the store listing.
//
// THE REQUIREMENT. Play's Data safety form demands a "Delete account URL" that
// names the app, prominently gives the steps, and says what is deleted, what
// is kept and for how long. A 404 there, or a page that stopped being public,
// is a listing Google can pull.
//
// THE TRAP. Settings had a "Delete Company Account" button that called DELETE
// /api/settings, and that route has never exported DELETE - so it always
// failed. This page must not send anybody to a Settings control that calls a
// route that is not there. The button is now a request through
// /api/account/deletion-request (account-deletion.ts), so the page names it.

import { MARKETING_PATHS } from '../hosts'
import { ok, done, code, read, exists } from './_helpers'

const PAGE = 'app/(marketing)/delete-account/page.tsx'
ok(exists(PAGE), 'the page exists')
ok(MARKETING_PATHS.includes('/delete-account'), 'it is a marketing path, so the public site serves it')
ok(/path: '\/delete-account'/.test(read('app/sitemap.ts')), 'and it is in the sitemap')

const page = code(PAGE)
ok(/supportMailto\('Delete my SyteNav account'/.test(page), 'the request is one tap: a mailto with the subject filled in')
ok(/What is deleted/.test(page) && /What is kept, and for how long/.test(page), 'it says what is deleted and what is kept')
ok(/30 days/.test(page), '...with a period, which Google requires')

const settingsCallsDeadRoute = /fetch\('\/api\/settings',\s*\{\s*method: 'DELETE'/.test(code('app/(dashboard)/settings/page.tsx'))
  && !/export async function DELETE/.test(read('app/api/settings/route.ts'))
ok(!settingsCallsDeadRoute || !/Danger Zone|Delete Company Account/.test(page),
  'it does not send anyone to a Settings delete control that calls a route with no DELETE')

done()

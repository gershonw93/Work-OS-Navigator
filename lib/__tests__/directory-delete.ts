// Delete on a Directory contact did nothing, three times, and took the tab
// blank with it.
//
// WHAT THE LOGS SAID. Three hours of production runtime logs after three
// attempts: the only request that ever touched that company id was the profile
// GET, five times. The DELETE endpoint was never called ONCE, and there was no
// 5xx in the window at all. So the handler died BEFORE the fetch, and between
// the guard and the request there was exactly one statement that can do that:
//
//     if (!confirm(`Delete ${company.name}? This cannot be undone.`)) return
//
// In the native shell a JS dialog blocks the JS thread, and one that fails to
// present blocks it for ever - the page never runs another line. `alert` was
// swept for this two days earlier; `confirm` was left in 22 handlers with a
// note in BACKLOG.md, and this is the one that got hit.
//
// UNDERNEATH IT, a second defect that would have refused the delete anyway:
// `company_invites.company_id` had no ON DELETE rule, and the contact in
// question was the only one in the Directory anybody had invited to the
// platform. That is why it looked contact-specific.
//
// And a third, on the same screen: the invite ticked "Invited" off `res.ok`
// alone while the route answers 200 with `emailSent: false` when the record
// was written and the email did not go. The reason existed in that response
// and was thrown away, so nothing - not the screen, not the database, not the
// logs - could say why an invite never arrived.

import { ok, done, code, read, readCombined } from './_helpers'

// ── the crash: no native dialog anywhere near a delete ──────────────────────
const dir = code('app/(dashboard)/directory/page.tsx')
ok(!/confirm\(/.test(dir), 'THE CRASH: the Directory opens no blocking native dialog')
ok(/guardDelete\(async \(\) => \{/.test(dir), '...deleting goes through the in-page guard')
ok(/\}, \{ label: company\.name \}\)/.test(dir), '...naming what is about to go')

const guard = code('components/ui/delete-guard.tsx')
ok(!/window\.confirm/.test(guard),
  'the guard itself has no native fallback - it would be the one file still allowed one')
ok(!/function confirm\(/.test(guard),
  '...and its own local function was renamed rather than excused from the scan')
ok(/title\?: string/.test(guard) && /confirmLabel\?: string/.test(guard),
  'it can say something other than "delete", so a non-delete confirmation has somewhere to go')

// Every confirmation that is not a delete uses those overrides rather than the
// native dialog it used to reach for.
for (const [what, f] of [
  ['voiding an invoice', 'components/projects/client-invoices.tsx'],
  ['disconnecting QuickBooks', 'components/settings/quickbooks-card.tsx'],
  ['handing over the account', 'app/(dashboard)/settings/page.tsx'],
  ['an inspection card that disagrees', 'app/(dashboard)/projects/[id]/inspections/page.tsx'],
] as const) {
  ok(/confirmLabel:/.test(code(f)), `${what} asks in the page, in its own words`)
}

// ── the FK that would have refused it anyway ────────────────────────────────
const migration = read('supabase/migrations/099_company_delete_fks.sql')
ok(/company_invites[\s\S]{0,200}ON DELETE CASCADE/.test(migration),
  'deleting a company you invited takes its pending invite with it')
ok(/submittals[\s\S]{0,200}ON DELETE SET NULL/.test(migration),
  '...while a submittal outlives the company that sent it - it is a record of work')
ok(readCombined().includes('company_invites_company_id_fkey'),
  'the combined fallback carries both')

const route = code('app/api/directory/[companyId]/route.ts')
ok(/code === '23503'/.test(route),
  'a foreign key that still points here is answered in words, not with Postgres\'s own')
ok(/status: 409/.test(route), '...as a refusal rather than a 500')
ok(!/'website'/.test(route),
  'and PATCH stopped naming a column `companies` does not have - Supabase answers an unknown one with null, not an error')

// ── the invite that said "Invited" over an email that never left ────────────
ok(/if \(body\.emailSent === false\)/.test(dir),
  'THE SILENT ONE: the Directory reads whether the email actually went')
ok(/setInviteError\(body\.note/.test(dir), "...and shows the reason, which is SendGrid's own words")
const inviteRoute = code('app/api/invite/route.ts')
ok(/console\.error\('\[invite\] send failed'/.test(inviteRoute),
  '...and the route writes it down, so it is recoverable from the logs when nobody is watching the screen')

// ── one email per person ────────────────────────────────────────────────────
const notify = code('lib/notify.ts')
ok(/inAppOnly\?: boolean/.test(notify), 'notify can ring the bell without sending a second email')
ok(/input\.inAppOnly \? \[\] :/.test(notify), '...by sending to nobody, not by filtering afterwards')

const invites = code('app/api/projects/[id]/bid-requests/[reqId]/invites/route.ts')
ok(/emailedCompanies/.test(invites) && /inAppOnly: true/.test(invites),
  'a sub we just emailed the RFQ to gets the bell only')
ok(/notEmailed\.length \? notify\(\{ \.\.\.bell, userIds: notEmailed \}\) : null/.test(invites),
  '...and one we could NOT email still gets the notification email, as the fallback rather than a duplicate')

done()

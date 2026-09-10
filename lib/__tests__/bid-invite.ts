// "+ Invite" on a quote request never sent anything, and the row was born
// claiming it had.
//
// THE REPORT: type a new sub's name and email, press + Invite, the row flips to
// "Invited" and a modal says "Invite sent" - and no email goes out. Press Send,
// then a second Send inside the panel it opens, and what finally arrives reads
// "Still need your price" - a chase for a request the sub never got.
//
// TWO faults, and neither is the one the report named:
//
//   1. The invites route sent NO email on ANY path. Not the typed one and not
//      the directory one - that only ever fired an in-app bell, and only to
//      subs who already had an account, which is why it LOOKED like it worked.
//   2. `bid_invites.status` was NOT NULL DEFAULT 'invited', so a row asserted
//      it had been told the moment it existed. `isReminder` reads that status,
//      so the first real email was already a nudge. Not a timer; not "after a
//      minute"; the next email, whenever it was sent, for ever.

import { bidInviteEmail, bidScopeLine } from '../bid-invite-email'
import { ok, done, code, read, readCombined } from './_helpers'

const URL_ = 'https://app.sytenav.com/bid/abc123'
const base = { scope: 'Electrical rough-in - Electrical', gcName: 'Gershon Construction', fromName: 'Ilan Katz', vendorName: 'Dana Reed', url: URL_ }

const first = bidInviteEmail({ ...base, isReminder: false })
const nudge = bidInviteEmail({ ...base, isReminder: true })
const all = (m: { subject: string; text: string; html: string }) => `${m.subject}\n${m.text}\n${m.html}`

// ── the two moods of one letter ─────────────────────────────────────────────
ok(/Quote request: Electrical rough-in/.test(first.subject),
  `a first ask asks (${first.subject})`)
ok(/Still need your price/.test(nudge.subject),
  `a nudge nudges (${nudge.subject})`)
ok(!/Still need your price|Just a nudge/.test(all(first)),
  'THE BUG: a first contact never reads as a chase')
ok(/would like your price/.test(all(first)), '...it asks for a price')
ok(/Gershon Construction/.test(all(first)) && /Gershon Construction/.test(all(nudge)),
  'both name the contractor asking')
ok(all(first).includes(URL_) && all(nudge).includes(URL_), 'both carry the link')

// A due date is optional and must not leave a hole when absent.
const dated = bidInviteEmail({ ...base, isReminder: false, dueDate: '2026-10-01' })
ok(/Please get it back by/.test(all(dated)), 'a due date is asked for')
ok(!/undefined|null|Invalid Date/.test(all(first) + all(dated)),
  'and nothing missing prints as "undefined" or "Invalid Date"')

ok(bidScopeLine('Roof', 'Roofing') === 'Roof - Roofing', 'the scope line joins title and trade')
ok(bidScopeLine(null, null) === 'a scope of work', '...and says something usable when it has neither')

// ── ONE builder, so the two routes cannot drift ─────────────────────────────
const invitesRoute = code('app/api/projects/[id]/bid-requests/[reqId]/invites/route.ts')
const sendRoute = code('app/api/projects/[id]/bid-requests/[reqId]/invites/[inviteId]/send/route.ts')
for (const [what, src] of [['the invite', invitesRoute], ['the nudge', sendRoute]] as const) {
  ok(/bidInviteEmail\(/.test(src), `${what} route builds its email in the shared place`)
}
ok(!/Still need your price/.test(invitesRoute) && !/Still need your price/.test(sendRoute),
  'neither route holds a copy of the words any more')

// ── "+ Invite" actually sends ───────────────────────────────────────────────
ok(/sendEmail\(\{ to: inv\.vendor_email/.test(invitesRoute),
  'THE BUG: pressing + Invite emails the sub')
ok(/isReminder: false/.test(invitesRoute), '...as a first ask, not a chase')
ok(/if \(result\.sent\) \{[\s\S]{0,200}status: 'invited'/.test(invitesRoute),
  "...and 'invited' is stamped only on a confirmed send")
ok(/reason: 'no_email'/.test(invitesRoute),
  'an invitee with no address is reported rather than silently skipped')
ok(/status: 'pending'/.test(invitesRoute),
  'a new row starts at pending - nobody has been told yet')

// ── the honest status ───────────────────────────────────────────────────────
const migration = read('supabase/migrations/098_bid_invite_pending_and_dedupe.sql')
ok(/ALTER COLUMN status SET DEFAULT 'pending'/.test(migration),
  "the default is 'pending', which is the whole of fault 2")
ok(/'pending'::text, 'invited'::text/.test(migration), '...and the CHECK allows it')
ok(/uq_bid_invites_req_email/.test(migration) && /uq_bid_invites_req_company/.test(migration),
  'one sub cannot be invited to one request twice')
ok(/lower\(vendor_email\)/.test(migration), '...and Sub@x.com is the same inbox as sub@x.com')
ok(/WHERE vendor_email IS NOT NULL/.test(migration),
  '...while a name with no email may legitimately repeat')
ok(readCombined().includes('uq_bid_invites_req_company'),
  'the combined fallback carries it too')

const bidRoute = code('app/api/bid/[token]/route.ts')
ok(/invite\.status === 'invited' \|\| invite\.status === 'pending'/.test(bidRoute),
  "a PENDING invite opened through a copied link still becomes 'viewed' - otherwise it sits there for ever")

// ── the route refuses a duplicate as an answer, not a 500 ───────────────────
ok(/already on this request/.test(invitesRoute), 'inviting the same sub twice says so')
ok(/status: 409/.test(invitesRoute), '...as a refusal, not a database error')

// ── the row: one primary action, the rest behind the dots ───────────────────
const page = code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')
ok(/\{told \? 'Send reminder' : 'Send invite'\}/.test(page),
  'the button says what is about to be sent')
ok(/onClick=\{\(\) => sendInvite\(req\.id, inv\)\}/.test(page),
  '...and sends on ONE press')
ok(/<RowMenu label=/.test(page), 'the rest live behind one menu')
ok(/Copy link/.test(page) && /Copy email text/.test(page) && /Send by hand/.test(page)
  && /Send with a note…/.test(page) && /Remove invite/.test(page),
  '...copy link, copy email text, send by hand, send with a note, remove')
ok(/setSendingInvite\(inv\.id\); close\(\)/.test(page),
  'the panel is reachable only from the menu, so nothing opens a Send inside a Send')
ok(!/inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline">\s*<Mail[^>]*\/> Send\b/.test(page),
  '...and the old bare "Send" that opened it is gone')
ok(/Copy link<\/Button>|<Link2 className="h-3\.5 w-3\.5" \/> Copy link/.test(page),
  'a row with no address offers Copy link as its primary - a disabled Send would explain nothing')

// The modal that lied.
ok(!/Invite sent\. Save their details/.test(page),
  'THE BUG: the directory modal no longer claims a send that did not happen')
ok(/Sent to \$\{pendingContact\.email\}/.test(page), '...it names the address it went to')
ok(/if \(wasCustom && sent\.length\)/.test(page),
  '...and only appears after a confirmed send')
ok(/Quote request sent to/.test(page), 'a real send gets a real confirmation')

// ── the menu, promoted rather than hand-rolled a third time ─────────────────
const menu = code('components/ui/row-menu.tsx')
ok(/min-h-11/.test(menu), 'a menu row is a 44px touch target on a phone')
ok(/lg:min-h-0/.test(menu), '...and shrinks where a mouse is doing the aiming')
ok(/max-w-\[calc\(100vw-2rem\)\]/.test(menu),
  'the panel cannot run off the edge of a narrow row')
ok(!/data-overlay/.test(menu),
  'it is not an overlay - it travels with the page and must not freeze it')
for (const f of ['components/projects/client-invoices.tsx', 'app/(dashboard)/projects/[id]/request-quotes/page.tsx']) {
  ok(/import \{ RowMenu, MenuItem \} from '@\/components\/ui\/row-menu'/.test(code(f)),
    `${f.split('/').pop()} imports the shared menu`)
  ok(!/^function RowMenu/m.test(code(f)), `...rather than declaring its own`)
}

done()

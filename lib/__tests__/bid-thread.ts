// Quote messages: a sub can ask the GC about a quote request, but only from a
// (free) account - and that account is a VENDOR account that cannot open a
// job of its own.
//
// The asks, as they arrived: "they should be able to chat back only if they
// create a free account, but their free account, they can't create their own
// jobs, only whatever they're invited to".

import { canUseThread, messageProblem, bidReturnPath, MESSAGE_MAX, threadSummary, accountProblem, PASSWORD_MIN } from '../bid-thread'
import { getRoleDefaults } from '../permissions'
import { NOTIFICATION_TYPES } from '../notifications'
import { ok, done, code } from './_helpers'

// ── who may use the sub's side ──────────────────────────────────────────────
const invite = { vendor_company_id: 'sub-co', vendor_email: 'Mike_Frame@Example.com' }
ok(canUseThread(invite, { companyId: 'sub-co', email: 'someone@else.com' }), 'somebody at the company the invite went to may use the thread')
ok(canUseThread(invite, { companyId: 'their-own-co', email: ' mike_frame@example.com ' }), '...and so may the address it was sent to, whatever company their own account is on, case and spaces aside')
ok(!canUseThread(invite, { companyId: 'other-co', email: 'mikexframe@example.com' }), 'nobody else - and `_` is a character, not a wildcard')
ok(!canUseThread({ vendor_company_id: null, vendor_email: null }, { companyId: null, email: null }), 'an invite with nobody on it opens for nobody, and a viewer with nothing is nobody')
ok(!canUseThread({ vendor_company_id: null, vendor_email: '' }, { companyId: null, email: '' }), '...including two empty strings, which are equal and mean nothing')

// ── what a message may be ───────────────────────────────────────────────────
ok(messageProblem('') !== null && messageProblem('   ') !== null, 'an empty message is refused with a reason')
ok(messageProblem(undefined) !== null && messageProblem(42) !== null, '...and so is something that is not text')
ok(messageProblem('Are the headers in?') === null, 'a question goes')
ok(messageProblem('x'.repeat(MESSAGE_MAX + 1)) !== null && messageProblem('x'.repeat(MESSAGE_MAX)) === null, `the cap is ${MESSAGE_MAX}, and it matches the column check`)
const migration = code('supabase/migrations/134_bid_messages_equipment_repair.sql')
ok(migration.includes(`length(body) <= ${MESSAGE_MAX}`), '...the column check, which says the same number')

// ── where somebody lands after signing in from a quote ──────────────────────
ok(bidReturnPath('/bid/0123456789abcdef0123456789abcdef') === '/bid/0123456789abcdef0123456789abcdef', 'back to the quote they came from')
for (const bad of ['https://evil.example/bid/0123456789', '//evil.example', '/bid/../dashboard', '/dashboard', '/bid/abc', null, 42]) {
  ok(bidReturnPath(bad) === null, `...and nowhere else: ${JSON.stringify(bad)}`)
}

// ── the free account cannot make its own jobs ───────────────────────────────
const vendor = getRoleDefaults('read_only')
ok(!!vendor.projects?.view && !vendor.projects?.create, 'THE ACCOUNT: the vendor role sees jobs and cannot create one')
ok(!vendor['request-quotes']?.view, '...and cannot read the GC side of quote requests')
const account = code('app/api/bid/[token]/account/route.ts')
ok(/role: 'read_only'/.test(account) && !/role: body/.test(account), 'the account route makes a read_only account, never one named in the body')
ok(!/company_billing/.test(account), '...and writes no billing row, so a sub is never metered into a trial that locks them out')
ok(/vendor_email \|\| company\?\.contact_email/.test(account), '...for the address the invite was sent to; a typed address only when there is none')
ok(/count \?\? 0\) > 0/.test(account) && /signIn: true/.test(account), '...and a company that already has people on SyteNav is sent to sign in, not joined by whoever holds the link')
const projects = code('app/api/projects/route.ts')
ok(/actorCan\(actor, 'projects', 'create'\)/.test(projects), 'the projects route asks for `create`, which is what keeps that account from opening a job')

// ── the thread needs an account; the price does not ─────────────────────────
const subRoute = code('app/api/bid/[token]/messages/route.ts')
ok(/needsAccount: true/.test(subRoute) && /canUseThread\(/.test(subRoute), 'THE THREAD: the sub route refuses with no session, and asks canUseThread with one')
ok(/user\.email/.test(subRoute) && !/body\.email/.test(subRoute), '...using the address from the auth server, never one from the body')
const pricing = code('app/api/bid/[token]/route.ts')
ok(!/Authorization/.test(pricing), 'pricing still needs no account at all')

// ── the GC side asks both questions ─────────────────────────────────────────
const gcRoute = code('app/api/projects/[id]/bid-requests/[reqId]/invites/[inviteId]/messages/route.ts')
ok(/requirePermission\(db, request, 'request-quotes'/.test(gcRoute), 'the GC route asks the permission')
ok(/ownedProject\(/.test(gcRoute), '...and whose job it is - a sub on the job must not read the GC\'s threads with the subs pricing against them')
ok(/\.eq\('bid_request_id', params\.reqId\)/.test(gcRoute), '...and that the invite is on this request, so the path cannot reach any thread by id')

// ── both directions are catalog types, with different switches ──────────────
const fromSub = NOTIFICATION_TYPES.find(t => t.key === 'bid_message_from_sub')
const toSub = NOTIFICATION_TYPES.find(t => t.key === 'bid_message_to_sub')
ok(fromSub?.status === 'live' && fromSub.audience === 'team', 'a message to the GC is a live, routable type')
ok(toSub?.status === 'live' && toSub.audience === 'direct' && toSub.defaults.email, 'a reply to the sub is direct and emails by default - a sub lives in their inbox')
const db = code('lib/bid-thread-db.ts')
ok(/type: 'bid_message_from_sub'/.test(db) && /type: 'bid_message_to_sub'/.test(db), 'and the writer sends under both, one per direction')

// ── the free account is made IN PLACE, and cannot make a job by either door ──
ok(accountProblem({ fullName: 'Mike', password: 'x'.repeat(PASSWORD_MIN) }) === null, 'THE ONE-STOP ACCOUNT: a name and a password are enough')
ok(accountProblem({ fullName: ' ', password: 'longenough' }) !== null && accountProblem({ fullName: 'Mike', password: 'x'.repeat(PASSWORD_MIN - 1) }) !== null,
  '...and either missing is said at the field')
ok(/createUser\(/.test(account) && /email_confirm: true/.test(account) && !/generateLink/.test(account),
  'the route creates the login with the password - no set-password email, no round trip')
ok(/signInWithPassword/.test(code('components/quotes/quote-messages.tsx')), '...and the page signs straight in and opens the thread')
ok(/deleteUser\(userId\)/.test(account), 'a login left with no company behind it is taken back out')
const myJobsRoute = code('app/api/my-jobs/route.ts')
ok(/actorCan\(actor, 'projects', 'create'\)/.test(myJobsRoute), 'THE SECOND DOOR: My Jobs asks the same `create` the projects route does - it asked nothing')
ok(/projectSlotProblem/.test(myJobsRoute) && /billingLock/.test(myJobsRoute), '...and the same meter, because it opens a slot too')

// ── what a list says about a thread ─────────────────────────────────────────
const t = (side: 'gc' | 'sub', at: string) => ({ side, created_at: at })
ok(threadSummary([t('sub', '2026-10-01'), t('gc', '2026-10-02')], 'sub').waitingOnMe, 'the GC wrote last, so the sub has a new reply')
ok(!threadSummary([t('sub', '2026-10-01'), t('gc', '2026-10-02')], 'gc').waitingOnMe, '...and the GC is not waiting on themselves')
ok(threadSummary([t('gc', '2026-10-03'), t('sub', '2026-10-01')], 'gc').waitingOnMe === false, 'order is by time, not by array position')
ok(threadSummary(null, 'gc').count === 0 && !threadSummary([], 'sub').waitingOnMe, 'no thread is nothing to say')
ok(/threadSummary\(qr\.messages, 'sub'\)/.test(code('app/(dashboard)/my-bids/page.tsx')), 'My Bids shows the count, from the same function')
ok(/bid_messages \( side, created_at \)/.test(code('app/api/my-bids/route.ts')), '...read on its own route')
ok(/waiting > 0/.test(code('app/(dashboard)/projects/[id]/request-quotes/page.tsx')), 'a closed request card says a sub is waiting on a reply')

done()

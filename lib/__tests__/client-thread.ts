// Client threads on the portal link: "can you communicate w a question like
// when a sub sends a question on quote submission? ... i think we need it all
// over" -> "do the client portal threads, start with selections" -> "make em
// all". One table, one set of rules, four kinds of thing to ask about.

import {
  SUBJECTS, parseSubject, threadShape, threadsWaitingOnGc, subjectOf,
  clientRateProblem, clientAuthor, CLIENT_MESSAGES_PER_HOUR, messageProblem,
} from '../client-thread'
import { NOTIFICATION_TYPES } from '../notifications'
import { demoNotification } from '../demo-notification'
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { ok, done, code, read, root } from './_helpers'

const UID = '11111111-2222-3333-4444-555555555555'

// ── the rules ──────────────────────────────────────────────────────────────
ok(parseSubject('invoice', UID)?.id === UID && parseSubject('payment_request', UID)?.subject === 'payment_request',
  'a record subject needs a real id')
ok(parseSubject('invoice', 'abc') === null && parseSubject('invoice', null) === null, '...and refuses anything else')
ok(parseSubject('project', UID)?.id === null, 'the job itself needs no id, and ignores one sent with it')
ok(parseSubject('budget', UID) === null && parseSubject(undefined, UID) === null, 'an unknown subject is refused, never guessed')

ok(SUBJECTS.invoice.permission === 'payments' && SUBJECTS.payment_request.permission === 'payments',
  'a billing question is answered by Billing the client - never by somebody denied it')
ok(SUBJECTS.selection.permission === 'selections' && SUBJECTS.project.permission === 'client-portal',
  'a selection by whoever owns selections, the job by whoever handles the client link')
ok(SUBJECTS.project.column === null && new Set(Object.values(SUBJECTS).map(s => s.column)).size === 4,
  'each subject has its own column, and the job has none')

const t = (side: string, at: string, extra: object = {}) => ({ side, created_at: at, ...extra })
ok(threadShape([t('gc', '2026-10-01'), t('client', '2026-10-02')]).waitingOnGc, 'the client spoke last: waiting on the GC')
ok(threadShape([t('client', '2026-10-03'), t('gc', '2026-10-02')]).waitingOnGc, '...decided by TIME, not by row order')
ok(threadShape([t('client', '2026-10-01'), t('gc', '2026-10-02')]).waitingOnClient, 'the GC answered last: the client has a reply')

const waiting = threadsWaitingOnGc([
  t('client', '2026-10-01', { client_invoice_id: 'i1' }),
  t('gc', '2026-10-02', { client_invoice_id: 'i1' }),   // answered
  t('client', '2026-10-03', { payment_request_id: 'r1' }),
  t('client', '2026-10-04'),                            // the job
  t('gc', '2026-10-05', { selection_id: 's1' }),        // we started it, nothing back yet
])
ok(waiting.length === 2 && waiting.some(w => w.subject === 'payment_request') && waiting.some(w => w.subject === 'project'),
  'the Overview counts exactly the threads the client spoke last on, across every subject')
ok(subjectOf(t('x', 'y')).subject === 'project', 'a row naming nothing is about the job')

ok(clientRateProblem(CLIENT_MESSAGES_PER_HOUR - 1) === null && !!clientRateProblem(CLIENT_MESSAGES_PER_HOUR),
  'a forwarded link cannot fill the inbox')
ok(clientAuthor('  Sam  ', 'The Smiths') === 'Sam' && clientAuthor('', 'The Smiths') === 'The Smiths' && clientAuthor(undefined, null) === 'The client',
  'a client message is signed with the name they typed, else the job\'s client')
ok(!!messageProblem('   ') && messageProblem('Is the rough-in on this one?') === null, 'the same message rule as the quote thread')

// ── the catalog ────────────────────────────────────────────────────────────
for (const [key, perm] of [['selection_question', 'selections'], ['client_billing_question', 'payments'], ['client_question', 'client-portal']] as const) {
  const type = NOTIFICATION_TYPES.find(x => x.key === key)
  ok(type?.status === 'live' && type.audience === 'team' && type.defaultAudience?.[0] === perm,
    `${key}: a live, routable type, defaulting to the people who answer it (${perm})`)
  ok(!!demoNotification(key, '2026-10-15'), `${key}: the demo board can rehearse it`)
}
ok(new Set(Object.values(SUBJECTS).map(s => s.notifyType)).size === 3, 'every subject is told under a type the catalog has')

// ── one table ──────────────────────────────────────────────────────────────
const sources = ['app', 'lib', 'components'].flatMap(d =>
  execSync(`grep -rl --exclude-dir=__tests__ "selection_messages" ${d} || true`, { cwd: root() }).toString().split('\n').filter(Boolean))
ok(sources.length === 0, `nothing reads the old selection_messages table (${sources.join(', ') || 'none'})`)
ok(/RENAME TO client_messages/.test(read('supabase/migrations/147_client_messages.sql'))
  && /num_nonnulls\(selection_id, client_invoice_id, payment_request_id\) <= 1/.test(read('supabase/migrations/147_client_messages.sql')),
  'one table, and a message is about at most one record')

// ── the client's door ──────────────────────────────────────────────────────
const portal = code('app/api/portal/[token]/messages/route.ts')
ok(/\.eq\('client_portal_token', token\)/.test(portal), 'the token is the credential')
ok((portal.match(/resolveSubject\(db, project\.id, what\.subject, what\.id, true\)/g) ?? []).length === 2,
  'both reading and posting check the record is on the token\'s job AND visible to the client')
ok(portal.indexOf('clientRateProblem') < portal.indexOf('postClientMessage('), 'the hourly cap is asked before anything is stored')
ok(/if \(countErr\) \{[\s\S]*status: 503/.test(portal), '...and a cap that could not be read REFUSES')
ok(!/getActor|requirePermission/.test(portal), 'the client needs no account to ask')

const db = code('lib/client-thread-db.ts')
ok(/forClient && !\['sent', 'paid'\]\.includes\(data\.status\)/.test(db), 'a client cannot ask about a DRAFT invoice - it is invisible to them')
ok(/forClient && !data\.sent_at/.test(db), '...nor an unsent payment request')
ok(/\.eq\('id', id\)\.eq\('project_id', projectId\)/.test(db), 'every record is looked up on THIS job')
ok(/author_id: side === 'gc' \? input\.authorId : null/.test(db), 'a client message never carries a user id')
ok(db.indexOf("from('client_messages').insert") < db.indexOf('sendEmail('), 'the message is stored before anybody is told')
ok(/emailed: \{ sent: false, reason: 'no_email'/.test(db), 'a reply with no client address is SAVED and says it was not emailed')
ok(/if \(error\) \{[\s\S]*return \{ error: 'Could not load the messages\.' \}/.test(db), 'a failed thread read is an error, not an empty thread')
ok(/\.is\('selection_id', null\)\.is\('client_invoice_id', null\)\.is\('payment_request_id', null\)/.test(db),
  'the job\'s own thread is exactly the messages about nothing in particular')

// ── the GC's door ──────────────────────────────────────────────────────────
const gc = code('app/api/projects/[id]/client-messages/route.ts')
ok(/requirePermission\(db, request, SUBJECTS\[what\.subject\]\.permission, action\)/.test(gc),
  'the GC side asks the permission the SUBJECT names')
ok(gc.indexOf('await requirePermission(') < gc.indexOf('await ownedProject') && gc.indexOf('await ownedProject') < gc.indexOf('await resolveSubject('),
  '...then whose job it is, then that the record is on it')

// The old per-selection doors are GONE, not left beside the new one.
ok(!existsSync(join(root(), 'app/api/portal/[token]/selections/[selId]/messages/route.ts'))
  && !existsSync(join(root(), 'app/api/projects/[id]/selections/[selId]/messages/route.ts')),
  'the selection-only routes were deleted when the general one arrived')

// ── the screens ────────────────────────────────────────────────────────────
const portalPage = code('app/portal/[token]/page.tsx')
ok(/subject="payment_request" subjectId=\{r\.id\}/.test(portalPage), 'every payment request on the client\'s link can be asked about')
ok(/subject="invoice" subjectId=\{b\.id\}/.test(portalPage), '...every invoice')
ok(/subject="project" subjectId=\{null\}/.test(portalPage), '...and the job itself')
ok(!/For questions, contact your project manager/.test(portalPage), 'the footer no longer tells them to ask with no way to ask')
ok(/subject="selection" subjectId=\{sel\.id\}/.test(code('app/portal/[token]/selections/page.tsx')), 'and every selection')

const board = code('app/(dashboard)/projects/[id]/selections/page.tsx')
ok(/<ClientThreadPanel projectId=\{params\.id\} subject="selection"/.test(board) && /threadShape\(sel\.client_messages\)\.waitingOnGc/.test(board),
  'the selections board answers on the row and says when the client is waiting')
const inv = code('components/projects/client-invoices.tsx')
ok(/subject="invoice"/.test(inv) && /Client asked a question - reply/.test(inv), 'an invoice row says when the client asked, and opens the thread')
const req = code('components/projects/payment-requests.tsx')
ok(/subject="payment_request"/.test(req) && /Client asked a question about this/.test(req), '...and so does a payment request')
const ov = code('app/(dashboard)/projects/[id]/overview/page.tsx')
ok(/subject="project" subjectId=\{null\}/.test(ov) && /can\('client-portal', 'view'\)/.test(ov),
  'the Overview holds the job\'s own thread, for people who handle the client link')
ok(/threadsWaitingOnGc\(/.test(code('app/api/projects/[id]/overview/route.ts')), '...and counts every question waiting on a reply')

const dialog = code('components/client-thread/client-thread-dialog.tsx')
ok(/className="overlay[^"]*" data-overlay/.test(dialog), 'a thread opened from a row opens over the screen')
ok(/useId\(\)/.test(code('components/quotes/bid-thread.tsx')), 'several threads on one page do not share a textarea id')

done()

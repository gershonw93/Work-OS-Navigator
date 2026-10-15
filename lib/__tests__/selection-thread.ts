// "can you communicate w a question like when a sub sends a question on quote
// submission? ... i think we need it all over" - "do the client portal
// threads, start with selections".

import { selectionThreadSummary, clientRateProblem, clientAuthor, CLIENT_MESSAGES_PER_HOUR, messageProblem } from '../selection-thread'
import { NOTIFICATION_TYPES } from '../notifications'
import { demoNotification } from '../demo-notification'
import { ok, done, code } from './_helpers'

// ── the rules ──────────────────────────────────────────────────────────────
const t = (side: string, at: string) => ({ side, created_at: at })
ok(selectionThreadSummary([t('gc', '2026-10-01'), t('client', '2026-10-02')]).waitingOnGc, 'the client spoke last: it is waiting on the GC')
ok(selectionThreadSummary([t('client', '2026-10-03'), t('gc', '2026-10-02')]).waitingOnGc,
  '...decided by TIME, not by the order the rows arrived in')
ok(selectionThreadSummary([t('client', '2026-10-01'), t('gc', '2026-10-02')]).waitingOnClient, 'the GC answered last: the client has a reply')
const none = selectionThreadSummary(null)
ok(none.count === 0 && !none.waitingOnGc && !none.waitingOnClient, 'no thread waits on nobody')

ok(clientRateProblem(CLIENT_MESSAGES_PER_HOUR - 1) === null, 'under the hourly cap a client can post')
ok(!!clientRateProblem(CLIENT_MESSAGES_PER_HOUR), '...at the cap a forwarded link cannot fill the inbox')
ok(clientAuthor('  Sam  ', 'The Smiths') === 'Sam' && clientAuthor('', 'The Smiths') === 'The Smiths' && clientAuthor(undefined, null) === 'The client',
  'a client message is signed with the name they typed, else the job\'s client')
ok(!!messageProblem('   ') && messageProblem('Does it come in grey?') === null, 'the same message rule as the quote thread')

// ── the catalog ────────────────────────────────────────────────────────────
const type = NOTIFICATION_TYPES.find(x => x.key === 'selection_question')
ok(type?.status === 'live' && type.audience === 'team', 'a client question is a live, routable notification type')
ok(JSON.stringify(type?.defaultAudience) === JSON.stringify(['selections', 'edit']), '...told to the people who can answer it and move the selection on')
ok(!!demoNotification('selection_question', '2026-10-15'), '...and the demo board can rehearse it')

// ── the client's door ──────────────────────────────────────────────────────
const portalPost = code('app/api/portal/[token]/selections/[selId]/messages/route.ts')
ok(/\.eq\('client_portal_token', params\.token\)/.test(portalPost) && /\.eq\('id', params\.selId\)\.eq\('project_id', project\.id\)/.test(portalPost),
  'the token is the credential, and the selection has to be on the token\'s job')
ok(portalPost.indexOf('clientRateProblem') < portalPost.indexOf('postSelectionMessage('), 'the hourly cap is asked before anything is stored')
ok(/if \(countErr\) \{[\s\S]*status: 503/.test(portalPost), '...and a cap that could not be read REFUSES - an unread limit on a public endpoint is no limit')
ok(!/getActor|requirePermission/.test(portalPost), 'the client needs no account to ask')

const portalGet = code('app/api/portal/[token]/selections/route.ts')
ok(/selection_messages \(id, side, author_name, body, created_at\)/.test(portalGet) && !/selection_messages \([^)]*author_id/.test(portalGet),
  'the portal carries each thread, without the GC\'s user ids')
ok(/if \(selErr\) \{[\s\S]*status: 500/.test(portalGet), 'a refused read is an error, never "You\'re all caught up"')

// ── the GC's door ──────────────────────────────────────────────────────────
const gc = code('app/api/projects/[id]/selections/[selId]/messages/route.ts')
ok(/requirePermission\(db, request, 'selections', action\)/.test(gc) && /ownedProject/.test(gc),
  'the GC side asks the permission AND whose job it is - an invited sub must not read the client\'s questions')
ok(/\.eq\('project_id', params\.id\)/.test(gc), '...and the selection has to be on that job')

const db = code('lib/selection-thread-db.ts')
ok(/type: 'selection_question'/.test(db) && /audienceFor\(/.test(db), 'a client question reaches the routed audience through notify()')
ok(/author_id: side === 'gc' \? input\.authorId : null/.test(db), 'a client message never carries a user id')
ok(/if \(!to\) return \{ message: message as SelectionMessage, emailed: \{ sent: false, reason: 'no_email'/.test(db),
  'a reply with no client address on file is SAVED and says it was not emailed')
ok(db.indexOf("from('selection_messages').insert") < db.indexOf('sendEmail('), 'the message is stored before anybody is told - the message is the work')
ok(/if \(error\) \{[\s\S]*return \{ error: 'Could not load the messages\.' \}/.test(db), 'a failed thread read is an error, not an empty thread')

// ── the screens ────────────────────────────────────────────────────────────
const board = code('app/(dashboard)/projects/[id]/selections/page.tsx')
ok(/<ClientQuestions projectId=\{params\.id\} selectionId=\{sel\.id\}/.test(board), 'every open selection on the board has the client thread')
ok(/client asked a question/.test(board) && /selectionThreadSummary\(sel\.selection_messages\)\.waitingOnGc/.test(board),
  'the row says when the client is waiting on an answer, from who spoke last')
ok(/Saved\. There is no email address on this client/.test(board), 'the board says when a reply was saved but could not be emailed')
ok(/^function ClientQuestions\(/m.test(board), 'the thread panel is declared at module level')

const portal = code('app/portal/[token]/selections/page.tsx')
ok(/<SelectionQuestions token=\{params\.token\} sel=\{sel\} name=\{name\} onPosted=\{load\} \/>/.test(portal), 'every open selection on the client\'s link has "Ask us a question"')
ok(/^function Shell\(/m.test(portal) && !/const Shell = \(/.test(portal),
  'the portal frame is at module level - inside the page it rebuilt everything on each keystroke and dropped the typing')
ok(/^function SelectionQuestions\(/m.test(portal), '...and so is the thread')

const thread = code('components/quotes/bid-thread.tsx')
ok(/useId\(\)/.test(thread) && !/id="bid-thread-draft"/.test(thread), 'several threads on one page do not share a textarea id')

done()

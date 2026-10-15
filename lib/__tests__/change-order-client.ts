// "add change orders to the client portal"
//
// Half the change orders on file are tied to a subcontract, and their amount is
// the SUB's price - our cost. So a change order reaches the client only when
// somebody shares it. "let client approval count for non-sub change orders /
// approvals must come with a free login": with no subcontract the client's
// approval IS the approval, on a sub-linked one it stays a record the GC
// approves against - and either way the answer needs the client signed in.

import { clientResponseProblem, clientCoStatus, responseLine, approvalCounts } from '../change-order-client'
import { SUBJECTS, threadsWaitingOnGc } from '../client-thread'
import { ok, done, code, read } from './_helpers'

const shared = { status: 'pending', client_shared_at: '2026-10-15T10:00:00Z' }

// ── the rules ──────────────────────────────────────────────────────────────
ok(clientResponseProblem(shared, 'approved', null) === null && clientResponseProblem(shared, 'declined', 'Too much') === null,
  'a shared, pending change order can be approved or declined')
ok(!!clientResponseProblem({ ...shared, client_shared_at: null }, 'approved', null), 'one that was never shared cannot be answered')
ok(!!clientResponseProblem(null, 'approved', null), '...nor one that does not exist')
ok(!!clientResponseProblem(shared, 'maybe', null), 'only approve or decline')
ok(/already been approved/.test(clientResponseProblem({ ...shared, status: 'approved' }, 'declined', null) ?? ''),
  'once the GC has decided, a different answer is a conversation, not a button')
ok(!!clientResponseProblem(shared, 'approved', 'x'.repeat(1001)), 'a note has a length')

ok(clientCoStatus({ status: 'pending', client_response: null }) === 'Waiting on your answer', 'the client is told it is waiting on them')
ok(clientCoStatus({ status: 'pending', client_response: 'approved' }) === 'You approved this', '...then that they approved it')
ok(clientCoStatus({ status: 'approved', client_response: 'approved' }) === 'Approved', '...and only the GC\'s decision says Approved')
ok(clientCoStatus({ status: 'rejected', client_response: null }) === 'Withdrawn', 'a rejected one reads as withdrawn to the client, not as their failure')
ok(responseLine({ client_response: 'approved', client_response_name: 'Sam' }, 'Oct 15') === 'Client approved (Sam) on Oct 15',
  'the GC\'s card says who answered and when')

ok(SUBJECTS.change_order.column === 'change_order_id' && SUBJECTS.change_order.notifyType === 'client_change_order',
  'a change order is a client-thread subject like the rest')
ok(threadsWaitingOnGc([{ side: 'client', created_at: '2026-10-15', change_order_id: 'c1' }])[0]?.subject === 'change_order',
  '...and a question on one is counted on the Overview')

// ── shared, never automatic ────────────────────────────────────────────────
const portal = code('app/portal/[token]/page.tsx')
ok(/from\('change_orders'\)[\s\S]{0,200}\.not\('client_shared_at', 'is', null\)/.test(portal),
  'the client\'s link shows ONLY change orders somebody shared')
ok(!/from\('change_orders'\)\s*\.select\('[^']*(review_notes|requested_by_type)/.test(portal),
  '...and never the review notes or who raised it')
ok(/map\(\(\{ subcontract_id, \.\.\.co \}: any\)/.test(portal) && /approval_counts: approvalCounts\(\{ subcontract_id \}\)/.test(portal),
  '...and the subcontract id is turned into "does your yes approve it" before anything renders')
const db = code('lib/client-thread-db.ts')
ok(/forClient && !data\.client_shared_at/.test(db), 'a question about an unshared change order is refused like one that does not exist')

const share = code('app/api/projects/[id]/change-orders/[coId]/share/route.ts')
ok(/requirePermission\(db, request, 'change-orders', 'edit'\)/.test(share) && /ownedProject/.test(share),
  'sharing asks change-orders: edit AND whose job it is')
ok(/if \(!r\.project\.client_portal_token\)/.test(share), '...refuses when there is no client link to put it on')
ok(/client_shared_at: new Date\(\)\.toISOString\(\)/.test(share), 'Share is what writes client_shared_at')

const page = code('app/(dashboard)/projects/[id]/change-orders/page.tsx')
ok(/This change order is tied to \{getSubName\(shareFor\.subcontract_id\)\}/.test(page),
  'sharing a sub-linked change order warns that its amount is the sub\'s price')
ok(/Your client sees exactly this on their link/.test(page), '...and the dialog shows exactly what they will see')
ok(/tied to a subcontract, so approve it below[\s\S]{0,80}their yes does not do that on its own/.test(page),
  'on a sub-linked one the card says the client\'s approval is not the approval')
ok(/Their approval approves it/.test(page), '...and the share dialog says when it is')

// ── when the client's yes is the approval ──────────────────────────────────
ok(approvalCounts({ subcontract_id: null }) === true, 'a change order with no subcontract is approved by the client\'s yes')
ok(approvalCounts({ subcontract_id: 's1' }) === false, '...one tied to a subcontract is not - it moves a SUB\'s contract')

const respond = code('app/api/portal/[token]/change-orders/[coId]/route.ts')
ok(!/\bstatus:\s*payload/.test(respond) && (respond.match(/\{ status: 'approved' \}/g) ?? []).length === 1,
  'the client\'s route writes ONE status, approved, and never a status out of the body')
ok(/const counts = payload\.response === 'approved' && approvalCounts\(co as any\)/.test(respond)
  && /\.\.\.\(counts \? \{ status: 'approved' \} : \{\}\)/.test(respond),
  '...only when they APPROVED and the change order has no subcontract - a decline is a record')
ok(/select\('id, title, amount, status, client_shared_at, subcontract_id'\)/.test(respond),
  '...decided off the ROW, never off anything the page sent')
ok(respond.indexOf('signedInClient(') > 0 && respond.indexOf('signedInClient(') < respond.indexOf('.update('),
  'nothing is written until the person is signed in as the job\'s client')
ok(/clientEmailFor\(db, \(project as any\)\.customer_id\)/.test(respond) && /needs_login: true/.test(respond) && /status: 401/.test(respond),
  '...as the address on the customer record, and a page that is not signed in is told to sign in')
ok(/client_response_email: who\.email/.test(respond), 'the signed-in address is stored with the answer')
ok(/if \(!saved\?\.length\)/.test(respond), 'a race the GC won writes nothing and says so')
ok(/\.eq\('status', 'pending'\)/.test(respond), '...and only answers a change order the GC has not decided yet, even racing them')
ok(respond.indexOf('clientResponseProblem(') < respond.indexOf(".update("), 'the same rule the buttons ask is asked before anything is written')
ok(/type: 'client_change_order'/.test(respond) && /audienceFor\(/.test(respond), 'the answer reaches whoever approves change orders')
ok(/clientResponseProblem\(state, response/.test(code('components/client-thread/portal-change-order.tsx')), 'the client\'s buttons ask the same rule first')

ok(/client_messages_one_subject[\s\S]*change_order_id\) <= 1/.test(read('supabase/migrations/148_change_orders_client.sql')),
  'a message is still about at most one record')

done()

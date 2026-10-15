// "add change orders to the client portal"
//
// Half the change orders on file are tied to a subcontract, and their amount is
// the SUB's price - our cost. So a change order reaches the client only when
// somebody shares it, and the client's approve/decline is a record the GC
// approves against, never the approval itself (that moves money).

import { clientResponseProblem, clientCoStatus, responseLine } from '../change-order-client'
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
ok(!/from\('change_orders'\)\s*\.select\('[^']*(review_notes|subcontract_id|requested_by_type)/.test(portal),
  '...and never the review notes, the subcontract or who raised it')
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
ok(/their yes does not do that on its own/.test(page), 'the card says the client\'s approval is not the approval')

// ── the client's answer is a record ────────────────────────────────────────
const respond = code('app/api/portal/[token]/change-orders/[coId]/route.ts')
ok(!/\bstatus:\s*payload|\bstatus:\s*'approved'|update\(\{[^}]*\bstatus\b/.test(respond),
  'the client\'s route never writes status - approving moves money and stays the GC\'s')
ok(/\.eq\('status', 'pending'\)/.test(respond), '...and only answers a change order the GC has not decided yet, even racing them')
ok(respond.indexOf('clientResponseProblem(') < respond.indexOf(".update("), 'the same rule the buttons ask is asked before anything is written')
ok(/type: 'client_change_order'/.test(respond) && /audienceFor\(/.test(respond), 'the answer reaches whoever approves change orders')
ok(/clientResponseProblem\(state, response/.test(code('components/client-thread/portal-change-order.tsx')), 'the client\'s buttons ask the same rule first')

ok(/client_messages_one_subject[\s\S]*change_order_id\) <= 1/.test(read('supabase/migrations/148_change_orders_client.sql')),
  'a message is still about at most one record')

done()

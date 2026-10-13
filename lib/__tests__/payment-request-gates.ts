// A payment request is the GC asking THEIR client for money, and the send
// emails that client the portal link - the key to their whole project page.
// #611 gated the create and left the rest of the family checking one thing:
// are you signed in. So a field worker, or a sub invited onto the job, could
// read every ask and the portal token beside it, mark a client's deposit
// paid, delete an ask, or email the client a request in the GC's name.
//
// Every handler now asks the permission (`payments`) AND whose job it is
// (`ownedProject`), and the portal token travels only to someone who also
// holds `client-portal`.

import { ok, done, code } from './_helpers'

const BASE = 'app/api/projects/[id]/payment-requests'
const list = code(`${BASE}/route.ts`)
const one = code(`${BASE}/[reqId]/route.ts`)
const send = code(`${BASE}/[reqId]/send/route.ts`)

function handler(src: string, verb: string): string {
  const start = src.indexOf(`export async function ${verb}(`)
  if (start < 0) return ''
  const next = src.indexOf('export async function', start + 10)
  return src.slice(start, next < 0 ? undefined : next)
}

for (const [name, src] of [['list', list], ['[reqId]', one], ['send', send]] as const) {
  ok(!/auth\.getUser\(|function auth\(/.test(src),
    `${name}: no bare "are you signed in" check left - requirePermission is the door`)
}

const get = handler(list, 'GET')
ok(/requirePermission\(db, request, 'payments', 'view'\)/.test(get), 'GET reads under payments: view')
ok(/ownedProject\(db, gate\.actor, params\.id/.test(get), "GET is the GC's job only - a sub on it is refused")
ok(/actorCan\(gate\.actor, 'client-portal', 'view'\)\s*\?/.test(get),
  'GET hands back the portal token only to someone who holds client-portal')

const post = handler(list, 'POST')
ok(/requirePermission\(db, request, 'payments', 'edit'\)/.test(post), 'POST raises under payments: edit')
ok(/ownedProject\(db, gate\.actor, params\.id/.test(post), 'POST is owned-job only')

// [reqId]: both handlers go through the one gate, and the gate asks both questions.
ok(/requirePermission\(db, request, 'payments', 'edit'\)/.test(one), '[reqId] gate asks payments: edit')
ok(/ownedProject\(db, gate\.actor, projectId/.test(one), '[reqId] gate asks whose job it is')
for (const verb of ['PATCH', 'DELETE']) {
  ok(/await gated\(request, params\.id\)/.test(handler(one, verb)), `${verb} goes through the gate`)
}

const sendPost = handler(send, 'POST')
ok(/requirePermission\(db, request, 'payments', 'edit'\)/.test(sendPost), 'send needs payments: edit')
ok(/actorCan\(gate\.actor, 'client-portal', 'view'\)/.test(sendPost), 'send needs client-portal - it mails the link')
ok(/ownedProject\(db, gate\.actor, params\.id/.test(sendPost), 'send is owned-job only')
ok(sendPost.indexOf('ownedProject(') < sendPost.indexOf('readSendBody('),
  'send is gated before the body is read')

done()

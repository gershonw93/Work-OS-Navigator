// "why cant the send button just send and say sent to... then option to send
// to more / one click and done" - and, over the X beside Mark paid, "this
// should also be 2 step - are you sure".

import { ok, done, code } from './_helpers'

const box = code('components/ui/send-link-box.tsx')
ok(/export async function sendLinkNow\(/.test(box), 'one sender for a one-press send and the box alike')
ok(/const r = await sendLinkNow\(endpoint, to/.test(box), '...the box goes through it too, so the two cannot report differently')
ok(/d\?\.sent === false\) return \{ ok: false/.test(box), 'a `{ sent: false }` answer is a failure with its message, never a tick')

const pr = code('components/projects/payment-requests.tsx')
ok(/\(!r\.sent_at && clientEmail && portalToken\)\s*\?\s*sendNow\(r\)/.test(pr),
  'a deposit request with the client address on file sends in ONE press')
ok(/sendLinkNow\(`\/api\/projects\/\$\{projectId\}\/payment-requests\/\$\{r\.id\}\/send`, clientEmail\)/.test(pr),
  '...to the address on file, through the same route the box uses')
ok(/Sent to \{\(sendResult\[r\.id\] as \{ to: string \}\)\.to\}/.test(pr) && /Send to somebody else/.test(pr),
  '...and says who it went to, with sending to somebody else one tap away')
ok(/onClick=\{\(\) => withdraw\(r\)\}/.test(pr) && /guardDelete\(\(\) => setStatus\(r, 'cancelled'\)/.test(pr),
  'the X withdraws only after asking - it is not a one-press cancel')
ok(!/onClick=\{\(\) => setStatus\(r, 'cancelled'\)\}/.test(pr), '...and nothing else withdraws in one press')

const inv = code('components/projects/client-invoices.tsx')
ok(/onClick=\{\(\) => \{ close\(\); emailInvoice\(b\) \}\}/.test(inv) && /sendLinkNow\(`\/api\/projects\/\$\{projectId\}\/client-invoices/.test(inv),
  'emailing an invoice to the client on file is one press too')
ok(/Email it to somebody else/.test(inv), '...with somebody else as its own choice')

done()

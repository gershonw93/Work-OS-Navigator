// "why cant the send button just send and say sent to... then option to send
// to more / one click and done" - and, over the X beside Mark paid, "this
// should also be 2 step - are you sure".

import { ok, done, code } from './_helpers'

const box = code('components/ui/send-link-box.tsx')
ok(/export async function sendLinkNow\(/.test(box), 'one sender for a one-press send and the box alike')
ok(/const r = await sendLinkNow\(endpoint, to/.test(box), '...the box goes through it too, so the two cannot report differently')
ok(/d\?\.sent === false\) return \{ ok: false/.test(box), 'a `{ sent: false }` answer is a failure with its message, never a tick')

const pr = code('components/projects/payment-requests.tsx')
ok(/\(!r\.sent_at && clientEmail\)\s*\?\s*sendNow\(r\)/.test(pr),
  'a deposit request with the client address on file sends in ONE press')
// "if there no client share link it tells me error and then i need to create
// the link and then i can send - can we make it all happen in one press"
const sendNowFn = pr.slice(pr.indexOf('async function sendNow'), pr.indexOf('async function ensurePortalLink'))
ok(/portalToken \? \{ token: portalToken \} : await ensurePortalLink\(\)/.test(sendNowFn)
  && sendNowFn.indexOf('ensurePortalLink()') < sendNowFn.indexOf('sendLinkNow('),
  '...EVEN WITH NO CLIENT LINK YET: Send makes the link first, then sends')
const ensure = pr.slice(pr.indexOf('async function ensurePortalLink'), pr.indexOf('async function openSendBox'))
ok(/portal-token`/.test(ensure) && /body: JSON\.stringify\(\{\}\)/.test(ensure) && !/regenerate/.test(ensure),
  '...through the portal-token route WITHOUT regenerate, so it can never replace a link the client already has')
ok(/if \('error' in link\)/.test(sendNowFn) && /console\.error\(`\[payment-requests\] portal link/.test(ensure),
  '...and a link it could not make is said on the row and logged - nothing is sent')
ok(!/Use Share with Client once/.test(pr), 'the "go and make a link first" dead end is gone')
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

// "do the same for change orders and selections reminders"
const sels = code('app/(dashboard)/projects/[id]/selections/page.tsx')
ok(/if \(!clientEmail \|\| !portalToken\) \{ setRemindFor\(sel\); return \}/.test(sels)
  && /sendLinkNow\(`\/api\/projects\/\$\{params\.id\}\/selections\/\$\{sel\.id\}\/remind`, clientEmail\)/.test(sels),
  'a selection reminder goes to the client on file in one press; the dialog only when there is no address or link')
ok(/Reminder sent to \$\{out\.to\}/.test(sels) && /Remind somebody else/.test(sels), '...says who it went to, and somebody else is its own choice')
ok(/notify\(out\.message\)\s*setRemindFor\(sel\)/.test(sels), '...and a refused send opens the dialog on the reason, never a silent nothing')

const cos = code('app/(dashboard)/projects/[id]/change-orders/page.tsx')
ok(/co\.subcontract_id \? \(\s*<Button size="sm" variant="outline" onClick=\{\(\) => setShareFor\(co\)\}>/.test(cos),
  'a change order tied to a subcontract still opens the dialog - its amount is probably our cost, and that warning is the step')
ok(/onClick=\{\(\) => share\(co, true\)\}/.test(cos) && /Share without emailing/.test(cos),
  '...every other one shares and emails in one press, with sharing quietly as the second choice')

// "record payment doesnt look like a button"
ok(/<Button size="sm" className="h-8 shrink-0"\s*onClick=\{\(\) => onSettle\(/.test(inv),
  'Record payment on an invoice is a real Button, not a status-coloured pill')

done()

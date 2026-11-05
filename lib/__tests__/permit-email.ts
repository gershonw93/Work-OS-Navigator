// "Email it" - asked for the moment "Send to Toms River Township" was renamed
// "I sent it" because SyteNav sent nothing - "but I wanna cc myself". These pin
// that the copy and the reply reach the GC, that the address offered is the
// right township's or none, and that a permit is logged as sent ONLY when the
// email actually left.

import { buildSendGridPayload, copyList, type EmailConfig } from '../email'
import { emailProblem, permitEmailCopy, splitAddresses, suggestAddress } from '../permit-email'
import { ok, done, code } from './_helpers'

const cfg: EmailConfig = { configured: true, apiKey: 'k', from: 'noreply@sytenav.com', fromName: 'SyteNav', replyTo: 'support@example.com' }

// ── the copy ────────────────────────────────────────────────────────────────
ok(copyList('permits@tomsriver.gov', ['jay@bulkhouses.com', 'JAY@bulkhouses.com', 'permits@tomsriver.gov', 'nope', '']).join() === 'jay@bulkhouses.com',
  'a copy list drops repeats, the TO address (SendGrid refuses one address twice) and anything not an address')
ok(copyList('a@b.com', ['noemail+123@placeholder.com']).length === 0, '...and an invented placeholder address')
ok(copyList('a@b.com', Array.from({ length: 9 }, (_, i) => `p${i}@x.com`)).length === 5, '...and stops at five')

const mail = buildSendGridPayload({
  to: 'permits@tomsriver.gov', subject: 's', text: 't', cc: ['jay@bulkhouses.com'],
  replyTo: 'jay@bulkhouses.com', fromName: 'Jay at Bulk Houses via SyteNav',
}, cfg) as any
ok(mail.personalizations[0].cc?.[0]?.email === 'jay@bulkhouses.com', 'the copy goes on the email itself - "I wanna cc myself"')
ok(mail.reply_to.email === 'jay@bulkhouses.com', 'a reply from the township goes to the GC, never to SyteNav\'s support inbox')
ok(mail.from.email === 'noreply@sytenav.com' && mail.from.name === 'Jay at Bulk Houses via SyteNav',
  'it says who it is from by NAME; the address stays ours, so it is not a forged sender')

const plain = buildSendGridPayload({ to: 'a@b.com', subject: 's', text: 't' }, cfg) as any
ok(!('cc' in plain.personalizations[0]) && plain.reply_to.email === 'support@example.com' && plain.from.name === 'SyteNav',
  'every other email is exactly as it was - no copy, the usual reply-to and sender name')
ok((buildSendGridPayload({ to: 'a@b.com', subject: 's', text: 't', replyTo: 'not an address' }, cfg) as any).reply_to.email === 'support@example.com',
  'a reply-to that is not an address falls back rather than breaking the send')

// ── the address it starts on ────────────────────────────────────────────────
const dir = [
  { id: 'c1', name: 'Toms River Township', type: 'inspector', contact_email: 'permits@tomsriver.gov' },
  { id: 'c2', name: 'Lakewood', type: 'inspector', contact_email: 'bd@lakewood.gov' },
]
const s1 = suggestAddress('  toms river   township ', dir, [])
ok(s1?.email === 'permits@tomsriver.gov' && s1.source === 'directory' && s1.contactId === 'c1',
  'the Directory contact whose name IS the township, case and spacing aside')
ok(suggestAddress('Toms River', dir, []) === null, 'a partial name is not a match - the wrong township\'s inbox is worse than an empty box')
const twins = [...dir, { id: 'c3', name: 'Toms River Township', type: 'inspector', contact_email: 'other@x.gov' }]
const recent = [
  { recipient_email: 'old@tomsriver.gov', authority: 'Toms River Township', created_at: '2026-10-01' },
  { recipient_email: 'new@tomsriver.gov', authority: 'Toms River Township', created_at: '2026-10-20' },
  { recipient_email: 'x@lakewood.gov', authority: 'Lakewood', created_at: '2026-10-30' },
]
ok(suggestAddress('Toms River Township', twins, recent)?.email === 'new@tomsriver.gov',
  'two Directory entries with one name cannot be told apart, so it falls back to the last address THIS township was emailed at')
ok(suggestAddress('Toms River Township', [], recent)?.source === 'last_sent', '...which says where it came from')
ok(suggestAddress(null, dir, recent) === null, 'a permit with no issuer suggests nothing')

// ── what the dialog and the route refuse ────────────────────────────────────
ok(!!emailProblem({ to: '' }) && !!emailProblem({ to: 'tomsriver' }) && !!emailProblem({ to: 'noemail+1@placeholder.com' }),
  'no address, a bad one or a placeholder is refused before anything uploads')
ok(!!emailProblem({ to: 'a@b.com', cc: ['bad'] }) && emailProblem({ to: 'a@b.com', cc: ['c@d.com'] }) === null, '...and so is a bad copy address')
ok(splitAddresses('a@b.com, c@d.com;e@f.com\ng@h.com').length === 4, 'the copy box takes commas, semicolons or new lines')

const first = permitEmailCopy({ permitType: 'Building', job: '1 Test Lane', senderName: 'Jay', companyName: 'Bulk Houses', round: 1 })
ok(first.heading === 'Building permit application - 1 Test Lane' && /Jay at Bulk Houses has sent the application/.test(first.lines[0]),
  `the letter names the permit, the job and who sent it (${first.heading})`)
const second = permitEmailCopy({ permitType: 'Building', job: '1 Test Lane', senderName: 'Jay', companyName: null, round: 2, message: 'Revised site plan attached.' })
ok(/revised documents/.test(second.heading) && second.lines.includes('Revised site plan attached.'), 'a resubmission says it is the revised documents, with the message typed')

// ── the door: send first, log only what went ────────────────────────────────
const route = code('app/api/projects/[id]/permits/[permitId]/email/route.ts')
ok((route.match(/requirePermission\(db, request, 'permits', 'edit'\)/g) ?? []).length === 2 && (route.match(/ownedProject/g) ?? []).length >= 2,
  'both handlers ask permits: edit and that the job is the caller\'s own - it emails somebody outside the company')
ok(/beforeInsert: async/.test(route) && /const sent = await sendEmail\(/.test(route),
  'the email is sent INSIDE beforeInsert - after the checks and the upload, before anything is logged')
ok(/if \(!sent\.sent\) \{[\s\S]{0,200}from\('file_shares'\)\.delete\(\)[\s\S]{0,400}return \{\s*ok: false/.test(route),
  'an email that did not go logs NOTHING and leaves no link behind')
ok(/const replyTo = await permitReplyTo\(db, params\.permitId\) \?\? self\.email/.test(route) && /\breplyTo,/.test(route) && /cc_me/.test(route),
  'a reply goes to the permit\'s own address once replies are set up, and to the person who pressed it until then; the copy goes to them either way')
ok(/permit_id: params\.permitId/.test(route) && /allow_upload: true/.test(route),
  'the link is tied to this permit and lets them send the approved permit back onto it')
ok(/status: 207/.test(route) && /do not email it again/.test(route),
  'sent but not logged says exactly that - "failed" would invite a second email to the township')
ok(/maxDuration = 60/.test(route), 'uploads, a send and a write get time to finish')

const write = code('lib/writes/permit-round.ts')
ok(/const gate = await beforeInsert\(/.test(write) && /if \(!gate\.ok\) return gate\.result/.test(write)
  && write.indexOf('const gate = await beforeInsert(') < write.indexOf(".from('permit_rounds').insert("),
  'submitRound runs the hook before the round is written, and a refusal writes nothing')

const panel = code('components/permits/permit-panel.tsx')
ok(/onClick=\{openEmail\}/.test(panel) && /confirmLabel: 'Email it anyway'/.test(panel),
  'Email it asks about unticked items the same as I sent it does')

done()

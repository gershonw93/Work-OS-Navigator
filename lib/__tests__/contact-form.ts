// The public contact form at /contact.
//
// THE BUG: "Send message" built a mailto: link and handed it to the browser.
// On a machine with no mail app that does NOTHING - no error, no email - and a
// visitor who wrote to us believed they had. Reported by somebody who did
// exactly that. The form now posts to /api/contact, which keeps the message
// and emails it to the support inbox.

import { ok, done, code } from './_helpers'
import {
  CONTACT_HONEYPOT, CONTACT_LIMITS, contactInput, contactMessageMail, contactProblem,
} from '../contact-message'
import { SUPPORT_EMAIL } from '../support-email'

const form = code('components/marketing/contact-form.tsx')
const route = code('app/api/contact/route.ts')

// ── the form sends, and says so ─────────────────────────────────────────────
ok(/fetch\('\/api\/contact'/.test(form), 'THE BUG: the form posts to /api/contact')
ok(!/mailto|supportMailto|location\.href/.test(form), '...and never hands the browser a mailto: link')
ok(!/Opens your email app/.test(form), '...nor claims to open an email app it no longer opens')
ok(/Message sent/.test(form) && /setSent\(true\)/.test(form) && /res\.ok/.test(form),
  'a success message, shown only once the route answered ok')
ok(/role="alert"/.test(form) && /fetchProblem\(/.test(form), 'a failure is shown on the form, in words')
ok(/finally\s*\{\s*setSending\(false\)/.test(form), 'the sending state always ends')

// ── one rule, both doors ────────────────────────────────────────────────────
ok(/contactProblem\(/.test(form) && /contactProblem\(/.test(route), 'the form AND the route ask contactProblem')
const good = { name: 'Pat', email: 'pat@example.com', company: '', message: 'Hi' }
ok(contactProblem(good) === null, 'a complete message passes')
ok(contactProblem({ ...good, name: '' }) !== null, 'no name is refused')
ok(contactProblem({ ...good, email: 'nope' }) !== null, 'a bad address is refused')
ok(contactProblem({ ...good, message: '' }) !== null, 'an empty message is refused')
ok(contactProblem({ ...good, message: 'x'.repeat(CONTACT_LIMITS.message + 1) }) !== null, 'an essay is refused')
ok(contactInput({ name: '  Pat ', email: 5 }).name === 'Pat' && contactInput({ email: 5 }).email === '',
  'whatever was posted is read as trimmed strings')

// ── the letter ──────────────────────────────────────────────────────────────
const mail = contactMessageMail({ ...good, name: 'Pat\r\nBcc: x@y.com', company: 'Acme' })
ok(!/[\r\n]/.test(mail.subject), 'a newline in a name cannot reach the subject line')
ok(mail.text.includes('Hi') && mail.text.includes('pat@example.com') && mail.text.includes('Acme'),
  'the letter carries the message, the address and the company')

// ── a public endpoint ───────────────────────────────────────────────────────
ok(/sendEmail\(\{\s*to: SUPPORT_EMAIL/.test(route) && /replyTo: input\.email/.test(route),
  'it only ever mails OUR inbox, with the visitor as reply-to - never a relay')
ok(SUPPORT_EMAIL === 'info@sytenav.com', '...which is the support address')
ok(new RegExp(`CONTACT_HONEYPOT`).test(route) && new RegExp(`\\[CONTACT_HONEYPOT\\]`).test(form) && CONTACT_HONEYPOT === 'website',
  'a honeypot field the form sends and the route checks')
ok(/CONTACT_PER_VISITOR_PER_HOUR/.test(route) && /countError \|\| count == null/.test(route),
  'a per-sender hourly cap, and a cap that cannot be read refuses (fails closed)')
ok(!/x-forwarded-for[^\n]*insert/.test(route) && /createHmac/.test(route), 'the sender is an HMAC, no IP stored')
const insertAt = route.indexOf(".from('contact_messages')\n    .insert")
ok(insertAt > 0 && insertAt < route.indexOf('sendEmail('), 'the message is stored BEFORE the send')
ok(/if \(!sent\.sent\)[\s\S]{0,400}status: 502/.test(route),
  'a send that failed is NOT reported as sent')

// ── and somebody can FIND it ────────────────────────────────────────────────
// "we need contact us right on top - I just spent 30 seconds looking for it".
// It lived in the footer only. A top-level link in the desktop nav AND in the
// phone menu, never tucked into a dropdown.
const nav = code('components/marketing/marketing-nav.tsx')
ok((nav.match(/href="\/contact"/g) ?? []).length >= 2,
  'Contact is in the top nav on the desktop and in the phone menu')

done()

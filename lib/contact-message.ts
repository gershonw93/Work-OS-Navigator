// ─────────────────────────────────────────────────────────────────────────────
// The public contact form (/contact): what it accepts and what it sends us.
//
// It used to build a `mailto:` link and hand it to the browser. With no mail
// app configured - most webmail users, most office PCs - that does NOTHING:
// no error, no email, and a visitor who believes they wrote to us. Reported by
// somebody who did exactly that. A button whose verb is "Send" has to send, so
// the form posts to /api/contact, which keeps the message and emails it to the
// support inbox with the visitor as reply-to.
//
// `contactProblem` is asked by the form AND the route (a public endpoint takes
// whatever is posted to it, not what the form allowed).
// ─────────────────────────────────────────────────────────────────────────────

import { isEmailAddress } from './contact-email'

export const CONTACT_LIMITS = { name: 120, email: 200, company: 160, message: 5000 } as const

/** One sender, one hour. A person writes once or twice; a script writes forty. */
export const CONTACT_PER_VISITOR_PER_HOUR = 5

/**
 * The hidden field a person never sees and a form-filling bot fills in. A
 * submission carrying it is answered as if it worked - telling a bot it was
 * caught teaches it - and nothing is stored or sent.
 */
export const CONTACT_HONEYPOT = 'website'

export interface ContactInput {
  name: string
  email: string
  company: string
  message: string
}

/** Trimmed strings out of whatever was posted. */
export function contactInput(body: unknown): ContactInput {
  const b = (body ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  return { name: s(b.name), email: s(b.email), company: s(b.company), message: s(b.message) }
}

/** The first thing wrong with a submission, as a sentence, or null. */
export function contactProblem(m: ContactInput): string | null {
  if (!m.name) return 'Add your name.'
  if (!m.email) return 'Add your email address so we can reply.'
  if (!isEmailAddress(m.email)) return 'That email address does not look right.'
  if (!m.message) return 'Tell us how we can help.'
  if (m.name.length > CONTACT_LIMITS.name) return 'That name is too long.'
  if (m.email.length > CONTACT_LIMITS.email) return 'That email address is too long.'
  if (m.company.length > CONTACT_LIMITS.company) return 'That company name is too long.'
  if (m.message.length > CONTACT_LIMITS.message) {
    return `Keep the message under ${CONTACT_LIMITS.message.toLocaleString('en-US')} characters.`
  }
  return null
}

/**
 * The letter that reaches the support inbox. Plain text: it is for us, and
 * the visitor's words go out exactly as typed, never through HTML. A subject
 * line is one line, so a newline in a name cannot become a header.
 */
export function contactMessageMail(m: ContactInput): { subject: string; text: string } {
  const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim()
  const who = oneLine(m.company ? `${m.name} (${m.company})` : m.name)
  const lines = [
    `Name: ${oneLine(m.name)}`,
    `Email: ${oneLine(m.email)}`,
    ...(m.company ? [`Company: ${oneLine(m.company)}`] : []),
    '',
    m.message,
    '',
    '-',
    'Sent from the contact form at sytenav.com/contact. Reply to this email to answer them.',
  ]
  return { subject: `Contact form: ${who}`.slice(0, 200), text: lines.join('\n') }
}

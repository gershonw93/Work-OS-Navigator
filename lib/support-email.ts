// The address SyteNav tells a person to write to.
//
// ONE FACT, ONE HOME. This was four addresses hardcoded in fourteen places:
// `sytenav@gmail.com` on the in-app Help page, `hello@sytenav.com` on the
// contact page, in the contact form (twice) and as the reply-to on every email
// the app sends, `legal@sytenav.com` in four legal documents plus the shared
// legal footer, and `security@sytenav.com` on the security page - AND in the
// Organization JSON-LD, which is the copy Google prints. Changing the address
// meant finding all fourteen, and the one that shipped in front of customers
// was a personal Gmail account.
//
// The reply-to on outgoing mail is deliberately the SAME address: an email
// somebody answers and an email somebody composes from the Help page are the
// same conversation, and two inboxes for it is how one of them stops being
// read. `EMAIL_FROM` stays `noreply@` - that is the envelope sender, not
// somewhere to write, and the reply-to is what carries the answer back.

/** Where every "email us" in the product points. */
export const SUPPORT_EMAIL = 'info@sytenav.com'

/**
 * A `mailto:` with the subject already filled in.
 *
 * The subject is not decoration - it is the only thing separating a support
 * mail from everything else arriving in one inbox, which is the cost of
 * consolidating four addresses into one.
 */
export function supportMailto(subject: string, body?: string): string {
  const q = [`subject=${encodeURIComponent(subject)}`]
  if (body) q.push(`body=${encodeURIComponent(body)}`)
  return `mailto:${SUPPORT_EMAIL}?${q.join('&')}`
}

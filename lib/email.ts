// ─────────────────────────────────────────────────────────────────────────────
// Sending email.
//
// SyteNav had no way to send an email at all. Several flows are built right up
// to the point of delivery and then stop: an approved access request mints an
// invite token and sends nothing, and the signup page promises the applicant
// "you'll get an email with your invite link" - a promise the product could
// not keep.
//
// TWO DELIBERATE CHOICES.
//
// 1. SendGrid's REST API over `fetch`, not the @sendgrid/mail SDK. It is one
//    HTTP call. A dependency to build one JSON body earns nothing.
//
// 2. sendEmail NEVER THROWS. It returns a result you have to look at.
//    Delivery is the least reliable thing in any request that involves it, and
//    it is almost never the thing that actually matters - approving somebody
//    must not fail because SendGrid had a bad minute. Callers decide what a
//    failure means; this module refuses to decide for them by throwing.
//
// Not being configured is a NORMAL STATE, not an error. This ships before the
// domain is authenticated in SendGrid, and must behave correctly until it is:
// every send answers `not_configured`, the caller carries on, and the admin UI
// says so plainly instead of pretending mail went out.
// ─────────────────────────────────────────────────────────────────────────────

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send'

export type SendResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'invalid' | 'failed'; detail?: string }

export interface EmailConfig {
  configured: boolean
  apiKey: string
  from: string
  fromName: string
  replyTo: string
}

/**
 * What the environment says about sending.
 *
 * Exported and pure so the "are we set up?" decision can be tested without a
 * network, and so a caller can ask before doing expensive work.
 */
export function emailConfig(env: NodeJS.ProcessEnv = process.env): EmailConfig {
  const apiKey = (env.SENDGRID_API_KEY ?? '').trim()
  return {
    configured: apiKey.length > 0,
    apiKey,
    from: (env.EMAIL_FROM ?? '').trim() || 'noreply@sytenav.com',
    fromName: (env.EMAIL_FROM_NAME ?? '').trim() || 'SyteNav',
    // Replies to a noreply@ address are a small act of rudeness. Point them at
    // an inbox somebody actually reads.
    replyTo: (env.EMAIL_REPLY_TO ?? '').trim() || 'hello@sytenav.com',
  }
}

/** Cheap sanity check - a bad address is worth catching before an HTTP call. */
export function isEmailAddress(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.trim()
  return v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

export interface OutgoingEmail {
  to: string
  subject: string
  /** Always required. A text/plain part is what keeps mail out of spam. */
  text: string
  html?: string
}

/**
 * The exact JSON SendGrid expects.
 *
 * Split out from the sending so the body can be asserted in a test without a
 * network call. The plain-text part must come FIRST in `content` - SendGrid
 * treats the order as significance, and a mail whose last part is text/plain
 * renders as plain text in clients that would happily have shown the HTML.
 */
export function buildSendGridPayload(email: OutgoingEmail, cfg: EmailConfig) {
  const content: { type: string; value: string }[] = [{ type: 'text/plain', value: email.text }]
  if (email.html) content.push({ type: 'text/html', value: email.html })

  return {
    personalizations: [{ to: [{ email: email.to }] }],
    from: { email: cfg.from, name: cfg.fromName },
    reply_to: { email: cfg.replyTo },
    subject: email.subject,
    content,
  }
}

/**
 * Send one email. Never throws - inspect the result.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const cfg = emailConfig()
  if (!cfg.configured) return { sent: false, reason: 'not_configured' }
  if (!isEmailAddress(email.to)) return { sent: false, reason: 'invalid', detail: 'bad recipient address' }

  try {
    const res = await fetch(SENDGRID_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildSendGridPayload(email, cfg)),
    })

    // SendGrid answers 202 Accepted on success, with an empty body.
    if (res.status === 202) return { sent: true }

    // Read the body for the reason - SendGrid's errors are actually useful,
    // and "failed" on its own tells whoever is debugging nothing.
    const detail = await res.text().catch(() => '')
    return { sent: false, reason: 'failed', detail: `${res.status} ${detail}`.trim().slice(0, 500) }
  } catch (e) {
    return { sent: false, reason: 'failed', detail: e instanceof Error ? e.message : 'network error' }
  }
}

// ── Templates ────────────────────────────────────────────────────────────────
// Pure. No I/O, no env - hand them everything. That keeps them testable, and
// stops a template quietly reaching for a different origin than the caller
// intended.

/** Just the first name, for a greeting. Falls back to something usable. */
export function firstName(fullName: string | null | undefined): string {
  const n = (fullName ?? '').trim().split(/\s+/)[0]
  return n || 'there'
}

/**
 * "You're approved, here's your link."
 *
 * Deliberately plain. It carries a login link and is sent to somebody who has
 * never heard from this domain before, which is the exact shape of a phishing
 * mail - heavy HTML, buttons with hidden URLs and tracking pixels all make it
 * look worse, not better. The URL is shown in full, as itself.
 */
export function inviteEmail({ name, inviteUrl }: { name: string | null | undefined; inviteUrl: string }) {
  const hi = firstName(name)

  const text = [
    `Hi ${hi},`,
    '',
    'You\'re approved for the SyteNav beta.',
    '',
    'Create your account here:',
    inviteUrl,
    '',
    'The link is personal to you and only works once.',
    '',
    'If you have any trouble, just reply to this email.',
    '',
    'Gershon',
    'SyteNav',
  ].join('\n')

  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1a1a">
<p>Hi ${escapeHtml(hi)},</p>
<p>You&rsquo;re approved for the SyteNav beta.</p>
<p>Create your account here:<br><a href="${escapeHtml(inviteUrl)}">${escapeHtml(inviteUrl)}</a></p>
<p>The link is personal to you and only works once.</p>
<p>If you have any trouble, just reply to this email.</p>
<p>Gershon<br>SyteNav</p>
</div>`

  return { subject: 'Your SyteNav invite', text, html }
}

/** Minimal escaping - these templates interpolate names and URLs, nothing more. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

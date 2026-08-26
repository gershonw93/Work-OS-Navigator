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

import { CANONICAL_ORIGIN } from '@/lib/canonical'

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

// ── Brand ────────────────────────────────────────────────────────────────────
// Lifted from the CSS custom properties in app/globals.css. Email cannot read
// those - no stylesheet, no var() - so the values are repeated here as literal
// hex. If the theme changes, this is the second place to change.

const BRAND = {
  surface: '#F4F4F1',
  panel: '#FFFFFF',
  line: '#E7E7E2',
  ink: '#16181B',
  inkSoft: '#3A3F46',
  mutedFg: '#6A6E74',
  faint: '#9A9C96',
  accent: '#C9F24A',      // lime fill
  accentFg: '#5F7A12',    // readable lime as TEXT on light
  accentInk: '#16181B',   // text ON a lime fill
  font: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
}

export interface EmailLayout {
  /** The grey line the inbox shows after the subject. */
  preheader: string
  /** Small uppercase label above the heading, e.g. "DOCUMENT REQUEST". */
  eyebrow: string
  heading: string
  /** Sub-line under the heading - who/what this concerns. Optional. */
  subheading?: string
  /** Body paragraphs. Plain strings; escaped for you. */
  paragraphs: string[]
  cta?: { label: string; url: string }
  /** Small print under the card. */
  footNote?: string
}

/**
 * One shell every SyteNav email renders into, matching the token-link pages.
 *
 * THREE THINGS EMAIL CANNOT DO that the web app takes for granted, and what
 * is done instead:
 *
 *   * SVG is stripped by Gmail and Outlook, so the arrow mark cannot be the
 *     real logo. The lockup is rebuilt out of text and a coloured cell, which
 *     always renders.
 *   * Gmail strips base64 data: URIs outright, so an image has to be HOSTED.
 *     Blocked-by-default is largely history - Gmail has proxied and displayed
 *     images since 2013, as do Apple Mail and Outlook.com - so the answer is a
 *     hosted image with real alt text and explicit dimensions, NOT avoiding
 *     images. The one image here is the mark; the wordmark stays as text, so a
 *     blocked image costs a small square rather than the company name.
 *   * Outlook renders through Word: no flexbox, no grid, and inline styles
 *     only. Hence tables, and hence a square button rather than a rounded one
 *     there. It degrades to something plain rather than something broken.
 *
 * The destination URL is ALSO printed as text under the button, always. A
 * button whose href nobody can see is the shape of a phishing mail, and these
 * carry login links to people who have never had mail from this domain.
 * Showing the URL costs one line and is the single cheapest thing that makes a
 * branded mail trustworthy.
 */
export function emailLayout(l: EmailLayout): string {
  const e = escapeHtml
  const body = l.paragraphs
    .map(p => `<p style="margin:0 0 14px;color:${BRAND.inkSoft};font-size:15px;line-height:1.55">${e(p)}</p>`)
    .join('')

  const cta = l.cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px">
<tr><td style="border-radius:10px;background:${BRAND.accent}">
<a href="${e(l.cta.url)}" style="display:inline-block;padding:13px 26px;font-family:${BRAND.font};font-size:15px;font-weight:700;color:${BRAND.accentInk};text-decoration:none;border-radius:10px">${e(l.cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 4px;color:${BRAND.faint};font-size:12px">Or paste this into your browser:</p>
<p style="margin:0;font-size:12px;word-break:break-all"><a href="${e(l.cta.url)}" style="color:${BRAND.accentFg};text-decoration:underline">${e(l.cta.url)}</a></p>`
    : ''

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${e(l.heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.surface}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(l.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.surface};padding:28px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px">

<tr><td style="padding:0 4px 18px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="30" height="30" style="width:30px;height:30px"><img src="${CANONICAL_ORIGIN}/email-logo" width="30" height="30" alt="" style="display:block;border:0;outline:none;text-decoration:none;border-radius:8px"></td>
<td style="padding-left:9px;font-family:${BRAND.font};font-size:19px;font-weight:800;letter-spacing:-0.4px;color:${BRAND.ink}">SYTE<span style="color:${BRAND.accentFg}">NAV</span></td>
<!-- The mark carries alt="" on purpose: the wordmark beside it is real text,
     so alt text on the image would make a screen reader say SyteNav twice, and
     a blocked image still leaves the name readable. -->
</tr></table>
</td></tr>

<tr><td style="background:${BRAND.panel};border:1px solid ${BRAND.line};border-radius:14px;padding:26px 26px 24px;font-family:${BRAND.font}">
<p style="margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BRAND.accentFg}">${e(l.eyebrow)}</p>
<h1 style="margin:0 0 ${l.subheading ? '6px' : '16px'};font-size:22px;line-height:1.3;font-weight:800;color:${BRAND.ink}">${e(l.heading)}</h1>
${l.subheading ? `<p style="margin:0 0 18px;font-size:14px;color:${BRAND.mutedFg}">${e(l.subheading)}</p>` : ''}
${body}${cta}
</td></tr>

${l.footNote ? `<tr><td style="padding:16px 6px 0;font-family:${BRAND.font};font-size:12px;line-height:1.5;color:${BRAND.faint}">${e(l.footNote)}</td></tr>` : ''}
<tr><td style="padding:14px 6px 0;font-family:${BRAND.font};font-size:11px;color:${BRAND.faint}">SyteNav &middot; Construction management built for the field</td></tr>

</table></td></tr></table></body></html>`
}

// ── Templates ────────────────────────────────────────────────────────────────
// The plain-text part is not a fallback nobody reads. It is what keeps mail out
// of spam, and what some people genuinely receive, so it is written to stand on
// its own rather than being a stripped copy of the HTML.

/** Just the first name, for a greeting. Falls back to something usable. */
export function firstName(fullName: string | null | undefined): string {
  const n = (fullName ?? '').trim().split(/\s+/)[0]
  return n || 'there'
}

/** "You're approved, here's your link." */
export function inviteEmail({ name, inviteUrl }: { name: string | null | undefined; inviteUrl: string }) {
  const hi = firstName(name)

  const text = [
    `Hi ${hi},`,
    '',
    "You're approved for the SyteNav beta.",
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

  const html = emailLayout({
    preheader: 'Your invite link to create a SyteNav account.',
    eyebrow: 'You\u2019re approved',
    heading: 'Welcome to the SyteNav beta',
    paragraphs: [
      `Hi ${hi}, your access request is approved.`,
      'Create your account and you can start putting jobs in straight away.',
    ],
    cta: { label: 'Create your account', url: inviteUrl },
    footNote: 'This link is personal to you and only works once. If you have any trouble, just reply to this email.',
  })

  return { subject: 'Your SyteNav invite', text, html }
}

/**
 * A notification, by email.
 *
 * Deliberately one line of content and one link. A notification email that
 * restates everything in the app is a reason to stop opening notification
 * emails; this one exists to say what happened and get you to the thing.
 *
 * The footer names where to turn it off. Every recipient of one of these has an
 * account, so pointing at Settings is the right affordance - a signed
 * one-click unsubscribe is for bulk mail, which this is not.
 */
export function notificationEmail({
  name, eyebrow, heading, message, url, settingsUrl,
}: {
  name: string | null | undefined
  eyebrow: string
  heading: string
  message: string
  url: string | null
  settingsUrl: string
}) {
  const hi = firstName(name)

  const text = [
    `Hi ${hi},`,
    '',
    message,
    ...(url ? ['', url] : []),
    '',
    '---',
    `Change which of these you get: ${settingsUrl}`,
  ].join('\n')

  const html = emailLayout({
    preheader: message,
    eyebrow,
    heading,
    paragraphs: [`Hi ${hi},`, message],
    cta: url ? { label: 'Open in SyteNav', url } : undefined,
    footNote: `You are getting this because of your notification settings. Change which of these you receive at ${settingsUrl}`,
  })

  return { subject: heading, text, html }
}

/**
 * "Here is the link to your job."
 *
 * Goes to somebody with no account, so the link IS the product - which is why
 * emailLayout prints the URL under the button rather than hiding it behind one.
 */
export function clientPortalEmail({
  clientName, projectName, senderName, companyName, portalUrl, note,
}: {
  clientName: string | null | undefined
  projectName: string
  senderName: string | null | undefined
  companyName: string | null | undefined
  portalUrl: string
  note?: string | null
}) {
  const hi = firstName(clientName)
  const from = (senderName ?? '').trim() || (companyName ?? '').trim() || 'your contractor'
  const sig = [(senderName ?? '').trim(), (companyName ?? '').trim()].filter(Boolean)

  const body = [
    `${from} has shared the job "${projectName}" with you.`,
    'You can see progress, photos, documents and where the money is up to. No account or password needed - the link is all you need.',
  ]
  if (note?.trim()) body.splice(1, 0, note.trim())

  const text = [
    `Hi ${hi},`,
    '',
    ...body,
    '',
    portalUrl,
    '',
    'Keep this link somewhere safe - anyone who has it can open the same page.',
    ...(sig.length ? ['', ...sig] : []),
  ].join('\n')

  const html = emailLayout({
    preheader: `Your link to ${projectName}`,
    eyebrow: 'Project shared with you',
    heading: projectName,
    subheading: companyName?.trim() || undefined,
    paragraphs: [`Hi ${hi},`, ...body],
    cta: { label: 'Open your project', url: portalUrl },
    footNote: 'Keep this link somewhere safe - anyone who has it can open the same page. If you were not expecting this, you can ignore it.',
  })

  return { subject: `${projectName} - your project link`, text, html }
}

/**
 * "Here is a link, please do the thing at the end of it."
 *
 * One template for every flow that hands somebody OUTSIDE the app a token
 * link - a quote request, a compliance document request, a set of shared
 * files, a bill. They are the same operation with different nouns, and writing
 * four near-identical templates is how the four "Send" buttons that prompted
 * this ended up differing from each other in the first place.
 *
 * The recipient has no account and never will for this, so the link is not a
 * convenience - it IS the message. emailLayout prints the URL as text under
 * the button for exactly that reason.
 */
export function tokenLinkEmail({
  recipientName, eyebrow, heading, lines, ctaLabel, url, fromName, companyName, note, footNote,
}: {
  recipientName: string | null | undefined
  /** Small uppercase label, e.g. "REQUEST FOR QUOTE". */
  eyebrow: string
  heading: string
  /** Body paragraphs, in the recipient's terms. */
  lines: string[]
  ctaLabel: string
  url: string
  fromName?: string | null
  companyName?: string | null
  /** Optional line the sender typed. */
  note?: string | null
  footNote?: string
}) {
  const hi = firstName(recipientName)
  const sig = [(fromName ?? '').trim(), (companyName ?? '').trim()].filter(Boolean)
  const body = note?.trim() ? [...lines, note.trim()] : lines

  const text = [
    `Hi ${hi},`,
    '',
    ...body,
    '',
    url,
    '',
    'No account or password needed - the link is all you need.',
    ...(sig.length ? ['', ...sig] : []),
  ].join('\n')

  const html = emailLayout({
    preheader: lines[0] ?? heading,
    eyebrow,
    heading,
    subheading: companyName?.trim() || undefined,
    paragraphs: [`Hi ${hi},`, ...body],
    cta: { label: ctaLabel, url },
    footNote: footNote ?? 'No account or password needed - the link is all you need. If you were not expecting this, you can ignore it.',
  })

  return { subject: heading, text, html }
}

/** Minimal escaping - these templates interpolate names and URLs, nothing more. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

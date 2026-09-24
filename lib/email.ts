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
import { dateWords, dayDelta } from '@/lib/dates'
import { SUPPORT_EMAIL } from '@/lib/support-email'

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
    replyTo: (env.EMAIL_REPLY_TO ?? '').trim() || SUPPORT_EMAIL,
  }
}

// The address questions live in `lib/contact-email.ts` so the screens can ask
// them without importing the mail sender. Re-exported here because every
// caller already reaches for them through this module.
export { isEmailAddress, isPlaceholderEmail, reachableEmail } from './contact-email'
import { isEmailAddress, isPlaceholderEmail } from './contact-email'

export interface OutgoingEmail {
  to: string
  subject: string
  /** Always required. A text/plain part is what keeps mail out of spam. */
  text: string
  html?: string
  /**
   * The one-click unsubscribe URL, for BULK mail only.
   *
   * Present on a campaign and on nothing else. Everything else this module
   * sends is transactional or a notification - it goes to one person because
   * of something that happened to them - and offering to unsubscribe from a
   * password reset is offering something we will not honour.
   */
  unsubscribeUrl?: string | null
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

  // GMAIL AND YAHOO HAVE REQUIRED THESE OF BULK SENDERS SINCE FEBRUARY 2024.
  // Without them a campaign lands in spam however good the content is, and the
  // domain's reputation carries that into the transactional mail as well. They
  // go on bulk mail ONLY: a List-Unsubscribe header on a password reset is a
  // promise to stop sending password resets.
  const headers = email.unsubscribeUrl
    ? {
      'List-Unsubscribe': `<${email.unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    }
    : undefined

  return {
    personalizations: [{ to: [{ email: email.to }] }],
    from: { email: cfg.from, name: cfg.fromName },
    reply_to: { email: cfg.replyTo },
    subject: email.subject,
    content,
    ...(headers ? { headers } : {}),
  }
}

/**
 * Send one email. Never throws - inspect the result.
 */
export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const cfg = emailConfig()
  if (!cfg.configured) return { sent: false, reason: 'not_configured' }
  if (!isEmailAddress(email.to)) return { sent: false, reason: 'invalid', detail: 'bad recipient address' }
  // THE LAST GATE. The callers all ask `reachableEmail` now, but 26 company
  // rows already carry an invented address and a new caller will not know to
  // exclude it. A send to `noemail+...@placeholder.com` is not a send, and it
  // must not come back `sent: true` - that is what records somebody as told.
  if (isPlaceholderEmail(email.to)) {
    return { sent: false, reason: 'invalid', detail: 'no email address on file' }
  }

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

/**
 * One date moving, for a reader who has to act on it.
 *
 * THE REPORT: "old date struck through or gray, new date bold in the SyteNav
 * green - eye should land on the new date first", and "add the delta and
 * weekdays: field guys think in weekdays, not ISO dates". Two dates in the
 * same weight, both in ISO, is a sentence somebody has to parse rather than
 * read - and the ONE thing they need off it is the day they now turn up.
 */
export interface EmailDateChange {
  /** What moved - "Electrical - finishing". */
  label: string
  /** Where it was: "Wed Oct 21". */
  from: string
  /** Where it is now: "Tue Oct 24". */
  to: string
  /** "+3 days", signed. */
  delta: string
  /** The trade that pushed it, when one did. */
  because?: string | null
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
  /**
   * Date changes, rendered between the paragraphs and the CTA.
   *
   * TYPED, not HTML. A block of markup passed through data is a thing every
   * caller then has to be trusted to escape; this is four strings the layout
   * paints itself, which is the same rule the guides follow for inline links.
   */
  dateChanges?: EmailDateChange[]
  /**
   * Documents to hand the reader, as a label and a URL - same rule as
   * `dateChanges` and as a guide's inline links: TYPED, never HTML passed
   * through data. The layout paints and escapes both halves itself.
   */
  attachments?: EmailAttachment[]
  cta?: { label: string; url: string }
  /** Small print under the card. */
  footNote?: string
  /**
   * The way out, under the footer. BULK MAIL ONLY - a campaign.
   *
   * A link rather than a sentence, because the whole point is that it takes one
   * tap from the inbox with no session. Typed, like every other link the layout
   * paints: no caller passes HTML through here.
   */
  unsubscribeUrl?: string | null
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
export interface EmailAttachment {
  /** What the reader sees. The file's own name, not "Document 1". */
  label: string
  /** Where it lives. Stored file URLs are signed long, so they survive a send. */
  url: string
}

export function emailLayout(l: EmailLayout): string {
  const e = escapeHtml
  const body = l.paragraphs
    .map(p => `<p style="margin:0 0 14px;color:${BRAND.inkSoft};font-size:15px;line-height:1.55">${e(p)}</p>`)
    .join('')

  // The new date is the only thing on this card somebody has to remember, so it
  // is the only thing wearing the accent and a bold weight. Outlook renders
  // through Word: <s> and <strong> survive, a CSS-only line-through does not,
  // so the strike is the ELEMENT with the colour on top of it.
  const dates = (l.dateChanges ?? []).length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px">${
      (l.dateChanges ?? []).map(d => `<tr><td style="padding:10px 0;border-top:1px solid ${BRAND.line}">
<p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${BRAND.ink}">${e(d.label)}</p>
<p style="margin:0;font-size:15px;line-height:1.5;color:${BRAND.inkSoft}">was <s style="color:${BRAND.faint}">${e(d.from)}</s>, now <strong style="color:${BRAND.accentFg};font-weight:800">${e(d.to)}</strong> <span style="color:${BRAND.mutedFg}">(${e(d.delta)})</span></p>
${d.because ? `<p style="margin:4px 0 0;font-size:12px;color:${BRAND.mutedFg}">${e(d.because)} moved</p>` : ''}
</td></tr>`).join('')
    }</table>`
    : ''

  // ATTACHMENTS ARE LINKS, NOT FILES. A revised drawing is tens of megabytes
  // and a mail server will refuse it; the URL is already signed for years, so
  // the letter carries the link and the sub downloads it the same way the
  // Sharing tab's recipients do.
  const attachments = (l.attachments ?? []).length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 18px">
<tr><td style="padding:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.6px;text-transform:uppercase;color:${BRAND.mutedFg}">Attached</td></tr>${
      (l.attachments ?? []).map(a => `<tr><td style="padding:10px 0;border-top:1px solid ${BRAND.line}">
<a href="${e(a.url)}" style="color:${BRAND.accentFg};font-size:15px;font-weight:700;text-decoration:underline;word-break:break-word">${e(a.label)}</a>
</td></tr>`).join('')
    }</table>`
    : ''

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
${body}${dates}${attachments}${cta}
</td></tr>

${l.footNote ? `<tr><td style="padding:16px 6px 0;font-family:${BRAND.font};font-size:12px;line-height:1.5;color:${BRAND.faint}">${e(l.footNote)}</td></tr>` : ''}
<tr><td style="padding:14px 6px 0;font-family:${BRAND.font};font-size:11px;color:${BRAND.faint}">SyteNav &middot; Construction management built for the field</td></tr>
${l.unsubscribeUrl ? `<tr><td style="padding:8px 6px 0;font-family:${BRAND.font};font-size:11px;line-height:1.5;color:${BRAND.faint}">Don't want these? <a href="${e(l.unsubscribeUrl)}" style="color:${BRAND.faint};text-decoration:underline">Unsubscribe</a>. You'll still get anything about your own account - invoices, bids and password resets.</td></tr>` : ''}

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

// ── Four invites, because there are four people ──────────────────────────────
//
// THE BUG. Inviting a subcontractor from the Directory sent them this:
// "YOU'RE APPROVED · Welcome to the SyteNav beta · your access request is
// approved · start putting jobs in straight away."
//
// Not one clause of that is true for a sub. They never asked for access, they
// are not in a beta they applied to, and they do not put jobs in - they answer
// somebody else's. `inviteEmail` was written for exactly one audience and then
// used for all three, so two of the three were told they had come through a
// door they had never seen.
//
// There are two doors into SyteNav and they mean different things:
//
//   WAITLIST  a stranger asks, a super admin approves. "You're approved" is
//             true here and nowhere else.
//   INVITE    somebody already inside vouches for a person. There is no second
//             approval because the invite IS the approval.
//
// So: one template per audience, and each says which door you came through.
//
// AND THEN A FOURTH PERSON APPEARED: a stranger the platform OWNER invites out
// of the blue. They come through the waitlist door mechanically - same table,
// same token, same signup unlock - and they did not ask, so "your access
// request is approved" asks them to remember something that never happened.
// Same sentence, same table, different truth, which is why the split is by
// AUDIENCE and not by code path.

/**
 * The waitlist approval - and ONLY the waitlist approval.
 *
 * `app/api/admin/access-requests/route.ts` is the sole caller. It is the one
 * place "you're approved" describes something that happened, because somebody
 * really did apply and an admin really did approve it.
 */
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
 * A stranger the PLATFORM OWNER invited, who never asked for anything.
 *
 * Mechanically identical to the waitlist approval above - an `access_requests`
 * row, a token, the same `/signup?invite=` link - and a different thing said,
 * because nothing was approved. They did not apply. Telling them their request
 * went through is the `inviteEmail`-for-everybody bug in a new place, which is
 * the whole reason these are split by audience rather than by code path.
 *
 * `app/api/admin/access-requests/route.ts` POST is the sole caller, and it sets
 * `source: 'invite'` on the row so the console can tell the two apart later.
 */
export function platformInviteEmail({
  name, inviteUrl,
}: { name: string | null | undefined; inviteUrl: string }) {
  const hi = firstName(name)

  const text = [
    `Hi ${hi},`,
    '',
    "I'd like to invite you to SyteNav - it's construction management software for",
    'general contractors: the estimate, the subs, the schedule, and every dollar in',
    'and out of a job, in one place.',
    '',
    'Create your account here:',
    inviteUrl,
    '',
    'It is free while we are in beta, and there is no card to put in.',
    '',
    'The link is personal to you and only works once.',
    '',
    'If you have any questions, just reply to this email.',
    '',
    'Gershon',
    'SyteNav',
  ].join('\n')

  const html = emailLayout({
    preheader: 'Your personal invite to create a SyteNav account.',
    eyebrow: 'You\u2019re invited',
    heading: 'An invitation to SyteNav',
    paragraphs: [
      `Hi ${hi}, I\u2019d like to invite you to SyteNav - construction management for general contractors, with the estimate, the subs, the schedule and the money on one page.`,
      'It is free while we are in beta, and there is no card to put in. Create your account and you can put a real job in straight away.',
    ],
    cta: { label: 'Create your account', url: inviteUrl },
    footNote: 'This link is personal to you and only works once. If you have any questions, just reply to this email.',
  })

  return { subject: 'An invitation to SyteNav', text, html }
}

/**
 * A teammate an admin added to their own company.
 *
 * They made no request, so nothing here is approved. What they need to know is
 * who added them and to what - a bare "create your account" from a product you
 * have never signed up to reads as spam.
 */
export function teamInviteEmail({
  name, companyName, inviterName, inviteUrl,
}: {
  name: string | null | undefined
  companyName: string | null | undefined
  inviterName: string | null | undefined
  inviteUrl: string
}) {
  const hi = firstName(name)
  const company = (companyName ?? '').trim() || 'your company'
  const who = (inviterName ?? '').trim()
  const added = who ? `${who} added you to ${company}` : `You have been added to ${company}`

  const text = [
    `Hi ${hi},`,
    '',
    `${added} on SyteNav.`,
    '',
    'Set up your account here:',
    inviteUrl,
    '',
    'The link is personal to you and only works once.',
    '',
    'If you were not expecting this, just reply to this email.',
    '',
    'SyteNav',
  ].join('\n')

  const html = emailLayout({
    preheader: `${added} on SyteNav.`,
    eyebrow: 'You have been added',
    heading: `${added}`,
    paragraphs: [
      `Hi ${hi}, you now have an account on ${company}'s jobs.`,
      'Set a password and you are in - what you can see depends on the role you were given.',
    ],
    cta: { label: 'Set up your account', url: inviteUrl },
    footNote: 'This link is personal to you and only works once. If you were not expecting this, just reply to this email.',
  })

  return { subject: `${added} on SyteNav`, text, html }
}

/**
 * A subcontractor or supplier a GC invited out of their Directory.
 *
 * The audience the reported bug was actually sent to. They are not joining the
 * GC's staff and they are not putting jobs in, so the mail says what the login
 * is FOR - which is the only reason an outside company would bother creating
 * one. No "beta", no "approved": they applied for nothing.
 */
export function vendorInviteEmail({
  name, gcName, inviteUrl,
}: {
  name: string | null | undefined
  gcName: string | null | undefined
  inviteUrl: string
}) {
  const hi = firstName(name)
  const gc = (gcName ?? '').trim() || 'A contractor you work with'

  const text = [
    `Hi ${hi},`,
    '',
    `${gc} works with you on SyteNav and has set you up with an account.`,
    '',
    'With it you can:',
    '- see the jobs you are on',
    '- price the work they send you and quote it back',
    '- send in your bills and see what has been paid',
    '- keep your insurance and licence current so nothing holds up a payment',
    '',
    'Create your account here:',
    inviteUrl,
    '',
    'It is free, it is personal to you, and the link only works once.',
    '',
    'If you were not expecting this, just reply to this email.',
    '',
    'SyteNav',
  ].join('\n')

  const html = emailLayout({
    preheader: `${gc} has set you up with a SyteNav account.`,
    eyebrow: 'An invitation',
    heading: `${gc} works with you on SyteNav`,
    paragraphs: [
      `Hi ${hi}, they have set you up with an account - it is free and it is yours.`,
      'Use it to see the jobs you are on, quote the work they send you, send in your bills and see what has been paid, and keep your insurance and licence current so nothing holds up a payment.',
    ],
    cta: { label: 'Create your account', url: inviteUrl },
    footNote: 'This link is personal to you and only works once. If you were not expecting this, just reply to this email.',
  })

  return { subject: `${gc} invited you to SyteNav`, text, html }
}

/**
 * The password reset link.
 *
 * Deliberately terse, and deliberately says what to do if it was not you. A
 * reset email is the one piece of mail an attacker can cause to be sent to
 * somebody else's inbox, so it has to be readable as "somebody asked, nothing
 * has happened yet" rather than as an alarm.
 *
 * No name on it: this is sent from an unauthenticated form where all we have
 * is the address typed into it. Guessing at a greeting would mean looking the
 * person up, and confirming an account exists is the thing that endpoint most
 * needs to avoid.
 */
export function passwordResetEmail({ resetUrl }: { resetUrl: string }) {
  const text = [
    'Somebody asked to reset the password on your SyteNav account.',
    '',
    'Set a new password here:',
    resetUrl,
    '',
    'The link expires in an hour and only works once.',
    '',
    "If this wasn't you, ignore this email - your password has not changed.",
    '',
    'SyteNav',
  ].join('\n')

  const html = emailLayout({
    preheader: 'Set a new password for your SyteNav account.',
    eyebrow: 'Password reset',
    heading: 'Set a new password',
    paragraphs: [
      'Somebody asked to reset the password on your SyteNav account.',
      'The link below expires in an hour and only works once.',
    ],
    cta: { label: 'Set a new password', url: resetUrl },
    footNote: "If this wasn't you, ignore this email - your password has not changed.",
  })

  return { subject: 'Reset your SyteNav password', text, html }
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
/**
 * The first thing a new company ever hears from us.
 *
 * THE GAP: nothing. `complete-signup` created a company, a profile and a trial
 * and sent not a word - so the first automated mail a customer received was the
 * trial warning on day 12, by which point they had either worked it out alone
 * or quietly gone. This is transactional, sent by the route, and deliberately
 * not routed through the notification catalog: it has no audience choice, it
 * goes to the person who just signed up, in the same way the invite does.
 *
 * ONE THING TO DO. It resists listing the product - somebody who has just set a
 * password is not reading a feature tour - and names the day the trial ends so
 * the number in the later warnings is not the first they hear of it.
 */
export function welcomeEmail({
  name, appUrl, trialDays, trialEndWords, copy,
}: {
  name: string | null | undefined
  appUrl: string
  trialDays: number
  trialEndWords: string
  /**
   * The words, when somebody has edited them in the marketing console.
   *
   * THE STRUCTURE STAYS HERE. Only the sentences and the button label come in -
   * never HTML, never the layout. Same rule as a guide's inline links and the
   * shift email's date block: data supplies content, code supplies the shape,
   * so no stored string can break the branding or smuggle markup into an inbox.
   */
  copy?: { subject: string; paragraphs: string[]; cta?: string | null } | null
}) {
  const hi = firstName(name)
  const projectUrl = `${appUrl}/projects/new`

  const text = [
    `Hi ${hi},`,
    '',
    `You're in. Your first ${trialDays} days are free - the whole product, no card, nothing to cancel. That runs to ${trialEndWords}.`,
    '',
    'Start with a job you are actually running rather than a test one. Everything in SyteNav hangs off a job - the budget, the subs, the bills, what you are owed - so the first one is what makes the rest of it mean anything:',
    projectUrl,
    '',
    'If you get stuck, reply to this email. It comes to me.',
    '',
    'Gershon',
    'SyteNav',
  ].join('\n')

  const body = copy?.paragraphs?.length ? copy.paragraphs : [
    `Hi ${hi}, your account is ready. Your first ${trialDays} days are free - the whole product, no card taken and nothing to cancel - and that runs to ${trialEndWords}.`,
    'Put in a job you are actually running rather than a test one. Everything in SyteNav hangs off a job: the budget, the subs you award, the bills they send you and what you invoice the client. The first real one is what makes the rest of it mean anything.',
    'If you get stuck, reply to this email. It comes to me.',
  ]

  const html = emailLayout({
    preheader: `Your first ${trialDays} days are free. Start with a real job.`,
    eyebrow: 'Welcome',
    heading: "You're in - start with a real job",
    paragraphs: body,
    cta: { label: (copy?.cta ?? '').trim() || 'Create your first job', url: projectUrl },
  })

  const plain = copy?.paragraphs?.length
    ? [`Hi ${hi},`, '', ...body.flatMap(p => [p, '']), projectUrl, '', 'Gershon', 'SyteNav'].join('\n')
    : text

  return {
    subject: (copy?.subject ?? '').trim() || `Welcome to SyteNav - your first ${trialDays} days are free`,
    text: plain,
    html,
  }
}

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
/**
 * "You won the job" - for a vendor with no SyteNav account.
 *
 * The award flow creates a company record from whatever was on the quote, so
 * the winner very often has an email address on file and nothing else: no
 * profile, no login, and therefore no notification preferences. notify() is
 * right to do nothing for them, but the result was that the one person who
 * most needs to hear the outcome was the one person nobody told.
 *
 * Deliberately has NO call-to-action and NO preferences link. There is nothing
 * for them to log into and no switches for them to change - a button leading to
 * a login wall they cannot pass is worse than no button.
 */
export function awardEmail({
  vendorName, scope, projectName, amount, fromName, companyName,
}: {
  vendorName: string | null | undefined
  scope: string
  projectName: string | null
  amount: number
  fromName?: string | null
  companyName?: string | null
}) {
  const hi = firstName(vendorName)
  const money = amount.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
  const where = projectName ? ` on ${projectName}` : ''
  const sig = [(fromName ?? '').trim(), (companyName ?? '').trim()].filter(Boolean)

  const paragraphs = [
    `Your quote for ${scope}${where} has been accepted at ${money}.`,
    'Expect the contract and next steps directly from them.',
  ]

  const text = [
    `Hi ${hi},`,
    '',
    ...paragraphs,
    ...(sig.length ? ['', ...sig] : []),
  ].join('\n')

  return {
    subject: `Your quote was accepted${where}`,
    text,
    html: emailLayout({
      preheader: `Accepted at ${money}.`,
      eyebrow: 'QUOTE ACCEPTED',
      heading: 'Your quote was accepted',
      subheading: projectName ?? undefined,
      paragraphs: sig.length ? [...paragraphs, sig.join(' - ')] : paragraphs,
    }),
  }
}

export interface ShiftedLine {
  /** What the sub knows this work as. */
  trade: string
  oldStart: string
  newStart: string
  /** Signed days. The template says which way rather than making them count. */
  shiftDays: number
  /** The trade that pushed it, when one did. */
  because?: string | null
}

/**
 * "Your dates moved."
 *
 * ONE EMAIL PER SUB, not per line - a sub with rough-in and finish on the same
 * job gets one letter listing both. Two letters about one slip is how somebody
 * decides the app is noise and stops opening it.
 *
 * Reply-to is the GC, because the first thing a sub does on reading this is
 * answer it, and an answer that lands in a no-reply mailbox is the phone tag
 * this feature exists to end.
 */
export function scheduleShiftEmail({
  vendorName, projectName, lines, fromName, companyName,
}: {
  vendorName: string | null | undefined
  projectName: string | null
  lines: ShiftedLine[]
  fromName?: string | null
  companyName?: string | null
}) {
  const hi = firstName(vendorName)
  const where = projectName ? ` on ${projectName}` : ''
  const sig = [(fromName ?? '').trim(), (companyName ?? '').trim()].filter(Boolean)
  const one = lines.length === 1

  // A DATE IN A LETTER IS WORDS, NOT ISO. `2026-10-24` is a database value; a
  // sub reads "Tue Oct 24" and knows whether that is this week. The weekday is
  // load-bearing, not decoration - it is how the day is checked against a diary.
  const say = (d: string) => dateWords(d)?.withWeekday ?? d

  const changes: EmailDateChange[] = lines.map(l => ({
    label: l.trade,
    from: say(l.oldStart),
    to: say(l.newStart),
    delta: dayDelta(l.shiftDays),
    because: l.because ?? null,
  }))

  const bullets = changes.map(c => {
    const why = c.because ? ` (${c.because} moved)` : ''
    return `${c.label}: was ${c.from}, now ${c.to} (${c.delta})${why}`
  })

  const opener = one
    ? `Your start${where} has moved.`
    : `${lines.length} of your dates${where} have moved.`

  const closing = 'Nothing else about the job has changed. Reply to this email if that does not work for you.'

  const text = [
    `Hi ${hi},`, '',
    opener, '',
    ...bullets.map(b => `- ${b}`), '',
    closing,
    ...(sig.length ? ['', ...sig] : []),
  ].join('\n')

  // THE SUBJECT IS THE PROJECT AND THE NEW DATE, AND NOTHING ELSE. It arrived
  // as "Your start on QA Ground-Up 2026 moved to 2026-10-24" and was clipped in
  // the list to "2026 moved to 2026-10-24" - two numbers, neither of them the
  // one that matters. The date goes in words, and the tail of the line is the
  // day itself, which is what survives a narrow inbox column.
  const subject = one
    ? `Your start${where} moved to ${dateWords(lines[0].newStart)?.short ?? lines[0].newStart}`
    : `${lines.length} of your dates${where} moved`

  return {
    subject,
    text,
    html: emailLayout({
      preheader: one
        ? `Was ${changes[0].from}, now ${changes[0].to}.`
        : `${lines.length} dates changed.`,
      eyebrow: 'SCHEDULE CHANGE',
      heading: one ? 'Your start moved' : 'Your dates moved',
      subheading: projectName ?? undefined,
      paragraphs: sig.length ? [opener, closing, sig.join(' - ')] : [opener, closing],
      dateChanges: changes,
    }),
  }
}

/**
 * "You're clear to go."
 *
 * The other half of a progress gate. A gate that only ever tells somebody they
 * are blocked leaves them ringing the GC to ask whether they can start, which
 * is the same phone call from the other end.
 */
/**
 * "You're clear to start."
 *
 * TWO THINGS HERE WERE ONLY EVER WRONG ON PAPER, because until the review
 * screen existed nothing had ever called the route that sends this.
 *
 * THE DATE IS WORDS. `startDate` was interpolated raw, so the one sentence in
 * this letter that a sub acts on read "You are down for 2026-10-24." The
 * weekday is load-bearing - it is how a day gets checked against a diary -
 * and `dateWords` is the one place that spelling is decided, exactly as the
 * shift email already does it. A missing date says so rather than printing an
 * empty sentence: a line with no start is a line nobody has dated yet.
 *
 * AND THE TRADE AHEAD IS A LIST. A line can be held by two gates, and it is
 * clear because BOTH of them opened. Naming one of them is a letter the
 * reader cannot check against the job.
 */
export function scheduleUnblockedEmail({
  vendorName, projectName, trade, predecessorTrade, startDate, fromName, companyName,
}: {
  vendorName: string | null | undefined
  projectName: string | null
  trade: string
  predecessorTrade: string | string[]
  startDate: string | null
  fromName?: string | null
  companyName?: string | null
}) {
  const hi = firstName(vendorName)
  const where = projectName ? ` on ${projectName}` : ''
  const sig = [(fromName ?? '').trim(), (companyName ?? '').trim()].filter(Boolean)

  const aheadList = (Array.isArray(predecessorTrade) ? predecessorTrade : [predecessorTrade])
    .map(t => String(t ?? '').trim()).filter(Boolean)
  const ahead = aheadList.length > 1
    ? `${aheadList.slice(0, -1).join(', ')} and ${aheadList[aheadList.length - 1]}`
    : (aheadList[0] ?? 'The trade ahead of you')
  const areIs = aheadList.length > 1 ? 'are' : 'is'

  const when = dateWords(startDate)?.withWeekday ?? null

  const paragraphs = [
    `${ahead} ${areIs} far enough along, so your ${trade} work${where} is clear to start.`,
    when
      ? `You are down for ${when}.`
      : 'There are no dates on that line yet - we will confirm them with you.',
    'Reply to this email if that does not work for you.',
  ]

  const text = [`Hi ${hi},`, '', ...paragraphs, ...(sig.length ? ['', ...sig] : [])].join('\n')

  return {
    subject: `You're clear to start${where}`,
    text,
    html: emailLayout({
      preheader: `${ahead} ${areIs} far enough along.`,
      eyebrow: 'CLEAR TO START',
      heading: "You're unblocked",
      subheading: projectName ?? undefined,
      paragraphs: sig.length ? [...paragraphs, sig.join(' - ')] : paragraphs,
    }),
  }
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * THE SCOPE / PLANS CHANGED NOTICE, for somebody with no SyteNav account.
 *
 * A sub does not have a login and does not need one - this reaches them the way
 * everything else does, by email. It carries no token and no link into the app:
 * there is nothing for them to do in SyteNav, and a login wall on a warning
 * about their own work is how a warning gets ignored.
 *
 * The CHANGE ITSELF is the whole message. The project and the person who said
 * it are context; what moved is the reason the letter exists, so it is what the
 * heading and the preheader carry.
 */
export function scopeChangeEmail({
  projectName, planName, changedBy, message, recipientName, files,
}: {
  projectName: string
  planName?: string | null
  changedBy: string
  message: string
  recipientName?: string | null
  /** Documents sent with the notice - the revised sheet, usually. */
  files?: EmailAttachment[] | null
}): { subject: string; text: string; html: string } {
  const plan = String(planName ?? '').trim()
  const who = String(changedBy ?? '').trim() || 'The contractor'
  const what = String(message ?? '').trim()

  // The SUBJECT carries the job and that something changed - an inbox clips at
  // about sixty characters, and "Update" tells nobody anything.
  const subject = plan
    ? `${projectName}: plans changed - ${plan}`
    : `${projectName}: scope changed`

  const hello = String(recipientName ?? '').trim()
  const docs = (files ?? []).filter(f => f?.label && f?.url)

  return {
    subject,
    // PLAIN TEXT TOO. Some clients render only this, and a scope change that
    // arrives blank is worse than one that never arrived - at least the second
    // gets chased.
    text: [
      hello ? `${hello},` : 'Hello,',
      '',
      `${who} has flagged a change on ${projectName}${plan ? ` (${plan})` : ''}:`,
      '',
      what,
      '',
      // The plain-text part is what some people genuinely receive, so the
      // documents have to be in it too - a notice whose attachment exists only
      // in the HTML half reaches those readers as a change with no drawing.
      ...(docs.length ? ['Attached:', ...docs.map(d => `- ${d.label}: ${d.url}`), ''] : []),
      'If this affects what you have already set out or ordered, reply to this email and speak to them before you carry on.',
    ].join('\n'),
    html: emailLayout({
      preheader: what.slice(0, 140),
      eyebrow: 'Scope change',
      heading: plan ? `Plans changed: ${plan}` : 'The scope changed on this job',
      subheading: projectName,
      paragraphs: [
        hello ? `${hello},` : 'Hello,',
        `${who} has flagged a change on ${projectName}${plan ? ` (${plan})` : ''}:`,
        what,
        'If this affects what you have already set out or ordered, reply to this email and speak to them before you carry on.',
      ],
      attachments: docs,
      footNote: 'You are getting this because you are on this job. No account or login is needed.',
    }),
  }
}

/**
 * A CAMPAIGN - the one kind of bulk mail SyteNav sends.
 *
 * Everything else in this module goes to one person because of something that
 * happened to them. This goes to a list because we decided to send it, which is
 * what makes the unsubscribe link REQUIRED rather than a nicety: it is the
 * difference between mail somebody can stop and mail they can only report.
 *
 * ONLY WORDS CROSS THE BOUNDARY. The subject, the paragraphs and the button
 * label come from a console; the shape stays here. Same rule as `welcomeEmail`
 * takes its copy, a guide's inline links, and the shift email's date block -
 * data supplies content, code supplies structure, so nothing typed into a
 * browser can break the branding or smuggle markup into an inbox.
 */
export function campaignEmail({
  name, subject, paragraphs, cta, unsubscribeUrl,
}: {
  name: string | null | undefined
  subject: string
  paragraphs: string[]
  cta?: { label: string; url: string } | null
  unsubscribeUrl: string
}) {
  const hi = firstName(name)
  const body = paragraphs.filter(p => p.trim())

  const text = [
    `Hi ${hi},`,
    '',
    ...body.flatMap(p => [p, '']),
    ...(cta ? [cta.label + ':', cta.url, ''] : []),
    'Gershon',
    'SyteNav',
    '',
    `Don't want these? Unsubscribe: ${unsubscribeUrl}`,
    "You'll still get anything about your own account.",
  ].join('\n')

  return {
    subject,
    text,
    unsubscribeUrl,
    html: emailLayout({
      preheader: body[0] ?? subject,
      eyebrow: 'SyteNav',
      heading: subject,
      paragraphs: [`Hi ${hi},`, ...body],
      cta: cta ?? undefined,
      unsubscribeUrl,
    }),
  }
}

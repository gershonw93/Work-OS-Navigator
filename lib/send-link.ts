import { NextResponse } from 'next/server'
import { isEmailAddress, sendEmail, type OutgoingEmail } from '@/lib/email'

// ─────────────────────────────────────────────────────────────────────────────
// Emailing somebody a token link, the same way every time.
//
// Four flows do this - quote requests, compliance document requests, shared
// files and client invoices - and before this they did it four different ways,
// which is to say they all used a mailto: and did not do it at all.
//
// The shape they share is not the template, it is the CONTRACT:
//
//   * never throw. A send that fails must come back as a message the UI can
//     show next to a Copy Link button, not a 500 that loses the user's place.
//   * never mint the token here. Every one of these is delivering a link that
//     already exists; creating one inside the delivery step is how the share
//     dialog used to invalidate the very link it was sending (#295).
//   * only stamp on success. "Sent" written after a failed send is a lie the
//     user will act on.
// ─────────────────────────────────────────────────────────────────────────────

export interface DeliverResult {
  ok: boolean
  response: NextResponse
}

/**
 * Send one link email and shape the response.
 *
 * `onSent` runs ONLY after a confirmed send - use it to stamp sent_at or move
 * a status. Its own failure is swallowed: the mail is already gone, and
 * reporting a failure at that point would tell the user the opposite of what
 * happened.
 */
export async function deliverLink({
  to,
  email,
  onSent,
  notConfiguredMessage = 'Email sending is not set up yet. Copy the link and send it yourself.',
  failedMessage = 'Could not send that email. Copy the link and send it yourself.',
}: {
  to: string
  email: Omit<OutgoingEmail, 'to'>
  // Deliberately `unknown` rather than Promise: Supabase's query builders are
  // thenable but are not Promises, so requiring one would force every caller
  // to wrap a perfectly good `db.from(...).update(...)` in an async arrow.
  onSent?: () => unknown
  notConfiguredMessage?: string
  failedMessage?: string
}): Promise<NextResponse> {
  if (!isEmailAddress(to)) {
    return NextResponse.json({ sent: false, error: 'That does not look like an email address.' }, { status: 400 })
  }

  const result = await sendEmail({ to, ...email })

  if (!result.sent) {
    // 200, not an error status: the request was understood and nothing is
    // broken - the send did not happen and the UI needs to say which.
    return NextResponse.json({
      sent: false,
      reason: result.reason,
      error: result.reason === 'not_configured' ? notConfiguredMessage : failedMessage,
    }, { status: 200 })
  }

  if (onSent) {
    try { await onSent() } catch { /* mail is already delivered; see above */ }
  }

  return NextResponse.json({ sent: true, to })
}

/** Read `{ to, note }` off a request body, trimmed and length-capped. */
export async function readSendBody(request: Request): Promise<{ to: string; note: string | null }> {
  const body = await request.json().catch(() => ({}))
  return {
    to: String((body as any)?.to ?? '').trim(),
    note: typeof (body as any)?.note === 'string' ? (body as any).note.trim().slice(0, 500) || null : null,
  }
}

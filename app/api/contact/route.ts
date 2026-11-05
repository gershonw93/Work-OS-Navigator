import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { SUPPORT_EMAIL } from '@/lib/support-email'
import {
  CONTACT_HONEYPOT, CONTACT_PER_VISITOR_PER_HOUR, contactInput, contactMessageMail, contactProblem,
} from '@/lib/contact-message'

// The public contact form (/contact). PUBLIC: no sign-in, so it carries its own
// limits - a honeypot, a per-sender hourly cap that FAILS CLOSED (an unread
// limit on a public endpoint is no limit), and a fixed recipient: the only
// address this route ever mails is ours, so it cannot be used as a relay.
//
// THE ROW GOES IN BEFORE THE SEND. The message is the work; the email is how
// we hear about it. A send SendGrid refuses still leaves the message here, with
// `emailed_at` null to say it never reached the inbox. See lib/contact-message.ts.

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'

/** An HMAC of the address: enough to count one sender, useless for anything else. */
function visitorId(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  return crypto.createHmac('sha256', SECRET).update(`contact:${ip}`).digest('hex').slice(0, 32)
}

const WRITE_DIRECTLY = `We could not send that just now - email us at ${SUPPORT_EMAIL} instead.`

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null
  // A bot filled in the field nobody can see. Answer as if it worked.
  if (typeof body?.[CONTACT_HONEYPOT] === 'string' && (body[CONTACT_HONEYPOT] as string).trim()) {
    return NextResponse.json({ ok: true })
  }
  const input = contactInput(body)
  const problem = contactProblem(input)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const db = admin()
  const visitor = visitorId(request)
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const { count, error: countError } = await db.from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('visitor', visitor).gte('created_at', hourAgo)
  if (countError || count == null) {
    console.error('[contact] could not read the limit', countError?.message)
    return NextResponse.json({ error: WRITE_DIRECTLY }, { status: 503 })
  }
  if (count >= CONTACT_PER_VISITOR_PER_HOUR) {
    return NextResponse.json({
      error: `That is a lot of messages in one hour - email us at ${SUPPORT_EMAIL} instead.`,
    }, { status: 429 })
  }

  const { data: row, error: insertError } = await db.from('contact_messages')
    .insert({
      name: input.name, email: input.email, company: input.company || null,
      message: input.message, visitor,
    })
    .select('id').single()
  if (insertError || !row) {
    console.error('[contact] could not store the message', insertError?.message)
    return NextResponse.json({ error: WRITE_DIRECTLY }, { status: 503 })
  }

  const mail = contactMessageMail(input)
  const sent = await sendEmail({ to: SUPPORT_EMAIL, subject: mail.subject, text: mail.text, replyTo: input.email })
  if (!sent.sent) {
    // Stored, not delivered. Say so: "sent" over a message nobody will read
    // is the claim this whole route exists to stop making.
    console.error('[contact] stored but not emailed', row.id, sent.reason, sent.detail ?? '')
    return NextResponse.json({ error: WRITE_DIRECTLY }, { status: 502 })
  }
  await db.from('contact_messages').update({ emailed_at: new Date().toISOString() }).eq('id', row.id)
  return NextResponse.json({ ok: true })
}

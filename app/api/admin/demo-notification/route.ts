import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { demoNotification } from '@/lib/demo-notification'
import { demoEmail, DEMO_EMAILS } from '@/lib/demo-emails'
import { sendEmail } from '@/lib/email'
import { notify } from '@/lib/notify'
import { effectivePrefs, wants, notificationType } from '@/lib/notifications'
import { todayDateInput } from '@/lib/dates'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The demo control board's one button.
//
// SUPER ADMIN ONLY, and that is the whole guard: this sends a real email and a
// real bell to a real person, with copy written to look like a genuine event.
// Nothing about the request body can widen who may press it - the recipient is
// an id, the type is a catalog key, and neither is a permission.
//
// It goes through `notify()` like every other notification in the app rather
// than inserting a row itself. Two reasons: a demo that bypassed preferences
// would be demonstrating a product that does not exist, and a second insert
// path is the thing `notify()` was written to end.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({} as any))
  const recipientId: string | undefined = body?.recipient_id
  const type: string | undefined = body?.type
  const emailKey: string | undefined = body?.email_key
  if (!recipientId) return NextResponse.json({ error: 'Pick who it goes to.' }, { status: 400 })

  // ── THE OTHER HALF: an email that never goes through `notify()` ──────────
  //
  // Eleven templates are sent directly by a route because they have no
  // audience to configure and no preference to honour - the welcome, the four
  // invites, a quote request, an award. The console could not reach any of
  // them, so the only way to read the welcome email was to complete a real
  // signup.
  //
  // A SECOND BRANCH RATHER THAN A SECOND ROUTE, so the super-admin gate above
  // stays the only one there is. And it is honest about the difference: this
  // ignores the recipient's notification settings, because the real send does
  // too. Saying otherwise turns a product working as designed into a bug
  // report.
  if (emailKey) {
    const sample = demoEmail(emailKey, todayDateInput())
    if (!sample) return NextResponse.json({ error: `No demo copy exists for "${emailKey}".` }, { status: 400 })

    const { data: to } = await db
      .from('profiles').select('id, full_name, email').eq('id', recipientId).maybeSingle()
    if (!to) return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 })
    // SAID BEFORE THE SEND, not after. "There was never going to be one" and
    // "the email is slow" are different facts and only one is worth waiting on.
    if (!to.email) return NextResponse.json({ error: 'That profile has no email address, so nothing can be sent to it.' }, { status: 400 })

    const result = await sendEmail({ to: to.email, ...sample })

    const label = DEMO_EMAILS.find(e => e.key === emailKey)?.label ?? emailKey
    const { error: logErr } = await db.from('demo_notification_log').insert({
      sent_by: user.id,
      sent_by_email: user.email ?? null,
      recipient_id: to.id,
      recipient_email: to.email,
      // Namespaced so the log can never confuse one of these with a real
      // notification type - `notification_type` is free text on purpose.
      notification_type: `email:${emailKey}`,
      title: sample.subject,
      message: label,
      in_app_count: 0,
      email_count: result.sent ? 1 : 0,
      push_count: 0,
    })
    if (logErr) console.error('[admin/demo-notification] could not log the send:', logErr.message)

    return NextResponse.json({
      ok: true,
      kind: 'email',
      sent: { title: sample.subject, message: label, link: null },
      recipient: { id: to.id, name: to.full_name, email: to.email },
      result: { inApp: 0, emailed: result.sent ? 1 : 0, pushed: 0 },
      emailNote: result.sent
        ? null
        : `The email did not send${result.reason ? ` (${result.reason})` : ''} - check the SendGrid key and the server log.`,
    })
  }

  if (!type) return NextResponse.json({ error: 'Pick a notification.' }, { status: 400 })

  const sample = demoNotification(type, todayDateInput())
  if (!sample) {
    return NextResponse.json({ error: `No demo copy exists for "${type}".` }, { status: 400 })
  }

  const { data: recipient } = await db
    .from('profiles').select('id, full_name, email').eq('id', recipientId).maybeSingle()
  if (!recipient) return NextResponse.json({ error: 'That user no longer exists.' }, { status: 404 })

  const result = await notify({
    db, userIds: [recipientId], type,
    title: sample.title, message: sample.message, link: sample.link,
  })

  // WHY THE EMAIL DID NOT GO, when it did not. `notify()` honours each
  // person's settings, so a recipient with email switched off for this type
  // gets the bell and nothing else - correct behaviour, and a mystery on a
  // stage unless somebody says so out loud BEFORE the demo starts.
  let emailNote: string | null = null
  if (result.emailed === 0) {
    const { data: prefRows } = await db
      .from('notification_preferences').select('type, in_app, email').eq('user_id', recipientId)
    const prefs = effectivePrefs((prefRows ?? []) as any)
    if (!wants(prefs, type, 'email')) {
      emailNote = `${recipient.full_name || 'They'} has email switched off for "${notificationType(type)?.label ?? type}", so only the bell fired.`
    } else if (!recipient.email) {
      emailNote = 'No email address on this profile.'
    } else {
      emailNote = 'The email did not send - check the SendGrid key and the server log.'
    }
  }

  // Logged whatever happened, including a send that reached nobody. Six weeks
  // from now somebody may ask why they got an email about a job that does not
  // exist, and this is the only thing that can answer them.
  const { error: logErr } = await db.from('demo_notification_log').insert({
    sent_by: user.id,
    sent_by_email: user.email ?? null,
    recipient_id: recipient.id,
    recipient_email: recipient.email ?? null,
    notification_type: type,
    title: sample.title,
    message: sample.message,
    in_app_count: result.inApp,
    email_count: result.emailed,
    push_count: result.pushed,
  })
  if (logErr) console.error('[admin/demo-notification] could not log the send:', logErr.message)

  return NextResponse.json({
    ok: true,
    sent: sample,
    recipient: { id: recipient.id, name: recipient.full_name, email: recipient.email },
    result,
    emailNote,
  })
}

/**
 * Render one of them, without sending it to anybody.
 *
 * For an email you are checking the LOOK of, mailing yourself and waiting is a
 * slow loop with a real inbox at the end of it. Same guard as the POST - this
 * returns copy that is written to look genuine, and it is nobody's business but
 * ours.
 */
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const key = new URL(request.url).searchParams.get('email') ?? ''
  const sample = demoEmail(key, todayDateInput())
  if (!sample) return NextResponse.json({ error: `No demo copy exists for "${key}".` }, { status: 400 })

  return NextResponse.json({ subject: sample.subject, html: sample.html, text: sample.text })
}

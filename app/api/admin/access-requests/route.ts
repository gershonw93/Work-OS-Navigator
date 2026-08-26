import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isSuperAdmin } from '@/lib/super-admin'
import { appOrigin } from '@/lib/app-url'
import { inviteEmail, sendEmail, type SendResult } from '@/lib/email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function requireSuperAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  if (!user || !isSuperAdmin(user.email)) return null
  return user
}

export async function GET(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await admin().from('access_requests').select('*').order('created_at', { ascending: false })
  return NextResponse.json({ requests: data ?? [] })
}

/**
 * Send somebody their invite link, and record it if it lands.
 *
 * Best-effort ON PURPOSE. The token is what grants access; the email is only
 * how it travels. A dead SendGrid must not be able to stop an approval, so
 * every failure here comes back as a result the caller reports rather than an
 * exception that unwinds the request.
 *
 * The link is built from appOrigin(), not from whatever host is serving this
 * request. Signup lives on the app domain, and an invite pointing at the
 * marketing site is a link that cannot complete.
 */
async function deliverInvite(
  db: ReturnType<typeof admin>,
  row: { id: string; name: string; email: string; invite_token: string | null },
  requestOrigin: string | null,
): Promise<SendResult> {
  if (!row.invite_token) return { sent: false, reason: 'invalid', detail: 'no invite token' }

  // Nothing in here may throw. sendEmail already guarantees that for itself,
  // but the stamping write does not - and an approval that 500s because a
  // bookkeeping update failed would break the whole point of doing this
  // best-effort.
  try {
    const inviteUrl = `${appOrigin(requestOrigin)}/signup?invite=${row.invite_token}`
    const { subject, text, html } = inviteEmail({ name: row.name, inviteUrl })
    const result = await sendEmail({ to: row.email, subject, text, html })

    if (result.sent) {
      // Only stamped on a real send. An approved row with a null
      // invite_sent_at means "nobody has been told yet", which is exactly what
      // the admin needs to see.
      await db.from('access_requests')
        .update({ invite_sent_at: new Date().toISOString() })
        .eq('id', row.id)
    }
    return result
  } catch (e) {
    return { sent: false, reason: 'failed', detail: e instanceof Error ? e.message : 'delivery error' }
  }
}

// PATCH { id, action: 'approve' | 'reject' | 'reset' | 'resend' }
export async function PATCH(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, action } = await request.json()
  if (!id || !['approve', 'reject', 'reset', 'resend'].includes(action)) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 })
  }
  const db = admin()
  const origin = request.headers.get('origin')

  // Resend changes nothing about the request - it just has another go at
  // delivering the link that already exists.
  if (action === 'resend') {
    const { data: existing, error: readErr } = await db
      .from('access_requests').select('*').eq('id', id).single()
    if (readErr || !existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    if (existing.status !== 'approved' || !existing.invite_token) {
      return NextResponse.json({ error: 'Only an approved request with a live invite can be resent.' }, { status: 400 })
    }
    const email = await deliverInvite(db, existing, origin)
    const { data: fresh } = await db.from('access_requests').select('*').eq('id', id).single()
    return NextResponse.json({ request: fresh ?? existing, email })
  }

  // Rejecting or revoking clears invite_sent_at as well as the token: any mail
  // already out there now points at a dead link, so a "sent" stamp would claim
  // something that is no longer true.
  const updates: Record<string, unknown> =
    action === 'approve'
      ? { status: 'approved', invite_token: randomUUID().replace(/-/g, ''), reviewed_at: new Date().toISOString() }
      : action === 'reject'
      ? { status: 'rejected', invite_token: null, invite_sent_at: null, reviewed_at: new Date().toISOString() }
      : { status: 'pending', invite_token: null, invite_sent_at: null, reviewed_at: null }

  const { data, error } = await db.from('access_requests').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action !== 'approve') return NextResponse.json({ request: data })

  // Approved. Try to deliver, then hand back BOTH the row and what happened to
  // the email, so the console can tell the truth instead of implying it went.
  const email = await deliverInvite(db, data, origin)
  const { data: fresh } = await db.from('access_requests').select('*').eq('id', id).single()
  return NextResponse.json({ request: fresh ?? data, email })
}

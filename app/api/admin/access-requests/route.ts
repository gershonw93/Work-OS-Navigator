import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isSuperAdmin } from '@/lib/super-admin'
import { appOrigin } from '@/lib/app-url'
import { inviteEmail, platformInviteEmail, sendEmail, type SendResult } from '@/lib/email'
import { friendlyDbError } from '@/lib/db-error'
import { invitePersonProblem, inviteFullName } from '@/lib/invite-person'

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

/**
 * Every account, keyed by email, with when they last signed in.
 *
 * auth.users is not reachable through PostgREST, so this goes via the Admin
 * API, which pages. The loop matters: without it you silently see only the
 * first page, and somebody who never signed in looks identical to somebody
 * who is simply on page two.
 *
 * Best-effort - a failure here must not take the requests list down with it.
 * Not knowing when somebody last logged in is a much smaller problem than an
 * admin console that will not load.
 */
async function accountsByEmail(db: ReturnType<typeof admin>) {
  const map = new Map<string, { exists: true; last_sign_in_at: string | null }>()
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      const users = data?.users ?? []
      if (error) break
      for (const u of users) {
        if (u.email) map.set(u.email.toLowerCase(), { exists: true, last_sign_in_at: u.last_sign_in_at ?? null })
      }
      if (users.length < 200) break
    }
  } catch { /* fall through with whatever was collected */ }
  return map
}

export async function GET(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = admin()

  const [{ data }, accounts] = await Promise.all([
    db.from('access_requests').select('*').order('created_at', { ascending: false }),
    accountsByEmail(db),
  ])

  // Whether the person ever actually got in, next to the request itself.
  // Approving somebody and never hearing from them again is invisible
  // otherwise, and that gap is exactly where people were being lost.
  const requests = (data ?? []).map(r => ({
    ...r,
    account: accounts.get(String(r.email).toLowerCase()) ?? { exists: false, last_sign_in_at: null },
  }))

  return NextResponse.json({ requests })
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
  row: { id: string; name: string; email: string; invite_token: string | null; source?: string | null },
  requestOrigin: string | null,
): Promise<SendResult> {
  if (!row.invite_token) return { sent: false, reason: 'invalid', detail: 'no invite token' }

  // Nothing in here may throw. sendEmail already guarantees that for itself,
  // but the stamping write does not - and an approval that 500s because a
  // bookkeeping update failed would break the whole point of doing this
  // best-effort.
  try {
    const inviteUrl = `${appOrigin(requestOrigin)}/signup?invite=${row.invite_token}`
    // WHICH DOOR THEY CAME THROUGH DECIDES WHAT IS TRUE. Somebody who applied
    // is told their request was approved; somebody the owner invited out of
    // the blue never applied, and being told otherwise asks them to remember
    // a request they never made. Resend goes through here too, so a resent
    // invite cannot quietly change its story.
    const { subject, text, html } = row.source === 'invite'
      ? platformInviteEmail({ name: row.name, inviteUrl })
      : inviteEmail({ name: row.name, inviteUrl })
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
    // THE SCREEN IS NOT THE ENFORCEMENT. The console stops offering Resend on a
    // used link, but a second tab, a stale page or a double press goes straight
    // round that - and the mail it would send carries a URL `complete-signup`
    // now refuses. Same rule as everywhere: the guard sits on the route too.
    if (existing.invite_used_at) {
      return NextResponse.json(
        { error: 'That link has already been used to create an account. Revoke it and approve again to issue a new one.' },
        { status: 400 },
      )
    }
    const email = await deliverInvite(db, existing, origin)
    const { data: fresh } = await db.from('access_requests').select('*').eq('id', id).single()
    return NextResponse.json({ request: fresh ?? existing, email })
  }

  // Rejecting or revoking clears invite_sent_at as well as the token: any mail
  // already out there now points at a dead link, so a "sent" stamp would claim
  // something that is no longer true.
  const updates: Record<string, unknown> =
    // EVERY BRANCH THAT TOUCHES THE TOKEN CLEARS `invite_used_at` WITH IT.
    // A new token beside a stamp from the old one is a link born dead: the
    // console would show it as sent, the customer would click it, and the
    // route would tell them it had already been used - about a link nobody had
    // ever opened. The stamp describes a token, so it dies with that token.
    action === 'approve'
      ? { status: 'approved', invite_token: randomUUID().replace(/-/g, ''), invite_used_at: null, reviewed_at: new Date().toISOString() }
      : action === 'reject'
      ? { status: 'rejected', invite_token: null, invite_sent_at: null, invite_used_at: null, reviewed_at: new Date().toISOString() }
      : { status: 'pending', invite_token: null, invite_sent_at: null, invite_used_at: null, reviewed_at: null }

  const { data, error } = await db.from('access_requests').update(updates).eq('id', id).select().single()
  // Not `error.message`. A not-null or check-constraint sentence is not
  // something to put on a screen, and the raw text still reaches the log.
  if (error) {
    console.error('[admin/access-requests] update failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  if (action !== 'approve') return NextResponse.json({ request: data })

  // Approved. Try to deliver, then hand back BOTH the row and what happened to
  // the email, so the console can tell the truth instead of implying it went.
  const email = await deliverInvite(db, data, origin)
  const { data: fresh } = await db.from('access_requests').select('*').eq('id', id).single()
  return NextResponse.json({ request: fresh ?? data, email })
}

/**
 * Invite somebody who never asked - first name, last name, email.
 *
 * The whole point is that this is the SAME machinery as approving a waitlist
 * request: one `access_requests` row, one token, the same `/signup?invite=`
 * unlock, and the same resend and revoke controls afterwards. What differs is
 * that nobody applied, so the row is born approved (`reviewed_at` stamped, a
 * token minted) and carries `source: 'invite'`, which is what picks the
 * truthful email.
 *
 * ONE FACT, ONE HOME: the form asks for a first and a last name because that is
 * how a person types one, and they are composed into `name` here. A second pair
 * of columns holding the same fact is how two spellings of a person's name end
 * up in one table.
 */
export async function POST(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const firstName = String((body as any)?.first_name ?? '').trim()
  const lastName = String((body as any)?.last_name ?? '').trim()
  const email = String((body as any)?.email ?? '').trim().toLowerCase()

  // Asked HERE, with the same set the form uses, so the answer names the field
  // rather than arriving as "a request did not happen".
  const problem = invitePersonProblem({ firstName, lastName, email })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const db = admin()

  // A row already exists for this address. The unique index on lower(email)
  // would refuse the insert, and a Postgres duplicate-key sentence is not a
  // thing to put in front of somebody - say which of the three cases it is and
  // what to do instead.
  const { data: existing } = await db
    .from('access_requests').select('*').ilike('email', email).maybeSingle()
  if (existing) {
    const where = existing.source === 'invite' ? 'invited' : 'on the waitlist'
    return NextResponse.json({
      error: existing.status === 'approved'
        ? `${email} is already ${where} and approved. Use Resend on their row to send the link again.`
        : `${email} is already ${where} (${existing.status}). Open their row below rather than inviting them twice.`,
      existingId: existing.id,
    }, { status: 409 })
  }

  // And an address that already has an ACCOUNT does not need an invite at all -
  // the link would hand them a signup form for an account they can just log
  // into. accountsByEmail already knows; asking it costs one call we make.
  const accounts = await accountsByEmail(db)
  if (accounts.has(email)) {
    return NextResponse.json({
      error: `${email} already has a SyteNav account. They can sign in - there is nothing to invite them to.`,
    }, { status: 409 })
  }

  // Born approved: nobody applied, so there is nothing to review. The token is
  // minted here for the same reason the approve path mints one - it IS the
  // access, and the email is only how it travels.
  const { data, error } = await db.from('access_requests').insert({
    name: inviteFullName({ firstName, lastName }),
    email,
    source: 'invite',
    status: 'approved',
    invite_token: randomUUID().replace(/-/g, ''),
    reviewed_at: new Date().toISOString(),
  }).select().single()

  if (error) {
    console.error('[admin/invite] insert failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  const emailResult = await deliverInvite(db, data, request.headers.get('origin'))
  const { data: fresh } = await db.from('access_requests').select('*').eq('id', data.id).single()
  return NextResponse.json({ request: fresh ?? data, email: emailResult }, { status: 201 })
}

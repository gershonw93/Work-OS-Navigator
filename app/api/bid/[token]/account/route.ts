import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { emailConfig, sendEmail, vendorInviteEmail } from '@/lib/email'
import { isEmailAddress } from '@/lib/contact-email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A free account for a sub, asked for from their quote link, so they can
 * message the GC about the request.
 *
 * WHAT KIND OF ACCOUNT. A VENDOR one - the same thing `/api/invite` makes with
 * `audience: 'vendor'`: `read_only` on the sub's own company row, which is the
 * row in this GC's Directory. It sees what it is invited to (My Bids, My Jobs)
 * and cannot open a job of its own - `read_only` holds `projects: view` and
 * nothing more, and the projects POST asks for `create`. No billing row is
 * written, which is the designed meaning of unmetered: a sub is not a tenant.
 *
 * WHICH ADDRESS. The one the invite was sent to, never a different one typed
 * here - the same rule as every invite link: good only for the address it was
 * sent to. Only an invite with NO address on it (the GC copied the link by
 * hand) takes one from the body, and it is then written onto the invite so
 * the next press cannot pick another.
 *
 * NOTHING IS GRANTED HERE. This sends a sign-in link to that inbox; the account
 * exists once somebody who can read that inbox sets a password, and
 * /api/invite/accept links it then - the path every vendor invite already
 * takes.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: invite } = await db
    .from('bid_invites')
    .select('id, token, bid_request_id, vendor_company_id, vendor_name, vendor_email, bid_requests ( title, trade, projects ( name, gc_company_id ) )')
    .eq('token', params.token)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  const body = await request.json().catch(() => ({} as any))
  const fullName = String(body.full_name ?? '').trim()
  if (!fullName) return NextResponse.json({ error: 'Enter your name.' }, { status: 400 })

  const req = (invite as any).bid_requests
  const gcCompanyId: string | null = req?.projects?.gc_company_id ?? null
  if (!gcCompanyId) return NextResponse.json({ error: 'This request is not linked to a contractor any more.' }, { status: 409 })

  // ── The company the invite went to ─────────────────────────────────────
  let company: { id: string; name: string; contact_email: string | null } | null = null
  if (invite.vendor_company_id) {
    const { data } = await db.from('companies').select('id, name, contact_email').eq('id', invite.vendor_company_id).maybeSingle()
    company = data
  }

  // ── The address ─────────────────────────────────────────────────────────
  const onFile = (invite.vendor_email || company?.contact_email || '').trim()
  const email = onFile || String(body.email ?? '').trim()
  if (!isEmailAddress(email)) {
    return NextResponse.json({ error: onFile ? 'The address on this request is not a real email address. Ask the contractor to fix it.' : 'Enter your email address.' }, { status: 400 })
  }

  // A company that already has people on SyteNav is somebody's account. A
  // forwarded quote link must not be a way to join it.
  if (company) {
    const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        signIn: true,
        email,
        message: `${company.name} already has a SyteNav account. Sign in, or ask whoever set it up to add you.`,
      })
    }
  }

  // No company on the invite yet: the one already in this GC's Directory under
  // that address, or a new Directory entry - which is what the GC would have
  // been asked to add anyway.
  if (!company) {
    const { data: known } = await db
      .from('companies')
      .select('id, name, contact_email')
      .eq('added_by_company_id', gcCompanyId)
      .ilike('contact_email', email.replace(/[%_\\]/g, '\\$&'))
      .limit(1)
      .maybeSingle()
    company = known
    if (!company) {
      const { data: made, error: makeErr } = await db
        .from('companies')
        .insert({
          name: String(body.company_name ?? '').trim() || invite.vendor_name || fullName,
          type: 'subcontractor',
          contact_email: email,
          contact_name: fullName,
          added_by_company_id: gcCompanyId,
        })
        .select('id, name, contact_email')
        .single()
      if (makeErr || !made) {
        console.error('[bid/account] company insert failed', { invite: invite.id, error: makeErr?.message })
        return NextResponse.json({ error: 'Could not set up your account. Try again.' }, { status: 500 })
      }
      company = made
    }
  }

  // Remember who this invite is for, so the thread can find them. A unique
  // clash (that company or address is already invited to this request on
  // another row) is left alone: the address match in `canUseThread` still
  // lets them in.
  const patch: Record<string, string> = {}
  if (!invite.vendor_company_id) patch.vendor_company_id = company.id
  if (!invite.vendor_email) patch.vendor_email = email
  if (Object.keys(patch).length) {
    const { error: linkErr } = await db.from('bid_invites').update(patch).eq('id', invite.id)
    if (linkErr) console.error('[bid/account] could not link invite', { invite: invite.id, error: linkErr.message })
  }

  // Pressed twice: one letter, not two.
  const { data: recent } = await db
    .from('company_invites')
    .select('created_at')
    .eq('company_id', company.id)
    .eq('status', 'pending')
    .ilike('email', email.replace(/[%_\\]/g, '\\$&'))
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (recent && Date.now() - new Date(recent.created_at).getTime() < 2 * 60_000) {
    return NextResponse.json({ sent: true, email })
  }

  const siteUrl = appOrigin(request.headers.get('origin'))
  const userData = {
    company_id: company.id,
    role: 'read_only',
    full_name: fullName,
    // Where to land once the password is set - checked by `bidReturnPath`
    // when it is read, because the person can rewrite their own metadata.
    next: `/bid/${invite.token}`,
  }

  let { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${siteUrl}/auth/callback`, data: userData },
  })
  const exists = !!linkError && /already|registered|exists/i.test(linkError.message ?? '')
  // Pressed before and never finished: the auth user exists (the first press
  // made it) with no password, so "sign in" would be a dead end. A pending
  // invite row for this company says that is what happened - send a
  // set-password link instead, which lands on the same screen and is accepted
  // the same way.
  if (exists && recent) {
    ;({ data: linkData, error: linkError } = await db.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${siteUrl}/auth/callback` },
    }))
  } else if (exists) {
    return NextResponse.json({
      signIn: true,
      email,
      message: `${email} already has a SyteNav account. Sign in to message them.`,
    })
  }

  const gcName = (await db.from('companies').select('name').eq('id', gcCompanyId).maybeSingle()).data?.name ?? null
  const askedAbout = [req?.title || req?.trade, req?.projects?.name].filter(Boolean).join(' on ') || null
  const actionLink = (linkData as any)?.properties?.action_link

  await db.from('company_invites').delete().eq('company_id', company.id).eq('email', email)
  const { error: rowErr } = await db.from('company_invites').insert({
    company_id: company.id, email, invited_by: null, role: 'read_only', status: 'pending',
  })
  // Without this row /api/invite/accept has nothing to link them to, so the
  // password would be set on an account with no company behind it.
  if (rowErr) {
    console.error('[bid/account] invite row failed', { to: email, error: rowErr.message })
    return NextResponse.json({ error: 'Could not set up your account. Try again.' }, { status: 500 })
  }

  let sent = false
  let reason: string | undefined
  if (!linkError && actionLink && emailConfig().configured) {
    const letter = vendorInviteEmail({ name: fullName, gcName, inviteUrl: actionLink, askedAbout })
    const result = await sendEmail({ to: email, ...letter })
    sent = result.sent
    if (!result.sent) reason = result.detail ?? result.reason
  } else {
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, { data: userData, redirectTo: `${siteUrl}/auth/callback` })
    sent = !inviteError
    reason = inviteError?.message ?? linkError?.message
  }
  if (!sent) {
    // Undone, so "pressed twice" above does not swallow the retry.
    await db.from('company_invites').delete().eq('company_id', company.id).eq('email', email).eq('status', 'pending')
    console.error('[bid/account] invite did not send', { to: email, reason })
    return NextResponse.json({ error: 'We could not send the email to finish your account. Try again in a minute.' }, { status: 502 })
  }

  return NextResponse.json({ sent: true, email })
}

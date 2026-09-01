import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { emailConfig, inviteEmail, sendEmail } from '@/lib/email'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { email, company_name, role } = body
  let { company_id } = body

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const db = admin()

  // If company_id wasn't sent (or is null), look it up from the inviter's profile
  if (!company_id) {
    const { data: inviterProfile } = await db
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()
    company_id = inviterProfile?.company_id
  }

  if (!company_id) {
    return NextResponse.json({ error: 'No company linked to your account. Please set up your company first.' }, { status: 400 })
  }

  // Send Supabase auth invite. Prefer configured site/app URL; fall back to the
  // request's own host so the callback always lands on the domain the app is
  // actually served from (never a stale hardcoded default).
  const origin = (() => { try { return new URL(request.url).origin } catch { return null } })()
  // APP url, not SITE url. SITE_URL is the marketing domain; an invite sent
  // there lands the recipient on a page that cannot finish signing them in.
  const siteUrl = appOrigin(origin)
  // ── Sending the invite ──────────────────────────────────────────────────
  //
  // Through OUR SendGrid, not Supabase's mailer.
  //
  // WHY. inviteUserByEmail asks Supabase Auth to send, which needs custom SMTP
  // configured in the Supabase dashboard - a second mail setup, separate from
  // SENDGRID_API_KEY, that nothing in this repo can see or test. Invites sat
  // undelivered for a day against a SendGrid account that was demonstrably
  // working: a manual send to the same address arrived while every invite
  // vanished. Two mail paths meant a working one and a broken one at the same
  // time, and no way to tell from in here which was which.
  //
  // generateLink does the half we actually need - it creates the user and
  // returns the link WITHOUT sending anything - so the email goes out the same
  // way client portal links, quote requests and beta invites already do, on
  // the path app/api/admin/access-requests/route.ts has used since #287.
  //
  // Supabase's own send stays as the fallback for an environment where
  // SENDGRID_API_KEY is unset, which is exactly what it was before.
  const redirectTo = `${siteUrl}/auth/callback`
  const userData = { company_id, role: role ?? 'read_only', full_name: body.full_name ?? '' }

  let emailSent = true
  let sendDetail: string | undefined

  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: userData },
  })

  const actionLink = (linkData as any)?.properties?.action_link

  if (!linkError && actionLink && emailConfig().configured) {
    const { subject, text, html } = inviteEmail({ name: body.full_name ?? null, inviteUrl: actionLink })
    const result = await sendEmail({ to: email, subject, text, html })
    emailSent = result.sent
    // SendGrid's own words, kept. "Failed" tells whoever is debugging nothing;
    // "The from address does not match a verified Sender Identity" tells them
    // exactly which of the two mail setups is wrong.
    if (!result.sent) sendDetail = result.detail ?? result.reason
  } else {
    // No SendGrid configured, or the link could not be minted - ask Supabase to
    // send it, which is what happened here before.
    const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
      data: userData,
      redirectTo,
    })
    if (inviteError) {
      const msg = inviteError.message?.toLowerCase() ?? ''
      if (msg.includes('already') || msg.includes('email rate limit') || msg.includes('already registered')) {
        // The row is still worth recording - the person is invited either way,
        // and Copy link works on it.
        emailSent = false
        sendDetail = inviteError.message
      } else {
        return NextResponse.json({ error: inviteError.message }, { status: 500 })
      }
    }
    if (linkError && !emailConfig().configured) sendDetail ??= linkError.message
  }

  // Delete any existing invites for this email+company so we never duplicate
  await db.from('company_invites').delete().eq('company_id', company_id).eq('email', email)

  // Insert fresh invite row
  const { error: insertError } = await db
    .from('company_invites')
    .insert({
      company_id,
      email,
      invited_by: user.id,
      role: role ?? 'read_only',
      status: 'pending',
    })
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    emailSent,
    // The REASON, not a guess at it. This used to read "user may already exist
    // or rate limit reached" whatever had gone wrong, which sent people to
    // check the wrong thing.
    note: emailSent
      ? undefined
      : `Invite recorded, but the email did not send${sendDetail ? `: ${sendDetail}` : ''}. Use Copy link to send it yourself.`,
  })
}

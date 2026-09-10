import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { emailConfig, sendEmail, teamInviteEmail, vendorInviteEmail } from '@/lib/email'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as any))
  const { email } = body

  // WHO IS THIS FOR. Two doors into SyteNav mean two different emails, and
  // sending the wrong one told a subcontractor he had been approved for a beta
  // he never applied to. Defaults to 'team' so a caller that has not been
  // updated cannot silently pick the more surprising of the two.
  const audience: 'team' | 'vendor' = body.audience === 'vendor' ? 'vendor' : 'team'

  // ── THE GATE ────────────────────────────────────────────────────────────
  //
  // This route used to check only that you were SIGNED IN. It then took `role`
  // and `company_id` out of the request body, and /api/invite/accept writes
  // that role onto the new profile - so any account at all, including a
  // read-only teammate or a sub who accepted an invite, could mint an admin of
  // any company whose id it had. middleware.ts returns early for /api/, so
  // nothing else was gating it either.
  //
  // Adding a teammate is the Settings > Team & Users screen, which is what
  // `settings_team` already names. Inviting somebody out of your Directory is a
  // directory action. Same two lines as every other write route.
  const db = admin()
  const gate = await requirePermission(db, request, audience === 'vendor' ? 'directory' : 'settings_team', 'edit')
  if (denied(gate)) return gate.denied
  const actor = gate.actor

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!actor.companyId) {
    return NextResponse.json({ error: 'No company linked to your account. Please set up your company first.' }, { status: 400 })
  }

  // ── WHICH COMPANY, decided here rather than by the caller ───────────────
  //
  // A teammate always lands on the inviter's own company; there is no legitimate
  // reason for a client to name a different one. A vendor lands on their OWN
  // company row, which must be one this company put in its directory -
  // `added_by_company_id` is what makes the Directory yours.
  let company_id: string
  if (audience === 'vendor') {
    const named = String(body.company_id ?? '')
    if (!named) {
      return NextResponse.json({ error: 'Which company are you inviting?' }, { status: 400 })
    }
    const { data: vendor } = await db
      .from('companies')
      .select('id, name, added_by_company_id')
      .eq('id', named)
      .maybeSingle()
    if (!vendor || (vendor.added_by_company_id !== actor.companyId && vendor.id !== actor.companyId)) {
      return NextResponse.json({ error: 'That company is not in your directory.' }, { status: 403 })
    }
    company_id = vendor.id
  } else {
    company_id = actor.companyId
  }

  // ── WHICH ROLE, clamped ─────────────────────────────────────────────────
  //
  // A vendor is an outside company reading their own jobs - never anything
  // else, whatever the body says. And nobody mints an admin who is not one
  // already: that is the escalation this route was wide open to.
  let role: string
  if (audience === 'vendor') {
    role = 'read_only'
  } else {
    role = body.role ?? 'read_only'
    if (role === 'admin' && actor.role !== 'admin') {
      return NextResponse.json({ error: 'Only an admin can invite another admin.' }, { status: 403 })
    }
  }

  // Who is doing the inviting - for the email, and looked up rather than taken
  // from the body. The Directory page sends the SUB's name as `company_name`,
  // which is the wrong answer to "who is inviting you".
  const [{ data: inviterProfile }, { data: inviterCompany }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', actor.userId).maybeSingle(),
    db.from('companies').select('name').eq('id', actor.companyId).maybeSingle(),
  ])
  const inviterName = (inviterProfile as any)?.full_name ?? null
  const inviterCompanyName = (inviterCompany as any)?.name ?? null

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
  const userData = { company_id, role, full_name: body.full_name ?? '' }

  let emailSent = true
  let sendDetail: string | undefined

  const { data: linkData, error: linkError } = await db.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo, data: userData },
  })

  const actionLink = (linkData as any)?.properties?.action_link

  if (!linkError && actionLink && emailConfig().configured) {
    const { subject, text, html } = audience === 'vendor'
      ? vendorInviteEmail({ name: body.full_name ?? null, gcName: inviterCompanyName, inviteUrl: actionLink })
      : teamInviteEmail({
          name: body.full_name ?? null,
          companyName: inviterCompanyName,
          inviterName,
          inviteUrl: actionLink,
        })
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
      invited_by: actor.userId,
      role,
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

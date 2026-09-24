import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { trialEnd } from '@/lib/billing-state'
import { welcomeEmail, sendEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import { TRIAL_DAYS } from '@/lib/plans'
import { dayWords } from '@/lib/dates'

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use service role client to bypass RLS
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify the token and get the user
  const { data: { user }, error: userError } = await admin.auth.getUser(token)

  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { companyName, companyType, fullName, email, userId, inviteToken } = await request.json()

  // Gated beta: account creation requires an approved access request token.
  // (Fail open only if the access_requests table doesn't exist yet.)
  const { data: invite, error: inviteErr } = await admin
    .from('access_requests')
    .select('id, status, email, invite_used_at')
    .eq('invite_token', inviteToken ?? '')
    .eq('status', 'approved')
    .maybeSingle()
  const tableMissing = (inviteErr as any)?.code === '42P01'
  if (!invite && !tableMissing) {
    return NextResponse.json({ error: 'Signup is invite-only right now. Request access and we will be in touch.' }, { status: 403 })
  }

  // ── THE LINK IS GOOD ONCE, AND ONLY FOR THE PERSON IT WAS SENT TO ────────
  //
  // The invite email has said exactly that since it was written - "The link is
  // personal to you and only works once" - and neither half was true. Nothing
  // consumed `invite_token`, and the email box on the create-account form was
  // editable, so one forwarded link minted unlimited accounts under any
  // address, each a new company with its own free trial. Copy is a spec.
  if (invite?.invite_used_at) {
    return NextResponse.json(
      { error: 'This invite link has already been used to create an account. Sign in instead, or ask us for a new link.' },
      { status: 403 },
    )
  }

  // AGAINST THE AUTHENTICATED USER, never against `email` from the body. The
  // body is the client's claim about who it is; `user.email` came back from
  // the auth server with the bearer token. Checking the claim would leave the
  // door exactly as open as it was.
  const invitedTo = (invite?.email ?? '').trim().toLowerCase()
  const signingUp = (user.email ?? '').trim().toLowerCase()
  if (invitedTo && signingUp && invitedTo !== signingUp) {
    return NextResponse.json(
      { error: `That invite was sent to ${invite!.email}. Sign up with that address, or ask us for an invite of your own.` },
      { status: 403 },
    )
  }

  const targetId = userId ?? user.id

  // Check if profile already exists
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('id', targetId)
    .single()

  if (existing) {
    return NextResponse.json({ success: true })
  }

  // Check if a company already exists with this email (manually added to directory)
  // If so, link to that company instead of creating a duplicate
  const { data: existingCompany } = await admin
    .from('companies')
    .select('id, type')
    .eq('contact_email', email)
    .single()

  let company = existingCompany

  if (!company) {
    const { data: newCompany, error: companyError } = await admin
      .from('companies')
      .insert({ name: companyName, type: companyType, contact_email: email })
      .select()
      .single()

    if (companyError) {
      return NextResponse.json({ error: companyError.message }, { status: 500 })
    }
    company = newCompany
  }

  if (!company) {
    return NextResponse.json({ error: 'Failed to create or find company' }, { status: 500 })
  }

  // Create profile
  const { error: profileError } = await admin
    .from('profiles')
    .insert({ id: targetId, company_id: company.id, email, full_name: fullName, role: 'admin' })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // THE FIFTEEN DAYS START HERE, because this is the moment a company becomes
  // a company - the one place in the product where a tenant is born.
  //
  // BUT ONLY FOR A GC. A subcontractor is a vendor on somebody else's job, not
  // a tenant: they own no projects, so they can never use the thing the plans
  // meter, and the trial would simply run out underneath them. On day sixteen
  // `billingLock` would turn their account read-only and they could no longer
  // submit a bid or a bill to the GC waiting on it - a customer of ours locked
  // out of helping a customer of ours. Subs invited by a GC through
  // `/api/invite` have always been born with no billing row at all, which is
  // the designed meaning of "unmetered" (lib/billing-state.ts); this public
  // door was the one place that disagreed.
  //
  // READ OFF THE COMPANY ROW, not off `companyType` from the request body. One
  // fact then decides both which product somebody gets and whether they are
  // metered, so the two cannot drift apart - and claiming to be a sub to dodge
  // billing hands you the sub product instead of the GC one, which is nobody's
  // idea of a win. A billing decision taken from a client's claim about itself
  // is the same shape as a role out of a request body.
  //
  // A company that later changes type is a platform console job - /admin/billing
  // can start a trial or comp it by hand. Deliberately not automatic: switching
  // a sub to a GC is a conversation, not a trigger.
  const meters = (company as { type?: string | null }).type !== 'subcontractor'

  // ON CONFLICT DO NOTHING is load-bearing rather than tidy: this route also
  // runs for somebody joining a company that already exists, and a plain
  // insert there would either fail the whole signup or, worse, reset a paying
  // customer's row back to a trial because a second person accepted an invite.
  //
  // A FAILURE HERE DOES NOT FAIL THE SIGNUP. No row means unmetered, which is
  // the permissive side, and the platform console can see a company with no
  // billing row. Refusing to let somebody into the product because a trial
  // record would not write is the wrong way round.
  const now = new Date()
  if (meters) {
    const { error: billingError } = await admin
      .from('company_billing')
      .upsert({
        company_id: company.id,
        status: 'trialing',
        trial_started_at: now.toISOString(),
        trial_ends_at: trialEnd(now).toISOString(),
      }, { onConflict: 'company_id', ignoreDuplicates: true })
    if (billingError) console.error('[billing] could not start a trial', { company: company.id, error: billingError.message })
  }

  // THE LINK IS SPENT, and only now - after the profile exists. Stamped where
  // the token is READ instead, a signup that died on the company insert would
  // burn the invite, and the only way back from our own error would be to ask
  // us for another one.
  if (invite?.id) {
    const { error: usedErr } = await admin
      .from('access_requests')
      .update({ invite_used_at: now.toISOString() })
      .eq('id', invite.id)
    if (usedErr) console.error('[signup] could not mark the invite used', { id: invite.id, error: usedErr.message })
  }

  // ── THE FIRST THING THEY EVER HEAR FROM US ───────────────────────────────
  //
  // There was nothing. A company was created and went silent until the trial
  // warning on day 12 - by which point they had either worked it out alone or
  // quietly gone. Transactional, so it is sent here rather than routed through
  // the notification catalog: it has no audience choice, exactly like the
  // invite email.
  //
  // ONLY FOR A METERED COMPANY, because it names the trial. A subcontractor has
  // no trial, and telling them theirs ends on the 9th is a sentence about
  // somebody else's account.
  //
  // NEVER FAILS THE SIGNUP - `sendEmail` guarantees that for itself, and a
  // welcome that did not go is a thing to log, not a reason to refuse somebody
  // the account they have just created.
  if (meters) {
    const result = await sendEmail({
      to: email,
      ...welcomeEmail({
        name: fullName,
        appUrl: appOrigin(request.headers.get('origin')),
        trialDays: TRIAL_DAYS,
        trialEndWords: dayWords(trialEnd(now).toISOString(), { weekday: true }) ?? `${TRIAL_DAYS} days from today`,
      }),
    })
    if (!result.sent) console.error('[signup] welcome email did not send', { to: email, reason: result.reason })
  }
  return NextResponse.json({ success: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { trialEnd } from '@/lib/billing-state'

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
    .select('id, status')
    .eq('invite_token', inviteToken ?? '')
    .eq('status', 'approved')
    .maybeSingle()
  const tableMissing = (inviteErr as any)?.code === '42P01'
  if (!invite && !tableMissing) {
    return NextResponse.json({ error: 'Signup is invite-only right now. Request access and we will be in touch.' }, { status: 403 })
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
    .select('id')
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
  const { error: billingError } = await admin
    .from('company_billing')
    .upsert({
      company_id: company.id,
      status: 'trialing',
      trial_started_at: now.toISOString(),
      trial_ends_at: trialEnd(now).toISOString(),
    }, { onConflict: 'company_id', ignoreDuplicates: true })
  if (billingError) console.error('[billing] could not start a trial', { company: company.id, error: billingError.message })

  return NextResponse.json({ success: true })
}

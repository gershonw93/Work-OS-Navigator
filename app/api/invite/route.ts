import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  // Send Supabase auth invite
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://work-os-navigator.vercel.app').replace(/\/$/, '')
  const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    data: { company_id, role: role ?? 'read_only', full_name: body.full_name ?? '' },
    redirectTo: `${siteUrl}/auth/callback`,
  })

  let emailSent = true
  if (inviteError) {
    const msg = inviteError.message?.toLowerCase() ?? ''
    if (msg.includes('already') || msg.includes('email rate limit') || msg.includes('already registered')) {
      // User already exists or rate limited — still record in DB
      emailSent = false
    } else {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }
  }

  // Record the invite (upsert so resend doesn't duplicate)
  const { error: dbError } = await db
    .from('company_invites')
    .upsert(
      {
        company_id,
        email,
        invited_by: user.id,
        role: role ?? 'read_only',
        status: 'pending',
      },
      { onConflict: 'company_id,email', ignoreDuplicates: false }
    )

  if (dbError) {
    // If upsert fails (e.g. no unique constraint), fall back to insert
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
  }

  return NextResponse.json({
    success: true,
    emailSent,
    note: emailSent ? undefined : 'Invite recorded but email could not be sent (user may already exist or rate limit reached)',
  })
}

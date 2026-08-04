import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/invite/accept
// Called right after an invited user establishes a session (sets their
// password). Links their profile to the inviting company with the invited
// role and marks the invite accepted, so it stops showing under Pending.
//
// Idempotent and safe to call on any sign-in: with no pending invite for the
// caller's email it simply reports nothing to do.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const email = user.email

  // Most recent pending invite for this email wins.
  const { data: invites } = await db
    .from('company_invites')
    .select('id, company_id, role, status')
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  const invite = invites?.[0]
  if (!invite) return NextResponse.json({ accepted: false })

  const role = invite.role ?? 'read_only'

  // Create or update the profile so it points at the inviting company. Never
  // downgrade an existing role the company already set deliberately: only set
  // the role when the profile is new or has no role yet.
  const { data: existing } = await db
    .from('profiles')
    .select('id, role, company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = { company_id: invite.company_id, email }
    if (!existing.role) patch.role = role
    await db.from('profiles').update(patch).eq('id', user.id)
  } else {
    await db.from('profiles').upsert({
      id: user.id,
      email,
      full_name: (user.user_metadata?.full_name as string) ?? '',
      company_id: invite.company_id,
      role,
    })
  }

  // Mark every pending invite for this email+company accepted (covers resends).
  await db.from('company_invites')
    .update({ status: 'accepted' })
    .eq('company_id', invite.company_id)
    .eq('email', email)
    .eq('status', 'pending')

  return NextResponse.json({ accepted: true, company_id: invite.company_id, role })
}

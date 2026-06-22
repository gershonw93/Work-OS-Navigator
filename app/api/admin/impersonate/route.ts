import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/admin/impersonate { userId }
// Super-admin only. Mints a one-time magic-link token_hash for the target user so the
// browser can establish a REAL session as them (true "log in as" for customer support).
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { userId } = await request.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  // Look up the target account
  const { data: target } = await db
    .from('profiles')
    .select('id, full_name, email, company_id')
    .eq('id', userId)
    .single()

  // Fall back to auth record if no profile row, to recover the email
  let targetEmail = target?.email ?? null
  if (!targetEmail) {
    const { data: authUser } = await db.auth.admin.getUserById(userId)
    targetEmail = authUser?.user?.email ?? null
  }
  if (!targetEmail) return NextResponse.json({ error: 'Target user not found' }, { status: 404 })

  // Generate a magic-link token_hash for the target — the client verifies it to get a real session
  const { data: link, error: linkErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email: targetEmail,
  })
  if (linkErr || !link?.properties?.hashed_token) {
    return NextResponse.json({ error: linkErr?.message ?? 'Could not generate session' }, { status: 500 })
  }

  // Audit log (best-effort — don't block impersonation if the table is missing)
  await db.from('impersonation_log').insert({
    actor_id: user.id,
    actor_email: user.email,
    target_id: userId,
    target_email: targetEmail,
    target_company_id: target?.company_id ?? null,
  })

  return NextResponse.json({
    token_hash: link.properties.hashed_token,
    target: {
      id: userId,
      name: target?.full_name || targetEmail,
      email: targetEmail,
    },
  })
}

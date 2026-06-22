import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const ALLOWED_ROLES = ['admin', 'project_manager', 'field_supervisor', 'office_staff', 'read_only']

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function getCallerProfile(token: string) {
  const db = adminClient()
  const { data: { user }, error } = await db.auth.getUser(token)
  if (error || !user) return null

  const { data: profile } = await db
    .from('profiles')
    .select('id, role, company_id')
    .eq('id', user.id)
    .single()

  return profile ?? null
}

// ── PATCH /api/settings/members/[memberId] — update role ─────────────────────

export async function PATCH(
  req: Request,
  { params }: { params: { memberId: string } },
) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await getCallerProfile(token)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { role } = await req.json().catch(() => ({}))
  if (!role || !ALLOWED_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const db = adminClient()
  const { memberId } = params

  // Verify the target member belongs to the same company
  const { data: target } = await db
    .from('profiles')
    .select('id, company_id')
    .eq('id', memberId)
    .single()

  if (!target || target.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Prevent the caller from demoting themselves
  if (memberId === caller.id) {
    return NextResponse.json({ error: 'You cannot change your own role.' }, { status: 400 })
  }

  const { data: updated, error } = await db
    .from('profiles')
    .update({ role })
    .eq('id', memberId)
    .select('id, role')

  if (error) {
    console.error('[PATCH /api/settings/members]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'No row was updated (id mismatch).' }, { status: 500 })
  }

  // Keep auth user_metadata.role in sync so stale metadata never overrides the profile.
  // Merge with existing metadata so company_id / full_name aren't wiped.
  const { data: targetUser } = await db.auth.admin.getUserById(memberId)
  const existingMeta = targetUser?.user?.user_metadata ?? {}
  const { error: metaError } = await db.auth.admin.updateUserById(memberId, {
    user_metadata: { ...existingMeta, role },
  })
  if (metaError) {
    console.warn('[PATCH /api/settings/members] metadata sync failed:', metaError.message)
    // Non-fatal — profile is the source of truth
  }

  return NextResponse.json({ ok: true, role: updated[0].role })
}

// ── DELETE /api/settings/members/[memberId] — remove member ──────────────────

export async function DELETE(
  req: Request,
  { params }: { params: { memberId: string } },
) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await getCallerProfile(token)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminClient()
  const { memberId } = params

  // Prevent self-removal
  if (memberId === caller.id) {
    return NextResponse.json({ error: 'You cannot remove yourself.' }, { status: 400 })
  }

  // Verify the target belongs to the same company
  const { data: target } = await db
    .from('profiles')
    .select('id, company_id')
    .eq('id', memberId)
    .single()

  if (!target || target.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Delete the profile row
  const { error: profileError } = await db
    .from('profiles')
    .delete()
    .eq('id', memberId)

  if (profileError) {
    console.error('[DELETE /api/settings/members] profile error', profileError)
    return NextResponse.json({ error: 'Failed to remove member' }, { status: 500 })
  }

  // Also delete the Supabase Auth user (best-effort)
  const { error: authError } = await db.auth.admin.deleteUser(memberId)
  if (authError) {
    console.warn('[DELETE /api/settings/members] auth user deletion failed:', authError.message)
    // Non-fatal — the profile is already gone
  }

  return NextResponse.json({ ok: true })
}

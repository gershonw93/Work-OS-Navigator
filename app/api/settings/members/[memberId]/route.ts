import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { ROLE_DEFAULTS } from '@/lib/permissions'
import { mayChangeRole, mayRemoveMember, type MemberContext } from '@/lib/company-owner'

/**
 * The company's owner, and whether we actually know it.
 *
 * A failed read is NOT "no owner". If migration 094 has not been applied the
 * column does not exist, the select errors, and treating that as "nobody owns
 * this company" would leave the protection silently absent - the exact shape of
 * the fail-open guards fixed in #342 and #347.
 */
async function readOwner(
  db: ReturnType<typeof adminClient>,
  companyId: string | null | undefined,
): Promise<{ ownerId: string | null; ownerKnown: boolean }> {
  if (!companyId) return { ownerId: null, ownerKnown: false }
  const { data, error } = await db
    .from('companies').select('owner_id').eq('id', companyId).single()
  if (error) return { ownerId: null, ownerKnown: false }
  return { ownerId: (data as any)?.owner_id ?? null, ownerKnown: true }
}

// Any built-in role, plus any custom class this company has defined. Checked
// per-request so newly created classes are immediately assignable.
async function isAssignableRole(
  db: ReturnType<typeof adminClient>,
  companyId: string | null | undefined,
  role: string,
): Promise<boolean> {
  if (Object.prototype.hasOwnProperty.call(ROLE_DEFAULTS, role)) return true
  if (!companyId) return false
  const { data } = await db
    .from('company_roles')
    .select('role_key')
    .eq('company_id', companyId)
    .eq('role_key', role)
    .maybeSingle()
  return !!data
}

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

// ── PATCH /api/settings/members/[memberId] - update role ─────────────────────

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
  const db = adminClient()
  if (!role || !(await isAssignableRole(db, caller.company_id, role))) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const { memberId } = params

  // Verify the target member belongs to the same company
  const { data: target } = await db
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', memberId)
    .single()

  if (!target || target.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { ownerId, ownerKnown } = await readOwner(db, caller.company_id)
  const ctx: MemberContext = {
    callerId: caller.id, callerRole: caller.role,
    targetId: memberId, targetRole: (target as any).role ?? '',
    ownerId, ownerKnown,
  }
  const verdict = mayChangeRole(ctx)
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 })

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
    // Non-fatal - profile is the source of truth
  }

  return NextResponse.json({ ok: true, role: updated[0].role })
}

// ── DELETE /api/settings/members/[memberId] - remove member ──────────────────

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

  // Verify the target belongs to the same company
  const { data: target } = await db
    .from('profiles')
    .select('id, company_id, role')
    .eq('id', memberId)
    .single()

  if (!target || target.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { ownerId, ownerKnown } = await readOwner(db, caller.company_id)
  const verdict = mayRemoveMember({
    callerId: caller.id, callerRole: caller.role,
    targetId: memberId, targetRole: (target as any).role ?? '',
    ownerId, ownerKnown,
  })
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 400 })

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
    // Non-fatal - the profile is already gone
  }

  return NextResponse.json({ ok: true })
}

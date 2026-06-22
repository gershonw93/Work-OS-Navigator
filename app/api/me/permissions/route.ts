import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getEffectivePermissions, getRoleDefaults, ROLE_DEFAULTS, type OverrideMap } from '@/lib/permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Select defensively — permission_overrides column may not exist yet
  let role = (user.user_metadata?.role as string) ?? 'read_only'
  let overrides: OverrideMap | null = null

  const { data: full, error } = await db
    .from('profiles')
    .select('role, permission_overrides')
    .eq('id', user.id)
    .single()

  if (!error && full) {
    role = full.role ?? role
    overrides = (full.permission_overrides ?? null) as OverrideMap | null
  } else {
    // Column missing or other error — fall back to role only
    const { data: basic } = await db.from('profiles').select('role').eq('id', user.id).single()
    if (basic?.role) role = basic.role
  }

  const realRole = role
  const url = new URL(request.url)

  // Admin-only "View as specific user" — preview that user's effective permissions
  const asUser = url.searchParams.get('as_user')
  if (asUser && realRole === 'admin') {
    // Caller's company for a same-company guard
    const { data: callerProfile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
    const { data: target } = await db
      .from('profiles')
      .select('id, full_name, email, role, company_id, permission_overrides')
      .eq('id', asUser)
      .single()
    if (target && target.company_id === callerProfile?.company_id) {
      return NextResponse.json({
        role: target.role ?? 'read_only',
        realRole,
        previewing: true,
        previewingUser: target.full_name || target.email,
        permissions: getEffectivePermissions(target.role, (target.permission_overrides ?? null) as OverrideMap | null),
      })
    }
  }

  // Admin-only "View as role" preview
  const viewAs = url.searchParams.get('as')
  if (viewAs && realRole === 'admin' && ROLE_DEFAULTS[viewAs]) {
    return NextResponse.json({
      role: viewAs,
      realRole,
      previewing: true,
      permissions: getRoleDefaults(viewAs),
    })
  }

  const permissions = getEffectivePermissions(role, overrides)

  return NextResponse.json({ role, realRole, previewing: false, permissions })
}

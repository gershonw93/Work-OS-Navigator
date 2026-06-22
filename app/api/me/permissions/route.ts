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

  // Admin-only "View as" preview — show the app as another role without switching accounts
  const viewAs = new URL(request.url).searchParams.get('as')
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

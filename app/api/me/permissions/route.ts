import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getEffectivePermissions, resolveRoleBase, ROLE_DEFAULTS, type OverrideMap, type PermMap } from '@/lib/permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function loadCompanyRoleMap(db: ReturnType<typeof admin>, companyId: string | null | undefined): Promise<Record<string, PermMap>> {
  if (!companyId) return {}
  const { data } = await db.from('company_roles').select('role_key, permissions').eq('company_id', companyId)
  const map: Record<string, PermMap> = {}
  for (const r of data ?? []) map[r.role_key] = r.permissions as PermMap
  return map
}

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Select defensively — permission_overrides column may not exist yet
  let role = (user.user_metadata?.role as string) ?? 'read_only'
  let overrides: OverrideMap | null = null
  let companyId: string | null = null

  const { data: full, error } = await db
    .from('profiles')
    .select('role, permission_overrides, company_id')
    .eq('id', user.id)
    .single()

  if (!error && full) {
    role = full.role ?? role
    overrides = (full.permission_overrides ?? null) as OverrideMap | null
    companyId = full.company_id ?? null
  } else {
    // Column missing or other error — fall back to role only
    const { data: basic } = await db.from('profiles').select('role, company_id').eq('id', user.id).single()
    if (basic?.role) role = basic.role
    companyId = basic?.company_id ?? null
  }

  const realRole = role
  const url = new URL(request.url)
  const companyRoleMap = await loadCompanyRoleMap(db, companyId)

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
      const targetBase = resolveRoleBase(target.role, companyRoleMap)
      return NextResponse.json({
        role: target.role ?? 'read_only',
        realRole,
        previewing: true,
        previewingUser: target.full_name || target.email,
        permissions: getEffectivePermissions(target.role, (target.permission_overrides ?? null) as OverrideMap | null, targetBase),
      })
    }
  }

  // Admin-only "View as role" preview — supports built-in roles and this
  // company's custom classes.
  const viewAs = url.searchParams.get('as')
  if (viewAs && realRole === 'admin' && (ROLE_DEFAULTS[viewAs] || companyRoleMap[viewAs])) {
    return NextResponse.json({
      role: viewAs,
      realRole,
      previewing: true,
      permissions: resolveRoleBase(viewAs, companyRoleMap),
    })
  }

  const baseDefaults = resolveRoleBase(role, companyRoleMap)
  const permissions = getEffectivePermissions(role, overrides, baseDefaults)

  return NextResponse.json({ role, realRole, previewing: false, permissions })
}

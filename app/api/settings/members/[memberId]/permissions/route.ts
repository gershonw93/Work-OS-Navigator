import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { resolveRoleBase, type OverrideMap, type PermMap } from '@/lib/permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

async function getCaller(token: string) {
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('id, role, company_id').eq('id', user.id).single()
  return profile ?? null
}

async function loadCompanyRoleMap(companyId: string | null | undefined): Promise<Record<string, PermMap>> {
  if (!companyId) return {}
  const { data } = await admin().from('company_roles').select('role_key, permissions').eq('company_id', companyId)
  const map: Record<string, PermMap> = {}
  for (const r of data ?? []) map[r.role_key] = r.permissions as PermMap
  return map
}

// GET - return the member's role, default permissions, and saved overrides
export async function GET(req: Request, { params }: { params: { memberId: string } }) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await getCaller(token)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = admin()
  const { data: member, error } = await db
    .from('profiles')
    .select('id, full_name, email, role, company_id, permission_overrides')
    .eq('id', params.memberId)
    .single()

  if (error || !member) {
    // Possibly column missing - retry without overrides
    const { data: basic } = await db.from('profiles').select('id, full_name, email, role, company_id').eq('id', params.memberId).single()
    if (!basic || basic.company_id !== caller.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const companyRoleMap = await loadCompanyRoleMap(basic.company_id)
    return NextResponse.json({
      member: basic,
      defaults: resolveRoleBase(basic.role, companyRoleMap),
      overrides: {},
    })
  }

  if (member.company_id !== caller.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const companyRoleMap = await loadCompanyRoleMap(member.company_id)
  return NextResponse.json({
    member: { id: member.id, full_name: member.full_name, email: member.email, role: member.role },
    defaults: resolveRoleBase(member.role, companyRoleMap),
    overrides: (member.permission_overrides ?? {}) as OverrideMap,
  })
}

// PUT - replace the member's overrides
export async function PUT(req: Request, { params }: { params: { memberId: string } }) {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const caller = await getCaller(token)
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = admin()
  const { data: target } = await db.from('profiles').select('id, company_id').eq('id', params.memberId).single()
  if (!target || target.company_id !== caller.company_id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const overrides = (body.overrides ?? {}) as OverrideMap

  const { error } = await db.from('profiles').update({ permission_overrides: overrides }).eq('id', params.memberId)
  if (error) {
    console.error('[PUT member permissions]', error)
    return NextResponse.json({ error: error.message, hint: 'Run: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permission_overrides jsonb;' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

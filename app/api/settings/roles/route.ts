import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  ROLE_DEFAULTS, RESOURCES, ACTIONS, isBuiltinRole, getRoleDefaults, buildAllNone,
  type PermMap,
} from '@/lib/permissions'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Built-in "classes" a company can edit (admin is always full access — never
// editable, so nobody can lock themselves out).
const BUILTIN_ORDER = ['project_manager', 'office_staff', 'field_supervisor', 'worker', 'read_only']
const BUILTIN_LABELS: Record<string, string> = {
  project_manager: 'Project Manager', office_staff: 'Office Staff',
  field_supervisor: 'Field Supervisor', worker: 'Worker', read_only: 'Field Worker',
}

async function requireAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null
  const { data: profile } = await db.from('profiles').select('id, role, company_id').eq('id', user.id).single()
  if (!profile?.company_id || !['admin', 'manager'].includes(profile.role ?? '')) return null
  return profile
}

function sanitizePermissions(input: any): PermMap {
  const base = buildAllNone()
  if (!input || typeof input !== 'object') return base
  for (const r of RESOURCES) {
    const row = input[r.key]
    if (!row || typeof row !== 'object') continue
    for (const a of ACTIONS) base[r.key][a] = !!row[a]
  }
  return base
}

function slugify(label: string): string {
  return 'custom_' + label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'custom_role'
}

// GET — every editable class for this company: built-in roles (with any
// company override applied) plus fully custom roles.
export async function GET(request: Request) {
  const caller = await requireAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = admin()

  const { data: rows, error } = await db.from('company_roles').select('*').eq('company_id', caller.company_id)
  if (error && (error as any).code === '42P01') {
    return NextResponse.json({ error: 'Run the latest migration to enable custom roles.' }, { status: 400 })
  }
  const byKey = new Map((rows ?? []).map((r: any) => [r.role_key, r]))

  const roles = BUILTIN_ORDER.map((key) => {
    const override = byKey.get(key)
    return {
      role_key: key,
      label: override?.label ?? BUILTIN_LABELS[key] ?? key,
      permissions: override ? override.permissions : getRoleDefaults(key),
      is_custom: false,
      is_overridden: !!override,
    }
  })
  for (const r of rows ?? []) {
    if (!isBuiltinRole(r.role_key)) {
      roles.push({ role_key: r.role_key, label: r.label, permissions: r.permissions, is_custom: true, is_overridden: true })
    }
  }

  return NextResponse.json({ roles })
}

// POST — create a brand-new custom role ("class").
export async function POST(request: Request) {
  const caller = await requireAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = admin()

  const body = await request.json().catch(() => ({}))
  const label = String(body.label ?? '').trim()
  if (!label) return NextResponse.json({ error: 'Give the new class a name.' }, { status: 400 })

  let roleKey = slugify(label)
  // Guarantee uniqueness within the company.
  const { data: existing } = await db.from('company_roles').select('role_key').eq('company_id', caller.company_id)
  const taken = new Set((existing ?? []).map((r: any) => r.role_key))
  if (taken.has(roleKey) || ROLE_DEFAULTS[roleKey]) roleKey = `${roleKey}_${Math.random().toString(36).slice(2, 6)}`

  // Start from Field Worker's defaults so the new class is immediately usable.
  const seed = getRoleDefaults('read_only')
  const { data, error } = await db.from('company_roles').insert({
    company_id: caller.company_id, role_key: roleKey, label, permissions: seed, is_custom: true,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ role: { role_key: data.role_key, label: data.label, permissions: data.permissions, is_custom: true, is_overridden: true } })
}

// PUT — save a class's permission grid (and/or rename it). Works for both a
// built-in role (creates/updates the override row) and a custom role.
export async function PUT(request: Request) {
  const caller = await requireAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = admin()

  const body = await request.json().catch(() => ({}))
  const roleKey = String(body.role_key ?? '')
  if (!roleKey) return NextResponse.json({ error: 'role_key is required' }, { status: 400 })
  if (roleKey === 'admin' || roleKey === 'manager') return NextResponse.json({ error: 'Admin access can\'t be edited.' }, { status: 400 })

  const permissions = sanitizePermissions(body.permissions)
  const label = String(body.label ?? '').trim() || BUILTIN_LABELS[roleKey] || roleKey

  const { data, error } = await db.from('company_roles')
    .upsert({ company_id: caller.company_id, role_key: roleKey, label, permissions, is_custom: !isBuiltinRole(roleKey) }, { onConflict: 'company_id,role_key' })
    .select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ role: { role_key: data.role_key, label: data.label, permissions: data.permissions, is_custom: data.is_custom, is_overridden: true } })
}

// DELETE — for a custom role, remove it entirely (must have no members left
// on it). For a built-in role, just drop the override so it reverts to the
// hardcoded default.
export async function DELETE(request: Request) {
  const caller = await requireAdmin(request)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = admin()

  const roleKey = new URL(request.url).searchParams.get('role_key')
  if (!roleKey) return NextResponse.json({ error: 'role_key is required' }, { status: 400 })
  if (roleKey === 'admin' || roleKey === 'manager') return NextResponse.json({ error: 'Admin access can\'t be removed.' }, { status: 400 })

  if (!isBuiltinRole(roleKey)) {
    const { count } = await db.from('profiles').select('*', { count: 'exact', head: true }).eq('company_id', caller.company_id).eq('role', roleKey)
    if ((count ?? 0) > 0) return NextResponse.json({ error: `${count} team member${count === 1 ? '' : 's'} still ${count === 1 ? 'has' : 'have'} this role — reassign them first.` }, { status: 400 })
  }

  const { error } = await db.from('company_roles').delete().eq('company_id', caller.company_id).eq('role_key', roleKey)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

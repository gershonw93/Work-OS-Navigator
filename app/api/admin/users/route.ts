import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/admin/users?q=<search>  - super-admin only, lists ALL accounts across companies
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  // `companies:company_id(name)`, NOT `companies(name)`.
  //
  // THE BUG. Migration 094 added `companies.owner_id -> profiles.id` for owner
  // protection. `profiles.company_id -> companies.id` already existed, so there
  // are now TWO relationships between these tables and an unqualified embed is
  // ambiguous - PostgREST cannot tell which one is meant and refuses the whole
  // query. This tab went blank, and it said "No users found" rather than saying
  // anything was wrong, because lib/admin-fetch.ts turned the failure into null.
  //
  // Naming the COLUMN pins it for good: another foreign key between these two
  // tables cannot make this ambiguous again. Same fix already in
  // admin/projects, which says `companies:gc_company_id(name)` because
  // projects -> companies has two of its own.
  let query = db
    .from('profiles')
    .select('id, full_name, email, role, company_id, companies:company_id(name)')
    .order('full_name')
    .limit(50)

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) {
    // Logged with the CODE. A PostgREST embed failure is PGRST201 and its
    // message names both candidate relationships - the one line that would have
    // identified this in seconds.
    console.error('[GET /api/admin/users] failed:', (error as any).code, error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const users = (data ?? []).map((p: any) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    role: p.role,
    company_id: p.company_id,
    company_name: p.companies?.name ?? null,
  }))

  return NextResponse.json({ users })
}

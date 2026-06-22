import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/admin/users?q=<search>  — super-admin only, lists ALL accounts across companies
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim()

  let query = db
    .from('profiles')
    .select('id, full_name, email, role, company_id, companies(name)')
    .order('full_name')
    .limit(50)

  if (q) {
    query = query.or(`full_name.ilike.%${q}%,email.ilike.%${q}%`)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'

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
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const q = (new URL(request.url).searchParams.get('q') ?? '').trim()

  let query = db.from('companies').select('id, name, created_at').order('name').limit(100)
  if (q) query = query.ilike('name', `%${q}%`)
  const { data: companies, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Per-company counts of users and projects
  const [{ data: profiles }, { data: projects }] = await Promise.all([
    db.from('profiles').select('company_id'),
    db.from('projects').select('gc_company_id'),
  ])
  const userCounts: Record<string, number> = {}
  for (const p of profiles ?? []) if (p.company_id) userCounts[p.company_id] = (userCounts[p.company_id] ?? 0) + 1
  const projCounts: Record<string, number> = {}
  for (const p of projects ?? []) if (p.gc_company_id) projCounts[p.gc_company_id] = (projCounts[p.gc_company_id] ?? 0) + 1

  const rows = (companies ?? []).map(c => ({
    ...c,
    user_count: userCounts[c.id] ?? 0,
    project_count: projCounts[c.id] ?? 0,
  }))

  return NextResponse.json({ companies: rows })
}

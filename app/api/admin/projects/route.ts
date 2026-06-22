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

  let query = db
    .from('projects')
    .select('id, name, status, type, client, created_at, companies:gc_company_id(name)')
    .order('created_at', { ascending: false })
    .limit(100)
  if (q) query = query.ilike('name', `%${q}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const projects = (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    project_type: p.type,
    client: p.client,
    created_at: p.created_at,
    company_name: p.companies?.name ?? null,
  }))

  return NextResponse.json({ projects })
}

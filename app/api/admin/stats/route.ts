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

  const count = (q: any) => q.then((r: any) => r.count ?? 0)
  const [companies, users, projects, activeProjects] = await Promise.all([
    count(db.from('companies').select('id', { count: 'exact', head: true })),
    count(db.from('profiles').select('id', { count: 'exact', head: true })),
    count(db.from('projects').select('id', { count: 'exact', head: true })),
    count(db.from('projects').select('id', { count: 'exact', head: true }).eq('status', 'active')),
  ])

  return NextResponse.json({ companies, users, projects, activeProjects })
}

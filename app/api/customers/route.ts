import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ customers: [] })

  const { data } = await db
    .from('projects')
    .select('id, name, status, address, start_date, type, client')
    .eq('gc_company_id', profile.company_id)
    .not('client', 'is', null)
    .neq('client', '')
    .order('created_at', { ascending: false })

  const projects = data ?? []

  const map = new Map<string, {
    client: string
    project_count: number
    statuses: string[]
    latest_project_date: string
    projects: { id: string; name: string; status: string; address: string; start_date: string; type: string }[]
  }>()

  for (const p of projects) {
    const key = p.client as string
    if (!map.has(key)) {
      map.set(key, {
        client: key,
        project_count: 0,
        statuses: [],
        latest_project_date: p.start_date ?? '',
        projects: [],
      })
    }
    const entry = map.get(key)!
    entry.project_count += 1
    if (p.status && !entry.statuses.includes(p.status)) entry.statuses.push(p.status)
    entry.projects.push({ id: p.id, name: p.name, status: p.status, address: p.address ?? '', start_date: p.start_date ?? '', type: p.type })
    if ((p.start_date ?? '') > entry.latest_project_date) entry.latest_project_date = p.start_date ?? ''
  }

  const customers = Array.from(map.values()).sort((a, b) => b.project_count - a.project_count)

  return NextResponse.json({ customers })
}

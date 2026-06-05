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

// GET - fetch bid packages + bids for a project
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const [{ data: packages }, { data: bids }] = await Promise.all([
    db.from('bid_packages')
      .select('*, bid_invitations(count), bids(count)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db.from('bids')
      .select('*, bid_packages!inner(project_id, scope), companies(name)')
      .eq('bid_packages.project_id', params.id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ packages: packages ?? [], bids: bids ?? [] })
}

// POST - create a new bid package
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scope, description, due_date } = await request.json()

  if (!scope || !description) {
    return NextResponse.json({ error: 'Scope and description are required' }, { status: 400 })
  }

  const { data, error } = await admin()
    .from('bid_packages')
    .insert({ project_id: params.id, scope, description, due_date: due_date || null, status: 'open' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ package: data })
}

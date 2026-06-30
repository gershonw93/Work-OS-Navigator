import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ awarded: [], own: [] })

  // Awarded jobs: subcontracts for this company
  const { data: subcontracts } = await db
    .from('subcontracts')
    .select('*, projects(id, name, address, type, status, start_date)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })

  // Own jobs: projects created by this company (not through bidding)
  const { data: ownProjects } = await db
    .from('projects')
    .select('id, name, address, type, status, start_date, customer_id, customers(name)')
    .eq('created_by_company_id', profile.company_id)
    .order('created_at', { ascending: false })

  return NextResponse.json({
    awarded: subcontracts ?? [],
    own: ownProjects ?? [],
    company_id: profile.company_id,
  })
}

export async function POST(request: Request) {
  // Sub creates their own private project
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })

  const body = await request.json()
  const { name, address, type, start_date, description, customer_id } = body
  if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

  const { data: project, error } = await db.from('projects').insert({
    name,
    address: address || null,
    type: type || 'other',
    start_date: start_date || null,
    description: description || null,
    customer_id: customer_id || null,
    status: 'planning', // Quote / Pending until the quote is approved & converted
    gc_company_id: profile.company_id,
    created_by_company_id: profile.company_id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project })
}

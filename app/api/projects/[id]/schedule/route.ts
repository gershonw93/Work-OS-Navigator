import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: items } = await db
    .from('schedule_items')
    .select('*, subcontracts(scope, trade, companies(name))')
    .eq('project_id', params.id)
    .order('start_date', { ascending: true })

  const { data: project } = await db
    .from('projects')
    .select('start_date, end_date')
    .eq('id', params.id)
    .single()

  return NextResponse.json({ items: items ?? [], project })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { label, start_date, end_date, color } = await request.json()
  if (!label || !start_date || !end_date) {
    return NextResponse.json({ error: 'label, start_date, and end_date are required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('schedule_items')
    .insert({ project_id: params.id, label, start_date, end_date, color: color ?? null, subcontract_id: null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

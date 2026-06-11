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

  const { data: inspections, error } = await db
    .from('inspections')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspections: inspections ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    inspection_type,
    trade,
    status,
    scheduled_date,
    inspector_name,
    inspector_phone,
    scheduling_phone,
    notes,
  } = body

  const { data: inspection, error } = await db
    .from('inspections')
    .insert({
      project_id: params.id,
      inspection_type: inspection_type ?? null,
      trade: trade ?? null,
      status: status ?? 'scheduled',
      scheduled_date: scheduled_date ?? null,
      inspector_name: inspector_name ?? null,
      inspector_phone: inspector_phone ?? null,
      scheduling_phone: scheduling_phone ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inspection }, { status: 201 })
}

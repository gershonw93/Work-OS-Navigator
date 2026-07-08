import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, address, client, type, status, start_date, end_date, customer_id, lat, lng } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (address !== undefined) updates.address = address
  if (lat !== undefined && lng !== undefined && lat != null && lng != null) { updates.lat = lat; updates.lng = lng; updates.geocoded_address = address }
  if (client !== undefined) updates.client = client
  if (type !== undefined) updates.type = type
  if (status !== undefined) updates.status = status
  if (start_date !== undefined) updates.start_date = start_date
  if (end_date !== undefined) updates.end_date = end_date
  if (customer_id !== undefined) updates.customer_id = customer_id || null

  const { data, error } = await db
    .from('projects')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ project: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('projects').delete().eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}

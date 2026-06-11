import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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

  const { data: changeOrders, error } = await db
    .from('change_orders')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ changeOrders: changeOrders ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  const {
    title,
    description,
    amount,
    reason,
    requested_by_type,
    subcontract_id,
  } = body

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { data: changeOrder, error } = await db
    .from('change_orders')
    .insert({
      project_id: params.id,
      title,
      description: description || null,
      amount: amount ?? 0,
      reason: reason || null,
      requested_by_type: requested_by_type ?? 'gc',
      subcontract_id: subcontract_id || null,
      status: 'pending',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'change_order_created',
    `Change order created: ${title}`,
    { change_order_id: changeOrder.id, title, amount, requested_by_type },
  )

  return NextResponse.json({ changeOrder }, { status: 201 })
}

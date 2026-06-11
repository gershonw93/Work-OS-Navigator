import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; coId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const body = await request.json()
  const { status, review_notes } = body

  const updates: Record<string, any> = {}
  if (status !== undefined) updates.status = status
  if (review_notes !== undefined) updates.review_notes = review_notes

  const { data: changeOrder, error } = await db
    .from('change_orders')
    .update(updates)
    .eq('id', params.coId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  const message = status
    ? `Change order "${changeOrder.title}" marked ${status}`
    : `Change order "${changeOrder.title}" notes updated`

  await logActivity(db, params.id, actorName, 'change_order_updated', message, {
    change_order_id: changeOrder.id,
    status,
  })

  return NextResponse.json({ changeOrder })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; coId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('change_orders')
    .delete()
    .eq('id', params.coId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

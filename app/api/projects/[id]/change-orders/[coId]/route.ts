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

  // Load the current CO so we can fold/unfold its amount into the linked sub.
  const { data: existing } = await db
    .from('change_orders').select('*').eq('id', params.coId).eq('project_id', params.id).single()
  if (!existing) return NextResponse.json({ error: 'Change order not found' }, { status: 404 })

  const updates: Record<string, any> = {}
  if (status !== undefined) updates.status = status
  if (review_notes !== undefined) updates.review_notes = review_notes

  // When a change order is tied to a subcontract, approving it adds its amount
  // to that subcontract's contract_amount; un-approving removes it. The
  // applied_to_contract flag guarantees this happens exactly once.
  const newStatus = status !== undefined ? status : existing.status
  if (existing.subcontract_id) {
    const isApplied = !!existing.applied_to_contract
    const shouldApply = newStatus === 'approved'
    if (shouldApply !== isApplied) {
      const { data: sub } = await db.from('subcontracts').select('contract_amount').eq('id', existing.subcontract_id).single()
      if (sub) {
        const delta = shouldApply ? Number(existing.amount || 0) : -Number(existing.amount || 0)
        await db.from('subcontracts').update({ contract_amount: Number(sub.contract_amount || 0) + delta }).eq('id', existing.subcontract_id)
        updates.applied_to_contract = shouldApply
      }
    }
  }

  let { data: changeOrder, error } = await db
    .from('change_orders')
    .update(updates)
    .eq('id', params.coId)
    .eq('project_id', params.id)
    .select()
    .single()

  // Older DBs without the applied_to_contract column: retry without the flag.
  if (error && (error as any).code === '42703') {
    delete updates.applied_to_contract
    const retry = await db.from('change_orders').update(updates).eq('id', params.coId).eq('project_id', params.id).select().single()
    changeOrder = retry.data; error = retry.error
  }

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

  // If this CO had been folded into a subcontract, pull its amount back out first.
  const { data: existing } = await db
    .from('change_orders').select('subcontract_id, amount, applied_to_contract').eq('id', params.coId).eq('project_id', params.id).single()
  if (existing?.applied_to_contract && existing.subcontract_id) {
    const { data: sub } = await db.from('subcontracts').select('contract_amount').eq('id', existing.subcontract_id).single()
    if (sub) await db.from('subcontracts').update({ contract_amount: Number(sub.contract_amount || 0) - Number(existing.amount || 0) }).eq('id', existing.subcontract_id)
  }

  const { error } = await db
    .from('change_orders')
    .delete()
    .eq('id', params.coId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

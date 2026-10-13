import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { updateChangeOrder } from '@/lib/writes/change-order'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; coId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'change-orders', 'edit')
  if (denied(gate)) return gate.denied
  // THE GC'S MONEY. Approving folds the amount into the subcontract's contract,
  // and a sub's admin holds `change-orders: edit` at their own company - so
  // without this a sub on the job could approve a change to their own contract.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json()
  // Everything after the gate is `updateChangeOrder`, which Claude's MCP server
  // calls too (with notes and the budget line only - never the status).
  // `if (budget_line_item_id !== undefined) updates.budget_line_item_id` lives there.
  const result = await updateChangeOrder(db, { userId: gate.actor.userId, projectId: params.id, coId: params.coId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; coId: string } },
) {
  const gate = await requirePermission(admin(), request, 'change-orders', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(admin(), gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

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

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { updateSubcontract } from '@/lib/writes/subcontract'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  const gate = await requirePermission(admin(), request, 'team', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // Everything after the gate is `updateSubcontract`, which Claude's MCP server can call too.
  const result = await updateSubcontract(db, { userId: user.id, projectId: params.id, subId: params.subId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; subId: string } }
) {
  const gate = await requirePermission(admin(), request, 'team', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Clean up dependent rows first (best-effort), then the subcontract
  await db.from('payment_schedule_items').delete().eq('subcontract_id', params.subId)
  await db.from('schedule_items').delete().eq('subcontract_id', params.subId)

  const { error } = await db.from('subcontracts').delete().eq('id', params.subId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

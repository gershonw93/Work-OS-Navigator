import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { removePermitItem, setPermitItemDone } from '@/lib/writes/permit-round'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type P = { params: { id: string; permitId: string; itemId: string } }

// Ticking an item off (or back on). Only `done` is read from the body.
export async function PATCH(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({} as any))
  if (typeof body?.done !== 'boolean') {
    return NextResponse.json({ error: 'Say whether it is done.' }, { status: 400 })
  }
  const result = await setPermitItemDone(db, {
    userId: gate.actor.userId, projectId: params.id, permitId: params.permitId, itemId: params.itemId, done: body.done,
  })
  return NextResponse.json(result.body, { status: result.status })
}

// Taking off an item typed by mistake.
export async function DELETE(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const result = await removePermitItem(db, { projectId: params.id, permitId: params.permitId, itemId: params.itemId })
  return NextResponse.json(result.body, { status: result.status })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { checkInEquipment, checkOutEquipment } from '@/lib/writes/equipment-assignment'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Each handler used to ask only "is somebody signed in". Reading the history
// asks `equipment: view`; taking a tool out and bringing it back both ask
// `create` - the worker who takes the saw is the worker who returns it, and the
// repair route already reads a worker's `create` as "can take one out".

// Assignment history for one piece of equipment (most recent first).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: equipment } = await db.from('equipment').select('id').eq('id', params.id).eq('company_id', companyId).single()
  if (!equipment) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Checkouts AND everything else that happened to it - reported broken,
  // fixed, sent away, retired - so the history answers "when did this break,
  // and who said so" as well as "who had it".
  const [{ data: history, error: hErr }, { data: events, error: eErr }] = await Promise.all([
    db.from('equipment_assignments')
      .select('*, projects(name)')
      .eq('equipment_id', params.id)
      .order('checked_out_at', { ascending: false }),
    db.from('equipment_events')
      .select('id, kind, note, actor_name, created_at')
      .eq('equipment_id', params.id)
      .order('created_at', { ascending: false }),
  ])
  // A refused read is not an empty history.
  if (hErr || eErr) {
    console.error('[equipment/history] read failed', { id: params.id, error: (hErr ?? eErr)?.message })
    return NextResponse.json({ error: 'Could not load the history.' }, { status: 500 })
  }

  return NextResponse.json({ history: history ?? [], events: events ?? [] })
}

// Check OUT: create an open assignment and flip the equipment to checked_out.
// Closes any pre-existing open assignment first so an item is never in two hands.
// The body lives in lib/writes/equipment-assignment.ts, shared with Claude.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'create')
  if (denied(gate)) return gate.denied
  const { actor } = gate
  if (!actor.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const result = await checkOutEquipment(db, { userId: actor.userId, companyId: actor.companyId, equipmentId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

// Check IN: close the open assignment and flip the equipment back to available.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', 'create')
  if (denied(gate)) return gate.denied
  const { actor } = gate
  if (!actor.companyId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as any))
  const result = await checkInEquipment(db, { userId: actor.userId, companyId: actor.companyId, equipmentId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import type { RepairAction } from '@/lib/equipment-state'
import { REPAIR_ACTIONS, equipmentRepairMove } from '@/lib/writes/equipment-repair'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Everything that happens to a tool that is not a checkout: it is reported
 * broken, sent away to be fixed, fixed, retired, or brought back.
 *
 * REPORTING IS NOT DECIDING. Saying a tool is broken is something anybody who
 * can take one out can do - a worker holds `equipment: create`, and the worker
 * is who finds the bent blade. Taking it out of service, clearing the report
 * and retiring it are the office's call, so they ask `edit`.
 *
 * The body lives in lib/writes/equipment-repair.ts, shared with Claude.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({} as any))
  const action = body.action as RepairAction
  if (!REPAIR_ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', action === 'flag' ? 'create' : 'edit')
  if (denied(gate)) return gate.denied
  const { actor } = gate

  const result = await equipmentRepairMove(db, {
    userId: actor.userId, companyId: actor.companyId ?? '', equipmentId: params.id, action, body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

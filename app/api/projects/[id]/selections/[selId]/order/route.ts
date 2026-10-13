import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { orderSelection } from '@/lib/writes/selection'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Place the order for a selection that's been chosen. The body is
 * `orderSelection` in `lib/writes/selection.ts`, shared with the MCP server:
 * it books a material purchase against the budget line and moves the row to
 * Ordered. It contacts nobody.
 *
 * Used to ask only "is somebody signed in", which let any account book a cost
 * onto any job's budget. `selections: edit`, and the job is the caller's
 * company's.
 */
export async function POST(request: Request, { params }: { params: { id: string; selId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'selections', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({} as any))
  const result = await orderSelection(db, { userId: gate.actor.userId, projectId: params.id, selId: params.selId, body })
  return NextResponse.json(result.body, { status: result.status })
}

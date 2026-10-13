import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { previewScheduleMove, applyScheduleMove } from '@/lib/writes/schedule-move'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The gate is here; what moves, who is told and what is written down live in
// `lib/writes/schedule-move.ts`, the one home for moving a line's dates.

/**
 * The review screen's data. Changes NOTHING.
 *
 * A preview that wrote would make "Shift silently" and "Cancel" the same
 * button, which is the kind of thing nobody notices until a sub gets an email
 * about dates that were never saved.
 */
export async function POST(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const result = await previewScheduleMove(admin(), {
    userId: gate.actor.userId, projectId: params.id, itemId: params.itemId, body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

/**
 * Apply the move, and tell the subs only if asked. `notify` is REQUIRED in the
 * body and has no default - the shared function refuses a body that does not
 * say.
 */
export async function PUT(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const result = await applyScheduleMove(admin(), {
    userId: gate.actor.userId, projectId: params.id, itemId: params.itemId, body,
  })
  return NextResponse.json(result.body, { status: result.status })
}

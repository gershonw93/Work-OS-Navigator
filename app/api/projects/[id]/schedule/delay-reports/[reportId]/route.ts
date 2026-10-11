import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { decideDelayReport } from '@/lib/delay-report-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Turn a sub's delay report down. Nothing on the schedule changes - nothing
 * had - and the sub is told, because a report nobody answers leaves them
 * guessing which dates to work to.
 *
 * Applying is NOT here: it happens as part of recording the delay through the
 * cascade PUT, which is the one writer of dates. A second "apply" door would
 * be a second spelling of the cascade.
 */
export async function PATCH(request: Request, { params }: { params: { id: string; reportId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({} as any))
  if (body?.action !== 'dismiss') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const { decided } = await decideDelayReport({
    db, projectId: params.id, reportId: params.reportId,
    decision: 'dismissed', decidedBy: gate.actor.userId,
  })
  if (!decided) return NextResponse.json({ error: 'That report has already been dealt with.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Delays subs have reported on this job and the GC has not decided yet.
 *
 * The GC's half, so it asks the GC's questions: the schedule permission, and
 * whose job it is - a sub on the job holds `schedule: view` too and must not
 * read what the other trades have reported.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'schedule', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data, error } = await db
    .from('schedule_delay_reports')
    .select('id, schedule_item_id, days, reason, reported_by_name, created_at, companies ( name )')
    .eq('project_id', params.id)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  // A refused read is not "nobody has reported anything".
  if (error) {
    console.error('[delay-reports] read failed', { project: params.id, error: error.message })
    return NextResponse.json({ error: 'Could not load the reported delays.' }, { status: 500 })
  }
  return NextResponse.json({ reports: data ?? [] })
}

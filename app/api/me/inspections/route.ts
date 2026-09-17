import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { myJobs } from '@/lib/my-jobs'
import { todayDateInput } from '@/lib/dates'
import { inspectionCountdown, bySoonest, isVoid, isInspectionStatus } from '@/lib/inspection-status'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * THE INSPECTIONS A FIELD WORKER CAN SAY ARE READY.
 *
 * WHY THIS EXISTS. `mark-ready` was split out of `inspections` precisely so the
 * crew could report that the work is finished without being handed the office
 * tab - and every field role was granted it. But the only button that writes
 * those two columns lived on the project Inspections page, which is gated on
 * `inspections`, which those same roles are denied. So the permission was
 * granted to people who could not act on it ANYWHERE in the app, and unlike the
 * six tabs this shipped alongside there was no URL to discover that with:
 * `mark-ready` has no slug, because it was never a screen.
 *
 * It is also the audience of the 7:30am "nobody has marked this ready" email,
 * which named a field supervisor and a worker deliberately - the only people
 * who can honestly answer it. A reminder whose call to action has no control is
 * a nag that cannot be satisfied.
 *
 * Gated on `mark-ready` rather than `inspections`: this route carries the type,
 * the date and whether somebody has already said so - what you need to answer
 * the question - and nothing about booking, inspectors or results.
 */
const COLS = 'id, project_id, type, trade, status, scheduled_date, ready_marked_by, ready_marked_at'

export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'mark-ready', 'view')
  if (denied(gate)) return gate.denied

  const { data: profile } = await db
    .from('profiles').select('email, full_name').eq('id', gate.actor.userId).single()

  const { projectIds } = await myJobs(db, gate.actor.userId, profile)
  if (!projectIds.length) return NextResponse.json({ inspections: [] })

  const { data, error } = await db
    .from('inspections')
    .select(COLS)
    .in('project_id', projectIds)
    .not('scheduled_date', 'is', null)

  // A refused query and an empty one are both `[]` to a caller, and on this
  // screen "nothing to mark ready" is the happy answer - so a mistyped column
  // would read as "you are all caught up" for ever. Keep the error.
  if (error) {
    console.error('[me/inspections] read failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  const names = new Map<string, string>()
  const { data: projects } = await db.from('projects').select('id, name').in('id', projectIds)
  for (const p of (projects ?? []) as any[]) names.set(p.id, p.name)

  const today = todayDateInput()
  const rows = ((data ?? []) as any[])
    // A visit that has been and gone, or one that was voided, is not work
    // anybody can still declare ready.
    .filter(i => isInspectionStatus(i.status) && !isVoid(i.status))
    .filter(i => !i.ready_marked_by)
    .map(i => ({
      ...i,
      project_name: names.get(i.project_id) ?? '',
      // The SAME rule the 7:30am email fires on, so a row cannot look calm
      // here while the reminder is going out about it.
      countdown: inspectionCountdown(i, today),
    }))
    .filter(i => i.countdown !== null)

  // `bySoonest` is a COMPARATOR, not a sorter - soonest first, undated last.
  return NextResponse.json({ inspections: rows.sort(bySoonest) })
}

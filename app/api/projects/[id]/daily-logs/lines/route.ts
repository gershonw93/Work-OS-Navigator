import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { isDelivery, scheduleLabel, type ScheduleItemRow } from '@/lib/schedule-events'
import { dateWords } from '@/lib/dates'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * THE SCHEDULE LINES A DELAY ROW CAN NAME, for the daily-log form's picker.
 *
 * GATED ON `daily-logs: view`, WHICH IS THE PAGE'S OWN GATE - never on
 * `schedule`. This is the Invoices bug exactly: that page is gated on
 * `invoices` and loaded its subcontractor picker from `/financials`, a resource
 * a Project Manager is DELIBERATELY denied, so a PM opened a form they are
 * entitled to use with a picker holding nothing and nothing errored. Here it
 * would be worse, because the people who file daily logs are precisely the ones
 * without schedule rights:
 *
 *   field_supervisor  daily-logs VCE   schedule V
 *   worker            daily-logs VC    schedule NONE
 *   member            daily-logs V     schedule V
 *
 * A `worker` holds NO schedule permission at all, so pointing the picker at
 * `/api/projects/[id]/schedule` would 403 the one person who actually watched
 * the delivery not arrive. The fix is to move the data onto the route this
 * page's gate already covers, never to widen the role - widening hands them the
 * screen the split exists to withhold.
 *
 * READ-ONLY and deliberately thin: an id, a name and a date range. Naming a
 * line in a log is not a claim on the schedule, and this route cannot write
 * one.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'daily-logs', 'view')
  if (denied(gate)) return gate.denied

  const { data, error } = await db
    .from('schedule_items')
    .select('id, label, start_date, end_date, color, subcontract_id, trade, subcontracts(scope, trade, companies(name, type))')
    .eq('project_id', params.id)
    .order('start_date', { ascending: true })

  // KEEP THE ERROR. A refused query returns null, the `?? []` swallows it, and
  // an empty picker reads as "this job has no schedule" rather than as a
  // failure - the `.order()` bug on the payment schedule, one table over.
  if (error) {
    console.error('[daily-logs/lines] read failed', error)
    return NextResponse.json({ error: 'Could not load the schedule lines.' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as ScheduleItemRow[]
  const lines = rows.map(row => ({
    id: row.id,
    name: scheduleLabel(row),
    isDelivery: isDelivery(row),
    // Printed under the option so two lines of one trade can be told apart.
    // `dateWords`, never toLocaleDateString - and the WEEKDAY is how a day gets
    // checked against what somebody remembers of it.
    when: dateWords(row.start_date)?.withWeekday ?? null,
  }))

  // DELIVERIES FIRST - the commonest thing a logged delay is about, and the
  // question that produced this whole feature. Everything else keeps its date
  // order behind them.
  return NextResponse.json({
    lines: [...lines.filter(l => l.isDelivery), ...lines.filter(l => !l.isDelivery)],
  })
}

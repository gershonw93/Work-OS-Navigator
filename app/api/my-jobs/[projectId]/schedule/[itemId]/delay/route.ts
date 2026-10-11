import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { missingDelay, delayDays } from '@/lib/schedule-delay'
import { lineName } from '@/lib/schedule-dependencies'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A sub reports that their own trade is running late.
 *
 * MOVES NOTHING. A delay pushes the trades linked after it and emails them,
 * and that is the GC's decision - "a cascade is arithmetic; telling somebody
 * is a decision". So this records the report and tells the GC, who opens the
 * same delay screen every other delay goes through, pre-filled with what the
 * sub said, and applies or dismisses it there.
 *
 * ONLY THEIR OWN LINES. The gate is the subcontract: the line has to belong to
 * a subcontract this company holds on this job. Not a permission - the vendor
 * role holds `schedule: view` and must not hold `edit`, which would let it
 * move anybody's dates through the GC's own routes. The ability here is
 * narrower than any resource, and the subcontract is what defines it.
 *
 * The SAME rule as the GC's delay dialog (`missingDelay`), so a sub cannot
 * report a reasonless or zero-day delay that the GC's screen would refuse.
 */
export async function POST(request: Request, { params }: { params: { projectId: string; itemId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, full_name').eq('id', user.id).maybeSingle()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const body = await request.json().catch(() => ({} as any))
  const problem = missingDelay({ days: body?.days, reason: body?.reason })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const days = delayDays(body.days)!
  const reason = String(body.reason).trim()

  const { data: line } = await db
    .from('schedule_items')
    .select('id, project_id, trade, label, start_date, end_date, subcontract_id, subcontracts ( company_id, scope, trade, companies ( name ) )')
    .eq('id', params.itemId)
    .eq('project_id', params.projectId)
    .maybeSingle()
  if (!line) return NextResponse.json({ error: 'That line is not on this job any more.' }, { status: 404 })
  if ((line as any).subcontracts?.company_id !== profile.company_id) {
    return NextResponse.json({ error: 'You can only report a delay on your own work.' }, { status: 403 })
  }

  // A second report while the first is still waiting is a correction to it:
  // the GC should see one number, the latest, not two to choose between.
  await db.from('schedule_delay_reports')
    .delete()
    .eq('schedule_item_id', line.id)
    .eq('status', 'pending')

  const reporter = profile.full_name || user.email || null
  const { data: report, error } = await db
    .from('schedule_delay_reports')
    .insert({
      project_id: params.projectId,
      schedule_item_id: line.id,
      company_id: profile.company_id,
      days, reason,
      reported_by: user.id,
      reported_by_name: reporter,
    })
    .select('id, schedule_item_id, days, reason, status, created_at')
    .single()
  if (error || !report) {
    console.error('[my-jobs/delay] insert failed', { line: line.id, error: error?.message })
    return NextResponse.json({ error: 'Could not send that. Try again.' }, { status: 500 })
  }

  // The report is the work; telling the GC never fails it.
  const { data: project } = await db.from('projects').select('name, gc_company_id').eq('id', params.projectId).maybeSingle()
  const company = (line as any).subcontracts?.companies?.name || reporter || 'A sub'
  const what = lineName(line as any)
  const team = await audienceFor({ db, companyId: (project as any)?.gc_company_id, type: 'schedule_delay_reported' })
  await notify({
    db,
    userIds: team,
    type: 'schedule_delay_reported',
    title: `${company} reported a delay`,
    message: `${what}${(project as any)?.name ? ` on ${(project as any).name}` : ''}, ${days} day${days === 1 ? '' : 's'}: "${reason}". Nothing has moved yet - review it to see what would.`,
    link: `/projects/${params.projectId}/schedule?delay_report=${report.id}`,
  })

  return NextResponse.json({ report })
}

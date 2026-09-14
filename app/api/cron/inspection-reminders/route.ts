import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'
import { needsReadyReminder, addDaysIso, READY_REMINDER_DAYS } from '@/lib/inspection-status'
import { formatDate, todayDateInput } from '@/lib/dates'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The inspection that is coming and is not ready.
//
// "If the inspection date is approaching and it's not ready, who gets
// notified?" Nobody - this job did not exist. The only scheduled work in the
// app was compliance reminders, so a visit booked for Friday with nobody having
// marked the work ready stayed silent until the inspector arrived.
//
// Two days out, once per booking, and never once somebody says it is ready.
// `needsReadyReminder` holds that rule so this and the tests ask one function.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // Auth FIRST, before a single read. Vercel sends CRON_SECRET as a bearer on
  // every scheduled run once the variable is set, so the bearer check is the
  // whole check - see lib/cron-auth.ts for why `secret &&` let anyone run it.
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const today = todayDateInput()
  const horizon = addDaysIso(today, READY_REMINDER_DAYS)

  // Narrowed in SQL to the window, then decided in one place by the shared
  // rule - the query is an optimisation, `needsReadyReminder` is the answer.
  const { data: rows, error } = await db
    .from('inspections')
    .select('id, project_id, type, trade, status, scheduled_date, scheduled_time, ready_marked_by, ready_reminder_sent_at, requested_by_id, scheduler_profile_id')
    .not('scheduled_date', 'is', null)
    .gte('scheduled_date', today)
    .lte('scheduled_date', horizon)
    .is('ready_marked_by', null)
    .is('ready_reminder_sent_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const due = (rows ?? []).filter(r => needsReadyReminder(r as any, today))

  let notified = 0
  for (const insp of due) {
    const { data: proj } = await db
      .from('projects').select('name, gc_company_id').eq('id', insp.project_id).single()

    // The company that owns the JOB decides who hears about it, through the
    // same Settings -> Notifications -> Who gets told table every other event
    // uses. Plus the two people whose part in this inspection is structural -
    // whoever asked for it and whoever is booking it - which is not a setting
    // and must not become one.
    const recipients = withStructural(
      await audienceFor({
        db, companyId: (proj as any)?.gc_company_id, type: 'inspection_not_ready',
      }),
      [(insp as any).requested_by_id, (insp as any).scheduler_profile_id],
    )

    if (recipients.length) {
      const label = [insp.type, insp.trade].filter(Boolean).join(' · ') || 'Inspection'
      const at = proj?.name ? ` at ${proj.name}` : ''
      const when = `${formatDate(insp.scheduled_date)}${insp.scheduled_time ? ` ${insp.scheduled_time}` : ''}`
      await notify({
        db, userIds: recipients, type: 'inspection_not_ready',
        title: 'Inspection not marked ready',
        message: `${label}${at} is booked for ${when} and nobody has marked the work ready. Finish it, or ring the jurisdiction to move the trip.`,
        link: `/projects/${insp.project_id}/inspections?inspection=${insp.id}`,
      })
      notified += recipients.length
    }

    // Stamped whether or not anybody was listening: a company that has routed
    // this to nobody has chosen that, and re-running the job tomorrow must not
    // keep retrying it.
    await db.from('inspections')
      .update({ ready_reminder_sent_at: new Date().toISOString() })
      .eq('id', insp.id)
  }

  return NextResponse.json({ ok: true, inspections_processed: due.length, notifications: notified })
}

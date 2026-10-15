import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'
import { todayDateInput, dayWords } from '@/lib/dates'
import { appOrigin } from '@/lib/app-url'
import { weeklySummaryEmail } from '@/lib/email'
import { summarizeWeek, weekEnding, isEmptyWeek, type SummaryInput } from '@/lib/weekly-summary'
import { lineProgress } from '@/lib/schedule-dependencies'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The Friday summary. One letter per company, to whoever the company routes
// `weekly_summary` to (Settings -> Notifications -> Who gets told), counted by
// lib/weekly-summary.ts.
//
// THE GATE IS WRITTEN BEFORE THE SEND (`weekly_summary_sends`, unique per
// company per week): an overlapping run gets 23505 and moves on, rather than
// sending the whole company the same summary twice.
//
// A READ THAT FAILED IS NOT AN EMPTY WEEK. If any of a company's reads errors,
// that company gets nothing this Friday and the reason is logged - "0 tasks
// done" printed over a query PostgREST refused is a lie told to the boss.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const week = weekEnding(todayDateInput())
  const weekLabel = `${dayWords(week.start, { weekday: true }) ?? week.start} - ${dayWords(week.end, { weekday: true }) ?? week.end}`

  // Running jobs only. A development (`is_site`) is a folder holding the houses,
  // which are the jobs; counting it as well would list it as "quiet" every week.
  const { data: projects, error: pErr } = await db.from('projects')
    .select('id, name, gc_company_id, is_site')
    .eq('status', 'active')
  if (pErr) {
    console.error('[weekly-summary] reading projects failed', pErr)
    return NextResponse.json({ error: pErr.message }, { status: 500 })
  }

  const byCompany = new Map<string, { id: string; name: string }[]>()
  for (const p of (projects ?? []) as any[]) {
    if (!p.gc_company_id || p.is_site) continue
    byCompany.set(p.gc_company_id, [...(byCompany.get(p.gc_company_id) ?? []), { id: p.id, name: p.name }])
  }

  const report: Record<string, string> = {}
  for (const [companyId, jobs] of Array.from(byCompany.entries())) {
    const ids = jobs.map(j => j.id)
    const startTs = `${week.start}T00:00:00Z`
    const [tasks, logs, insp, rfis, sels, delays, lines, budget, company] = await Promise.all([
      db.from('project_tasks').select('project_id, status, completed_at, due_date').in('project_id', ids),
      db.from('daily_logs').select('project_id, log_date').in('project_id', ids).gte('log_date', week.start),
      db.from('inspections').select('project_id, status, completed_date').in('project_id', ids).gte('completed_date', week.start),
      db.from('rfis').select('project_id, responded_at').in('project_id', ids).gte('responded_at', startTs),
      db.from('project_selections').select('project_id, status, selected_at, needed_by').in('project_id', ids),
      db.from('schedule_delay_reports').select('project_id, days, reason, created_at, reported_by_name').in('project_id', ids).gte('created_at', startTs),
      db.from('schedule_items').select('id, project_id, subcontract_id, label, trade, start_date, end_date, progress_pct').in('project_id', ids),
      db.from('budget_line_items').select('subcontract_id, progress_pct, budgeted_amount').in('project_id', ids),
      db.from('companies').select('name').eq('id', companyId).maybeSingle(),
    ])
    const failed = [tasks, logs, insp, rfis, sels, delays, lines, budget].find(r => r.error)
    if (failed) {
      console.error('[weekly-summary] a read failed, skipping company', companyId, failed.error)
      report[companyId] = 'read_failed'
      continue
    }

    const budgetRows = (budget.data ?? []) as any[]
    const input: SummaryInput = {
      week,
      projects: jobs,
      tasks: (tasks.data ?? []) as any[],
      dailyLogs: (logs.data ?? []) as any[],
      inspections: (insp.data ?? []) as any[],
      rfis: (rfis.data ?? []) as any[],
      selections: (sels.data ?? []) as any[],
      delayReports: (delays.data ?? []) as any[],
      // Progress by the schedule's own answer: typed, else the sub's budget roll-up.
      scheduleLines: ((lines.data ?? []) as any[]).map(l => ({
        project_id: l.project_id,
        label: l.label || l.trade || 'A schedule line',
        end_date: l.end_date,
        pct: lineProgress(l, budgetRows.filter(b => l.subcontract_id && b.subcontract_id === l.subcontract_id)).pct,
      })),
    }
    const summary = summarizeWeek(input)
    if (isEmptyWeek(summary)) { report[companyId] = 'nothing_to_say'; continue }

    const recipients = await audienceFor({ db, companyId, type: 'weekly_summary' })
    if (!recipients.length) { report[companyId] = 'no_recipients'; continue }

    // The gate, BEFORE the letters.
    const { error: gateErr } = await db.from('weekly_summary_sends')
      .insert({ company_id: companyId, week_ending: week.end, recipients: recipients.length })
    if (gateErr) {
      if ((gateErr as any).code !== '23505') console.error('[weekly-summary] gate write failed', companyId, gateErr)
      report[companyId] = (gateErr as any).code === '23505' ? 'already_sent' : 'gate_failed'
      continue
    }

    const t = summary.totals
    const origin = appOrigin()
    const result = await notify({
      db,
      userIds: recipients,
      type: 'weekly_summary',
      title: `Weekly summary: ${weekLabel}`,
      message: `${summary.moved.length} job${summary.moved.length === 1 ? '' : 's'} moved forward: ${t.tasksDone} tasks done, ${t.logs} daily logs, ${t.inspectionsPassed} inspections passed${t.delays ? `, ${t.delays} delay${t.delays === 1 ? '' : 's'} reported` : ''}.`,
      link: '/dashboard',
      email: p => weeklySummaryEmail({
        name: p.full_name,
        companyName: (company.data as any)?.name ?? null,
        weekLabel,
        summary,
        url: `${origin}/dashboard`,
        settingsUrl: `${origin}/settings?tab=notifications`,
      }),
    })
    await db.from('weekly_summary_sends').update({ emailed: result.emailed })
      .eq('company_id', companyId).eq('week_ending', week.end)
    report[companyId] = `sent:${result.inApp}/${result.emailed}`
  }

  return NextResponse.json({ week, companies: byCompany.size, report })
}

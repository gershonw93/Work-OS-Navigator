import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'
import { permitHistory } from '@/lib/permit-history'
import { daysBetween } from '@/lib/permit-rounds'
import {
  chaseCutoff, chaseMessage, EXPIRED_GRACE_DAYS, EXPIRY_WARN_DAYS, expiryDue, expiryMessage, roundToChase,
  type ChaseLine, type ReminderPermit,
} from '@/lib/permit-reminders'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PERMIT_COLS = 'id, project_id, permit_type, permit_number, status, issuing_authority, expiry_date, issued_date, created_at, expiry_reminder_for, expiry_reminder_stage, projects!inner ( name, gc_company_id )'

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/**
 * Every morning: permits to chase (one message per company, again each week
 * while unanswered) and issued permits about to expire or just expired (one
 * per permit, at each step). The rules are lib/permit-reminders.ts; this
 * reads, asks them, CLAIMS each reminder with one conditional update, and only
 * then notifies - two overlapping runs cannot both send.
 *
 * A READ THAT FAILED SENDS NOTHING. Half a history looks exactly like a permit
 * nobody has chased, and a wrong "chase this" goes to a whole office.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const today = new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()
  const cutoff = chaseCutoff(today)

  // Candidates: permits with a submission nobody has chased yet, and permits
  // whose expiry falls inside the window. The rules decide; these only narrow.
  const [open, expiring] = await Promise.all([
    db.from('permit_rounds').select('id, permit_id, chase_reminded_at').is('outcome', null)
      .or(`chase_reminded_at.is.null,chase_reminded_at.lt.${cutoff}`),
    db.from('permits').select(PERMIT_COLS).not('expiry_date', 'is', null)
      .gte('expiry_date', addDays(today, -EXPIRED_GRACE_DAYS)).lte('expiry_date', addDays(today, EXPIRY_WARN_DAYS)),
  ])
  if (open.error || expiring.error) {
    console.error('[permit-reminders] candidate read failed', open.error?.message, expiring.error?.message)
    return NextResponse.json({ error: 'Could not read permits. Nothing was sent.' }, { status: 500 })
  }

  const chaseIds = Array.from(new Set((open.data ?? []).map(r => r.permit_id as string)))
  const chasePermits = chaseIds.length
    ? await db.from('permits').select(PERMIT_COLS).in('id', chaseIds)
    : { data: [] as any[], error: null }
  if (chasePermits.error) {
    console.error('[permit-reminders] permits read failed', chasePermits.error.message)
    return NextResponse.json({ error: 'Could not read permits. Nothing was sent.' }, { status: 500 })
  }

  const all = new Map<string, any>()
  for (const p of [...(chasePermits.data ?? []), ...(expiring.data ?? [])]) all.set(p.id, p)
  const history = await permitHistory(db, Array.from(all.keys()))
  if (!history.ok) return NextResponse.json({ error: 'Could not read permit history. Nothing was sent.' }, { status: 500 })
  // When each candidate round was last chased; a round not among the
  // candidates was chased inside the week, so it reads as chased today.
  const lastChased = new Map((open.data ?? []).map(r => [r.id as string, (r.chase_reminded_at as string | null) ?? null]))

  // ── Chase: claim each round, then one message per company ──────────────────
  const chaseByCompany = new Map<string, { lines: ChaseLine[]; projectIds: string[]; permitIds: string[] }>()
  for (const p of chasePermits.data ?? []) {
    const rounds = history.rounds.filter(r => r.permit_id === p.id)
      .map(r => ({ ...r, chase_reminded_at: lastChased.has(r.id) ? lastChased.get(r.id)! : `${today}T00:00:00Z` }))
    const round = roundToChase(p as ReminderPermit, rounds, history.items.filter(i => i.permit_id === p.id), today)
    if (!round) continue
    const company = p.projects?.gc_company_id as string | null
    if (!company) continue
    const { data: claimed } = await db.from('permit_rounds').update({ chase_reminded_at: now })
      .eq('id', round.id).or(`chase_reminded_at.is.null,chase_reminded_at.lt.${cutoff}`).select('id')
    if (!claimed?.length) continue // another run has it
    const entry = chaseByCompany.get(company) ?? { lines: [], projectIds: [], permitIds: [] }
    entry.lines.push({ permitType: p.permit_type, job: p.projects?.name ?? 'the job', authority: p.issuing_authority, days: daysBetween(round.submitted_on, today) })
    entry.projectIds.push(p.project_id)
    entry.permitIds.push(p.id)
    chaseByCompany.set(company, entry)
  }
  let chased = 0
  for (const [companyId, { lines, projectIds, permitIds }] of Array.from(chaseByCompany)) {
    const people = await audienceFor({ db, companyId, type: 'permit_chase' })
    const { title, message } = chaseMessage(lines)
    // One permit: open it. Several: the first one's list, which leads with the overdue.
    const link = lines.length === 1 ? `/projects/${projectIds[0]}/permits?permit=${permitIds[0]}` : `/projects/${projectIds[0]}/permits`
    await notify({ db, userIds: people, type: 'permit_chase', title, message, link })
    chased += lines.length
  }

  // ── Expiry: claim the date, then one message per permit ───────────────────
  let expiries = 0
  for (const p of (expiring.data ?? []) as any[]) {
    const due = expiryDue(p as ReminderPermit, history.rounds.filter(r => r.permit_id === p.id), history.items.filter(i => i.permit_id === p.id), today)
    if (!due) continue
    const company = p.projects?.gc_company_id as string | null
    if (!company) continue
    // Claim THIS step for THIS date: a run that already sent it (or a later
    // step) matches nothing and sends nothing.
    const { data: claimed } = await db.from('permits').update({ expiry_reminder_for: p.expiry_date, expiry_reminder_stage: due.step })
      .eq('id', p.id)
      .or(`expiry_reminder_for.is.null,expiry_reminder_for.neq.${p.expiry_date},expiry_reminder_stage.is.null,expiry_reminder_stage.gt.${due.step}`)
      .select('id')
    if (!claimed?.length) continue
    const people = await audienceFor({ db, companyId: company, type: 'permit_expiring' })
    const { title, message } = expiryMessage({
      permitType: p.permit_type, permitNumber: p.permit_number, job: p.projects?.name ?? 'the job',
      expiry: p.expiry_date, days: due.days, authority: p.issuing_authority,
    })
    await notify({ db, userIds: people, type: 'permit_expiring', title, message, link: `/projects/${p.project_id}/permits?permit=${p.id}` })
    expiries++
  }

  return NextResponse.json({ ok: true, chased, companies: chaseByCompany.size, expiring: expiries })
}

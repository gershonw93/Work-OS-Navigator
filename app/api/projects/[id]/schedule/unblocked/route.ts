import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { sendEmail, scheduleUnblockedEmail, isEmailAddress } from '@/lib/email'
import { notify } from '@/lib/notify'
import { lineProgress, blockedBy, lineName, type ScheduleLine, type Dependency } from '@/lib/schedule-dependencies'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const LINE_COLS = 'id, trade, label, start_date, end_date, subcontract_id, dates_overridden_at, progress_pct'

/**
 * Every line with a progress gate, and whether it is still shut.
 *
 * Progress comes from `lineProgress`: a typed percent if somebody entered one,
 * otherwise the linked subcontract's budget lines weighted by amount, otherwise
 * UNKNOWN - which blocks, and says it is blocking because nobody has said
 * rather than because the work is early.
 */
async function gateStates(db: ReturnType<typeof admin>, projectId: string) {
  const [linesRes, depsRes] = await Promise.all([
    db.from('schedule_items').select(LINE_COLS).eq('project_id', projectId),
    db.from('schedule_dependencies').select('*').eq('project_id', projectId)
      .not('min_predecessor_progress', 'is', null),
  ])
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`)
  if (depsRes.error) throw new Error(`dependencies: ${depsRes.error.message}`)

  const lines = (linesRes.data ?? []) as unknown as ScheduleLine[]
  const deps = (depsRes.data ?? []) as unknown as Dependency[]
  const byId = new Map(lines.map(l => [l.id, l]))

  // Budget progress for the predecessors that have a subcontract, so the
  // fallback has something to roll up.
  const subIds = Array.from(new Set(
    deps.map(d => byId.get(d.predecessor_task_id)?.subcontract_id).filter((v): v is string => !!v),
  ))
  const budgetBySub = new Map<string, { progress_pct?: number | null; amount?: number | null }[]>()
  if (subIds.length) {
    const { data } = await db.from('budget_line_items')
      .select('subcontract_id, progress_pct, amount').in('subcontract_id', subIds)
    for (const row of (data ?? []) as any[]) {
      const list = budgetBySub.get(row.subcontract_id) ?? []
      list.push({ progress_pct: row.progress_pct, amount: row.amount })
      budgetBySub.set(row.subcontract_id, list)
    }
  }

  return deps.map(dep => {
    const task = byId.get(dep.task_id)
    const pred = byId.get(dep.predecessor_task_id)
    if (!task || !pred) return null
    const progress = lineProgress(pred, pred.subcontract_id ? budgetBySub.get(pred.subcontract_id) ?? [] : [])
    const verdict = blockedBy(dep, pred, progress)
    return {
      dependencyId: dep.id ?? null,
      taskId: task.id,
      taskName: lineName(task),
      taskStart: task.start_date,
      subcontractId: task.subcontract_id ?? null,
      predecessorId: pred.id,
      predecessorName: lineName(pred),
      need: dep.min_predecessor_progress ?? null,
      progress: progress.pct,
      progressSource: progress.source,
      blocked: verdict.blocked,
      unknown: verdict.unknown,
      reason: verdict.reason,
    }
  }).filter(Boolean) as any[]
}

/** The blocked/cleared picture. Changes nothing. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'view')
  if (denied(gate)) return gate.denied
  try {
    const gates = await gateStates(admin(), params.id)
    return NextResponse.json({ gates, cleared: gates.filter(g => !g.blocked) })
  } catch (e: any) {
    console.error('[schedule/unblocked] read failed:', e?.message)
    return NextResponse.json({ error: 'Could not work out what is blocked.' }, { status: 500 })
  }
}

/**
 * Tell the subs whose gate has cleared.
 *
 * Same rule as the cascade: the review screen comes first, so the caller names
 * exactly which lines to tell rather than the route deciding. `task_ids` is
 * required - "tell everybody who happens to be clear right now" would send a
 * fresh batch of emails every time somebody opened the page.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const taskIds: string[] = Array.isArray(body?.task_ids) ? body.task_ids : []
  if (!taskIds.length) {
    return NextResponse.json({ error: 'Pick which ones to tell.' }, { status: 400 })
  }

  const db = admin()
  let gates
  try { gates = await gateStates(db, params.id) }
  catch (e: any) {
    console.error('[schedule/unblocked] state read failed:', e?.message)
    return NextResponse.json({ error: 'Could not check what is clear. Nothing was sent.' }, { status: 500 })
  }

  // Only send for gates that are ACTUALLY clear right now, whatever the body
  // asked for - a stale review screen must not be able to tell somebody they
  // are free to start when the percent has since moved back.
  const toTell = gates.filter(g => taskIds.includes(g.taskId) && !g.blocked)
  if (!toTell.length) {
    return NextResponse.json({ sent: 0, skipped: taskIds.length, reason: 'none of those are clear any more' })
  }

  const project = await db.from('projects').select('name').eq('id', params.id).maybeSingle()
  const projectName = (project.data as any)?.name ?? null

  const subIds = Array.from(new Set(toTell.map(g => g.subcontractId).filter(Boolean)))
  const companyBySub = new Map<string, any>()
  if (subIds.length) {
    const { data } = await db.from('subcontracts')
      .select('id, company_id, companies(id, name, contact_email)').in('id', subIds)
    for (const s of (data ?? []) as any[]) companyBySub.set(s.id, s.companies)
  }

  const notices: any[] = []
  const toldUserIds: string[] = []
  let sent = 0

  for (const g of toTell) {
    const company = g.subcontractId ? companyBySub.get(g.subcontractId) : null
    const email = isEmailAddress(company?.contact_email) ? company.contact_email : null

    let sentAt: string | null = null
    let sendError: string | null = null

    if (email) {
      const mail = scheduleUnblockedEmail({
        vendorName: company?.name,
        projectName,
        trade: g.taskName,
        predecessorTrade: g.predecessorName,
        startDate: g.taskStart,
      })
      const res = await sendEmail({ to: email, ...mail })
      if (res.sent) { sentAt = new Date().toISOString(); sent++ }
      else {
        sendError = res.detail ? `${res.reason}: ${res.detail}` : res.reason
        console.error(`[schedule/unblocked] email to ${email} failed: ${sendError}`)
      }
    } else {
      sendError = 'no email address on file'
    }

    notices.push({
      project_id: params.id,
      schedule_item_id: g.taskId,
      company_id: company?.id ?? null,
      sent_to: email ?? (company?.name ?? 'no vendor'),
      kind: 'unblocked',
      new_start: g.taskStart,
      reason: `${g.predecessorName} reached ${g.need}%`,
      sent_at: sentAt,
      send_error: sendError,
      sent_by: gate.actor.userId,
    })

    if (company?.id) {
      const { data: people } = await db.from('profiles').select('id').eq('company_id', company.id)
      for (const p of (people ?? []) as any[]) toldUserIds.push(p.id)
    }
  }

  if (notices.length) {
    const { error } = await db.from('schedule_shift_notices').insert(notices)
    if (error) console.error('[schedule/unblocked] could not log the notices:', error.message)
  }

  if (toldUserIds.length) {
    await notify({
      db,
      type: 'schedule_unblocked',
      userIds: toldUserIds,
      title: "You're clear to start",
      message: projectName ? `The trade ahead of you on ${projectName} is far enough along.` : 'The trade ahead of you is far enough along.',
      link: `/projects/${params.id}/schedule`,
      inAppOnly: true,
    })
  }

  return NextResponse.json({ sent, told: toTell.length })
}

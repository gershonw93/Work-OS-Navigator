import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { sendEmail, scheduleShiftEmail, isEmailAddress, type ShiftedLine } from '@/lib/email'
import { notify } from '@/lib/notify'
import {
  cascade, lineName, isDateString,
  type Move, type ScheduleLine, type Dependency,
} from '@/lib/schedule-dependencies'
import { changeWarning } from '@/lib/schedule-change-warning'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const LINE_COLS = 'id, trade, label, start_date, end_date, subcontract_id, dates_overridden_at, progress_pct'

interface AffectedSub {
  companyId: string | null
  companyName: string
  email: string | null
  /** Every line of theirs that moved. One email covers all of them. */
  lines: { id: string; trade: string; from: string; to: string; shiftDays: number; because: string | null }[]
}

/**
 * Work out what would move, and who would hear about it.
 *
 * Shared by the preview and the apply so the screen somebody approves and the
 * thing that then happens cannot drift - the review screen is the whole safety
 * property here, and it is worth nothing if it is computed by different code
 * from the write.
 */
async function plan(
  db: ReturnType<typeof admin>, projectId: string, itemId: string,
  newStart: string, newEnd: string,
  // Linking in the same save is the LATER word, so the line is not dropping
  // out of a chain it has just been put into.
  justLinked = false,
) {
  const [linesRes, depsRes] = await Promise.all([
    db.from('schedule_items').select(LINE_COLS).eq('project_id', projectId),
    db.from('schedule_dependencies').select('*').eq('project_id', projectId),
  ])
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`)
  if (depsRes.error) throw new Error(`dependencies: ${depsRes.error.message}`)

  const lines = (linesRes.data ?? []) as unknown as ScheduleLine[]
  const deps = (depsRes.data ?? []) as unknown as Dependency[]
  const byId = new Map(lines.map(l => [l.id, l]))

  const result = cascade(lines, deps, itemId, newStart, newEnd)

  // WHAT THE CHANGE WILL **NOT** DO, worked out here beside the moves so the
  // sentence on the screen and the thing that happens come from one place.
  //
  // `hasDependents` asks the LINKS, not the result: a line every one of whose
  // followers is hand-dated produces zero moves and zero pushes, and calling
  // that "nothing is linked" would be the wrong sentence about a linked job.
  const edited = byId.get(itemId)
  const warning = edited
    ? changeWarning({
        edited,
        newStart,
        newEnd,
        result,
        ownPredecessors: deps
          .filter(d => d.task_id === itemId)
          .map(d => ({ dep: d, predecessor: byId.get(d.predecessor_task_id) }))
          .filter((x): x is { dep: Dependency; predecessor: ScheduleLine } => !!x.predecessor),
        justLinked,
        hasDependents: deps.some(d => d.predecessor_task_id === itemId),
      })
    : null

  // Who is on each moved line. A placeholder has no subcontract and therefore
  // nobody to tell - that is a normal state, not a failure, and the review
  // screen says "no sub yet" rather than dropping the row.
  const subcontractIds = Array.from(new Set(
    result.moves.map(m => byId.get(m.id)?.subcontract_id).filter((v): v is string => !!v),
  ))

  const subsById = new Map<string, any>()
  if (subcontractIds.length) {
    const { data: subs, error } = await db
      .from('subcontracts')
      .select('id, company_id, trade, scope, companies(id, name, contact_email, contact_name)')
      .in('id', subcontractIds)
    if (error) throw new Error(`subcontracts: ${error.message}`)
    for (const s of subs ?? []) subsById.set((s as any).id, s)
  }

  const affected = new Map<string, AffectedSub>()
  const rows = result.moves.map((m: Move) => {
    const line = byId.get(m.id)
    const sub = line?.subcontract_id ? subsById.get(line.subcontract_id) : null
    const company = sub?.companies ?? null
    const because = m.becauseOf ? lineName(byId.get(m.becauseOf)) : null

    if (company?.id) {
      const entry: AffectedSub = affected.get(company.id) ?? {
        companyId: company.id,
        companyName: company.name ?? 'This vendor',
        email: isEmailAddress(company.contact_email) ? company.contact_email : null,
        lines: [],
      }
      entry.lines.push({
        id: m.id, trade: lineName(line),
        from: m.from.start, to: m.to.start, shiftDays: m.shiftDays, because,
      })
      affected.set(company.id, entry)
    }

    return {
      id: m.id,
      name: lineName(line),
      from: m.from,
      to: m.to,
      shiftDays: m.shiftDays,
      because,
      link: m.link,
      gate: m.gate,
      sub: company ? { id: company.id, name: company.name, email: company.contact_email ?? null } : null,
    }
  })

  return {
    moves: result.moves,
    rows,
    // EVERY linked line the edit reaches is in one list or the other. A row
    // that is simply absent reads as a row that was never linked, which is the
    // one thing this screen exists to disprove.
    skipped: result.skipped.map(s => ({
      id: s.id,
      name: lineName(byId.get(s.id)),
      reason: s.reason,
      link: s.link,
      gate: s.gate,
      because: lineName(byId.get(s.becauseOf)),
    })),
    affected: Array.from(affected.values()),
    warning,
    byId,
  }
}

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
  const { start_date: newStart, end_date: newEnd } = body ?? {}
  if (!isDateString(newStart) || !isDateString(newEnd)) {
    return NextResponse.json({ error: 'Give the new start and end dates.' }, { status: 400 })
  }
  if (newEnd < newStart) {
    return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })
  }

  try {
    const p = await plan(
      admin(), params.id, params.itemId, newStart, newEnd, body?.just_linked === true,
    )
    return NextResponse.json({
      moves: p.rows, skipped: p.skipped, affected: p.affected, warning: p.warning,
    })
  } catch (e: any) {
    console.error('[schedule/cascade] preview failed:', e?.message)
    return NextResponse.json({ error: 'Could not work out what would move.' }, { status: 500 })
  }
}

/**
 * Apply the move, and tell the subs only if asked.
 *
 * `notify` is REQUIRED in the body and has no default. A default of false
 * makes an un-updated caller silently stop telling anybody; a default of true
 * makes one silently start emailing. Neither is a thing to guess at, so the
 * route refuses a body that does not say.
 */
export async function PUT(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const { start_date: newStart, end_date: newEnd } = body ?? {}
  if (!isDateString(newStart) || !isDateString(newEnd)) {
    return NextResponse.json({ error: 'Give the new start and end dates.' }, { status: 400 })
  }
  if (newEnd < newStart) {
    return NextResponse.json({ error: 'The end date is before the start date.' }, { status: 400 })
  }
  if (typeof body?.notify !== 'boolean') {
    return NextResponse.json(
      { error: 'Say whether to notify the subs. This has no default.' },
      { status: 400 },
    )
  }
  const shouldNotify: boolean = body.notify

  // WHETHER THIS EDIT IS A HAND OVERRIDE, and the one caller allowed to say it
  // is not. The flag takes a line out of every future cascade, so the default
  // is the protective one - an un-updated caller keeps today's behaviour.
  //
  // THE CONTRADICTION IT RESOLVES: the dialog commits staged links and then
  // saves the dates, so one save was writing "this line follows Sheetrock" and
  // "this line's dates are hand-set, ignore Sheetrock" a second apart, with the
  // second winning. A save that just linked this line is not a decision to
  // ignore the link it just made.
  const markOverridden: boolean = body?.dates_overridden !== false

  const db = admin()
  let p
  try { p = await plan(db, params.id, params.itemId, newStart, newEnd) }
  catch (e: any) {
    console.error('[schedule/cascade] plan failed:', e?.message)
    return NextResponse.json({ error: 'Could not work out what would move. Nothing was changed.' }, { status: 500 })
  }

  // The edited line first. `dates_overridden_at` marks it as a human decision,
  // so a later cascade from further upstream leaves it alone and says so.
  const { error: rootErr } = await db.from('schedule_items')
    .update({
      start_date: newStart,
      end_date: newEnd,
      ...(markOverridden ? { dates_overridden_at: new Date().toISOString() } : {}),
    })
    .eq('id', params.itemId).eq('project_id', params.id)
  if (rootErr) {
    console.error('[schedule/cascade] root update failed:', rootErr.message)
    return NextResponse.json({ error: friendlyDbError(rootErr) }, { status: 500 })
  }

  // Then everything the cascade moved. These are NOT overridden - they moved
  // because something upstream did, which is exactly what a future cascade
  // should be free to do again.
  const failed: string[] = []
  for (const m of p.moves) {
    const { error } = await db.from('schedule_items')
      .update({ start_date: m.to.start, end_date: m.to.end })
      .eq('id', m.id).eq('project_id', params.id)
    if (error) {
      console.error(`[schedule/cascade] ${m.id} update failed:`, error.message)
      failed.push(m.id)
    }
  }

  const project = await db.from('projects').select('name').eq('id', params.id).maybeSingle()
  const projectName = (project.data as any)?.name ?? null

  // ONE EMAIL PER SUB. The notice rows are written either way, with sent_at
  // null when nothing was sent - "we moved this and chose not to say" is a
  // fact worth keeping, and a row that only exists on the send path cannot
  // record it.
  const notices: any[] = []
  let emailed = 0
  for (const sub of p.affected) {
    const moved = sub.lines.filter(l => !failed.includes(l.id))
    if (!moved.length) continue

    let sendError: string | null = null
    let sentAt: string | null = null

    if (shouldNotify && sub.email) {
      const mail = scheduleShiftEmail({
        vendorName: sub.companyName,
        projectName,
        lines: moved.map((l): ShiftedLine => ({
          trade: l.trade, oldStart: l.from, newStart: l.to,
          shiftDays: l.shiftDays, because: l.because,
        })),
      })
      const res = await sendEmail({ to: sub.email, ...mail })
      if (res.sent) { sentAt = new Date().toISOString(); emailed++ }
      else sendError = res.detail ? `${res.reason}: ${res.detail}` : res.reason
      if (sendError) console.error(`[schedule/cascade] email to ${sub.email} failed: ${sendError}`)
    } else if (shouldNotify && !sub.email) {
      sendError = 'no email address on file'
    }

    for (const l of moved) {
      notices.push({
        project_id: params.id,
        schedule_item_id: l.id,
        company_id: sub.companyId,
        sent_to: sub.email ?? sub.companyName,
        kind: 'shift',
        new_start: l.to,
        old_start: l.from,
        reason: l.because ? `${l.because} moved` : 'dates edited',
        sent_at: sentAt,
        send_error: sendError,
        sent_by: gate.actor.userId,
      })
    }
  }

  if (notices.length) {
    const { error } = await db.from('schedule_shift_notices').insert(notices)
    if (error) console.error('[schedule/cascade] could not log the notices:', error.message)
  }

  // The bell is a different channel from the letter and is never the
  // duplicate - but the email above IS the letter, so in-app only.
  if (shouldNotify) {
    const userIds = (await db.from('profiles').select('id')
      .in('company_id', p.affected.map(a => a.companyId).filter((v): v is string => !!v))).data ?? []
    if (userIds.length) {
      await notify({
        db,
        type: 'schedule_shifted',
        userIds: userIds.map((u: any) => u.id),
        title: 'Your dates moved',
        message: projectName ? `Your schedule on ${projectName} changed.` : 'Your schedule changed.',
        link: `/projects/${params.id}/schedule`,
        // The letter above IS the email. The bell is a different channel and
        // is never the duplicate; a second letter is.
        inAppOnly: true,
      })
    }
  }

  return NextResponse.json({
    moved: p.moves.length - failed.length,
    failed: failed.length,
    skipped: p.skipped,
    emailed,
    notified: shouldNotify,
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { adoptProblem, adoptLinkPlan, type AdoptLine } from '@/lib/schedule-adopt'
import { lineName, type Dependency } from '@/lib/schedule-dependencies'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const LINE_COLS = 'id, trade, label, start_date, end_date, subcontract_id'

/**
 * THE AWARDED LINE TAKES THE PLACEHOLDER'S PLACE.
 *
 * `itemId` is the PLACEHOLDER being retired; `target_id` is the real line.
 * Everything that waited on the stand-in ends up waiting on the actual work.
 *
 * THE ORDER OF THE TWO WRITES IS THE WHOLE ROUTE.
 * `schedule_dependencies.predecessor_task_id` is ON DELETE CASCADE, so
 * deleting the placeholder first would destroy every dependent link - the
 * exact thing this exists to preserve - and it would do it silently, leaving
 * a board where nothing waits on anything and no error anywhere. The links
 * move first. If the move fails, NOTHING is deleted and the placeholder is
 * still standing.
 *
 * WHY THE PLACEHOLDER IS THE ROW THAT GOES, rather than the awarded line
 * being folded into it: the placeholder is by definition the throwaway - no
 * vendor, no money, no send history - while the awarded line carries its
 * subcontract and, if it has been on the board a while, its own date-change
 * record. Keeping the row with the history and retiring the stand-in is the
 * direction that cannot lose anything. The board reads the same either way:
 * one line, with the vendor on it, and every dependent pointing at it.
 */
export async function POST(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const targetId = typeof body?.target_id === 'string' ? body.target_id : ''
  if (!targetId) return NextResponse.json({ error: 'Pick the line that takes its place.' }, { status: 400 })

  const db = admin()

  const [linesRes, depsRes] = await Promise.all([
    db.from('schedule_items')
      .select(`${LINE_COLS}, subcontracts(companies(name))`)
      .eq('project_id', params.id),
    db.from('schedule_dependencies').select('*').eq('project_id', params.id),
  ])
  // A refused read and an empty one are the same `[]` otherwise, and here that
  // would mean "nothing depends on this placeholder" - which is the one fact
  // the whole decision turns on. It would delete the links and report success.
  if (linesRes.error || depsRes.error) {
    const msg = linesRes.error?.message ?? depsRes.error?.message
    console.error('[schedule/adopt] could not read the board:', msg)
    return NextResponse.json({ error: 'Could not read this schedule. Nothing was changed.' }, { status: 500 })
  }

  const rows = (linesRes.data ?? []) as any[]
  const lines: AdoptLine[] = rows.map(r => ({
    id: r.id, trade: r.trade, label: r.label,
    subcontract_id: r.subcontract_id,
    subName: r.subcontracts?.companies?.name ?? null,
    start_date: r.start_date, end_date: r.end_date,
  }))
  const deps = (depsRes.data ?? []) as unknown as Dependency[]

  const placeholder = lines.find(l => l.id === params.itemId)
  const target = lines.find(l => l.id === targetId)

  // THE SAME FUNCTION THE SCREEN ASKS. A server's answer can only ever arrive
  // as a message about a whole request that did not happen.
  const problem = adoptProblem(placeholder, target, deps)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const plan = adoptLinkPlan(params.itemId, targetId, deps)

  // 1. MOVE THE LINKS. Before anything is deleted - see above.
  if (plan.move.length) {
    const { error } = await db.from('schedule_dependencies')
      .update({ predecessor_task_id: targetId })
      .in('id', plan.move)
    if (error) {
      console.error('[schedule/adopt] could not move the links:', error.message)
      return NextResponse.json(
        { error: friendlyDbError(error) || 'Could not move the links. Nothing was changed.' },
        { status: 500 },
      )
    }
  }

  // 2. The same statement twice is not an error. A line that already waited on
  //    the real work AND on its stand-in collides on the unique index; the
  //    survivor is the one already pointing at the real line.
  if (plan.dropAsDuplicate.length) {
    const { error } = await db.from('schedule_dependencies').delete().in('id', plan.dropAsDuplicate)
    if (error) console.error('[schedule/adopt] could not drop a duplicate link:', error.message)
  }

  // 3. ONLY NOW the placeholder goes. Its own outbound links - what the
  //    stand-in itself was waiting for - go with it, which is correct: they
  //    were statements about a row that no longer exists. Reported, never
  //    silent.
  const droppedOwnLinks = deps.filter(d => d.task_id === params.itemId).length
  const { error: delErr } = await db.from('schedule_items')
    .delete().eq('id', params.itemId).eq('project_id', params.id)
  if (delErr) {
    console.error('[schedule/adopt] links moved but the placeholder is still there:', delErr.message)
    return NextResponse.json({
      error: `The links now point at ${lineName(target as any)}, but the placeholder could not be removed. Delete it by hand.`,
    }, { status: 500 })
  }

  return NextResponse.json({
    movedLinks: plan.move.length,
    droppedDuplicates: plan.dropAsDuplicate.length,
    droppedOwnLinks,
    targetName: lineName(target as any),
    placeholderName: lineName(placeholder as any),
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { findCycle, type Dependency, type ScheduleLine } from '@/lib/schedule-dependencies'
import { deliveryGateProblem, type LineKind } from '@/lib/schedule-link-words'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// What a line is, for the cycle check and for naming the loop in the error.
const LINE_COLS = 'id, trade, label, start_date, end_date, subcontract_id, dates_overridden_at, progress_pct'

/** Every dependency on this project - the cycle check needs the whole graph. */
async function projectGraph(db: ReturnType<typeof admin>, projectId: string) {
  const [linesRes, depsRes] = await Promise.all([
    db.from('schedule_items').select(LINE_COLS).eq('project_id', projectId),
    db.from('schedule_dependencies').select('*').eq('project_id', projectId),
  ])
  // A refused query and an empty one are the same `[]` otherwise, and a cycle
  // check against a graph that failed to load approves every edge.
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`)
  if (depsRes.error) throw new Error(`dependencies: ${depsRes.error.message}`)
  return {
    lines: (linesRes.data ?? []) as unknown as ScheduleLine[],
    deps: (depsRes.data ?? []) as unknown as Dependency[],
  }
}

export async function GET(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'view')
  if (denied(gate)) return gate.denied

  const db = admin()
  const { data, error } = await db
    .from('schedule_dependencies')
    .select('*, predecessor:predecessor_task_id(id, trade, label, start_date, end_date, progress_pct, subcontract_id)')
    .eq('task_id', params.itemId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[schedule/dependencies] read failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ dependencies: data ?? [] })
}

/**
 * Link this line to a predecessor.
 *
 * The cycle check runs against the WHOLE project graph, not just this line's
 * own links: A->B->C->A is invisible to anything that only looks one hop out.
 * A refusal names the loop, because "circular dependency" tells somebody
 * nothing about which link to remove.
 */
export async function POST(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const predecessorId: string | undefined = body?.predecessor_task_id
  if (!predecessorId) {
    return NextResponse.json({ error: 'Pick the trade this one waits for.' }, { status: 400 })
  }
  if (predecessorId === params.itemId) {
    return NextResponse.json({ error: 'A line cannot wait for itself.' }, { status: 400 })
  }

  const lagDays = Number(body?.lag_days ?? 0)
  if (!Number.isInteger(lagDays) || lagDays < 0 || lagDays > 365) {
    return NextResponse.json({ error: 'Lag has to be a whole number of days, 0 to 365.' }, { status: 400 })
  }

  // Null is a real answer here - "just the dates, no progress gate" - so an
  // absent field and a zero are deliberately different.
  let minProgress: number | null = null
  if (body?.min_predecessor_progress != null && body.min_predecessor_progress !== '') {
    minProgress = Number(body.min_predecessor_progress)
    if (!Number.isFinite(minProgress) || minProgress < 0 || minProgress > 100) {
      return NextResponse.json({ error: 'How far along has to be between 0 and 100.' }, { status: 400 })
    }
  }

  const db = admin()

  let graph
  try { graph = await projectGraph(db, params.id) }
  catch (e: any) {
    console.error('[schedule/dependencies] graph load failed:', e?.message)
    return NextResponse.json({ error: 'Could not check that for loops. Nothing was changed.' }, { status: 500 })
  }

  // Both lines must be on THIS project. Without it, a body could link a line
  // on somebody else's job - the ids are the only thing the route is given.
  const ids = new Set(graph.lines.map(l => l.id))
  if (!ids.has(params.itemId) || !ids.has(predecessorId)) {
    return NextResponse.json({ error: 'That line is not on this project.' }, { status: 404 })
  }

  // A GATE ON A DELIVERY CAN NEVER OPEN, so the route refuses one - the same
  // function the picker asks, because the browser is what sends this.
  //
  // Only asked when a percent is actually set: the common link carries none,
  // and a round trip on every link to rule out a case that is not being made
  // is a cost with no answer attached. The kind lives on `companies.type`, two
  // joins from this table, which is why it is a query and not a CHECK.
  if (minProgress != null) {
    const { data: pre, error: preErr } = await db
      .from('schedule_items')
      .select('subcontracts(companies(type))')
      .eq('id', predecessorId).eq('project_id', params.id).maybeSingle()
    if (preErr) {
      console.error('[schedule/dependencies] could not read the predecessor:', preErr.message)
      return NextResponse.json({ error: 'Could not check that line. Nothing was changed.' }, { status: 500 })
    }
    const kind: LineKind =
      (pre as any)?.subcontracts?.companies?.type === 'supplier' ? 'delivery' : 'work'
    const problem = deliveryGateProblem(kind, minProgress)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  }

  const cycle = findCycle(graph.deps, params.itemId, predecessorId, graph.lines)
  if (cycle) return NextResponse.json({ error: cycle.message, cycle: cycle.ids }, { status: 409 })

  const { data, error } = await db.from('schedule_dependencies').insert({
    project_id: params.id,
    task_id: params.itemId,
    predecessor_task_id: predecessorId,
    min_predecessor_progress: minProgress,
    lag_days: lagDays,
    created_by: gate.actor.userId,
  }).select('*').single()

  if (error) {
    // The unique index is the real guard against a double press.
    if ((error as any).code === '23505') {
      return NextResponse.json({ error: 'These two are already linked.' }, { status: 409 })
    }
    console.error('[schedule/dependencies] insert failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  // LINKING A LINE IS THE STATEMENT THAT IT FOLLOWS FROM NOW ON, so it clears
  // the hand-edit flag.
  //
  // THE BUG: `dates_overridden_at` is set by any date edit, and setting a
  // vendor's dates is how a line gets dates at all. So a line was dated, then
  // linked, and the cascade skipped it for ever - reported as "the cascade
  // ignores linked rows", which is exactly what it looked like. The flag means
  // "a human dated this AFTER deciding what it follows"; a date typed BEFORE
  // the link was never that decision. Nothing else clears it, so without this
  // the only way back was to re-type the dates.
  const { error: clearErr } = await db.from('schedule_items')
    .update({ dates_overridden_at: null })
    .eq('id', params.itemId).eq('project_id', params.id)
  // The link is written and is the thing that was asked for; a stale flag is
  // recoverable and a 500 here would strand it. Logged, not swallowed.
  if (clearErr) console.error('[schedule/dependencies] could not clear the hand-edit flag:', clearErr.message)

  return NextResponse.json({ dependency: data })
}

/** Unlink. Per the spec: no date changes, just remove the link. */
export async function DELETE(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const url = new URL(request.url)
  const dependencyId = url.searchParams.get('dependency_id')
  if (!dependencyId) return NextResponse.json({ error: 'dependency_id is required' }, { status: 400 })

  const db = admin()
  const { error } = await db.from('schedule_dependencies')
    .delete()
    .eq('id', dependencyId)
    .eq('task_id', params.itemId)
    .eq('project_id', params.id)

  if (error) {
    console.error('[schedule/dependencies] delete failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

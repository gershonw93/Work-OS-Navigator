import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { lineName } from '@/lib/schedule-dependencies'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Everything that waits on this line, named. */
async function dependentsOf(db: ReturnType<typeof admin>, projectId: string, itemId: string) {
  const { data, error } = await db
    .from('schedule_dependencies')
    .select('id, task:task_id(id, trade, label, start_date)')
    .eq('predecessor_task_id', itemId)
    .eq('project_id', projectId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((d: any) => ({
    dependencyId: d.id,
    id: d.task?.id,
    name: lineName(d.task),
    startDate: d.task?.start_date ?? null,
  })).filter(d => d.id)
}

/** Who waits on this line - what the delete warning reads. */
export async function GET(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'view')
  if (denied(gate)) return gate.denied
  try {
    return NextResponse.json({ dependents: await dependentsOf(admin(), params.id, params.itemId) })
  } catch (e: any) {
    console.error('[schedule/item] dependents read failed:', e?.message)
    return NextResponse.json({ error: 'Could not check what waits on this.' }, { status: 500 })
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string; itemId: string } }) {
  // The GET beside this was ungated and so was every write. middleware.ts
  // returns early for /api/, so nothing else was going to ask.
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const db = admin()
  const body = await request.json().catch(() => ({} as any))

  // A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION - the
  // route drops it and answers 200. `trade` and `progress_pct` are new, so
  // they go in here in the same change that added them to the table.
  const allowed = ['label', 'start_date', 'end_date', 'color', 'trade', 'progress_pct']
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k)),
  )
  if (!Object.keys(update).length) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  if (update.progress_pct != null && update.progress_pct !== '') {
    const n = Number(update.progress_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return NextResponse.json({ error: 'Percent complete has to be between 0 and 100.' }, { status: 400 })
    }
    update.progress_pct = n
  } else if ('progress_pct' in update) {
    // Clearing it is a real act: back to "nobody has said", which is not zero.
    update.progress_pct = null
  }

  // EDITING DATES BY HAND IS A DECISION, and the flag is what makes a later
  // cascade leave it alone. Set here rather than in the cascade route so it is
  // true however the dates were changed - the flag is about the act, not about
  // which screen did it.
  //
  // BUT ONLY WHEN THEY ACTUALLY CHANGED. Every dialog that touches a line
  // submits both dates whether or not they were edited, so a save that moved
  // nothing was marking the line hand-dated and taking it out of the cascade -
  // reported as the cascade ignoring rows nobody had knowingly pinned. A
  // resubmitted date is not a decision about the date.
  if ('start_date' in update || 'end_date' in update) {
    const { data: before, error: beforeErr } = await db
      .from('schedule_items').select('start_date, end_date')
      .eq('id', params.itemId).eq('project_id', params.id).maybeSingle()
    if (beforeErr) {
      console.error('[schedule/item] could not read the current dates:', beforeErr.message)
      return NextResponse.json({ error: friendlyDbError(beforeErr) }, { status: 500 })
    }
    const changed =
      ('start_date' in update && update.start_date !== before?.start_date) ||
      ('end_date' in update && update.end_date !== before?.end_date)
    if (changed) update.dates_overridden_at = new Date().toISOString()
  }

  const { data, error } = await db
    .from('schedule_items').update(update)
    .eq('id', params.itemId).eq('project_id', params.id)
    .select().single()

  if (error) {
    console.error('[schedule/item] update failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}

/**
 * Delete a line.
 *
 * REFUSES while anything waits on it unless the caller says it knows. The
 * foreign key is ON DELETE CASCADE, so without this the links would vanish
 * silently and three trades would quietly stop following anything - a schedule
 * that looks fine and has forgotten why it was built.
 */
export async function DELETE(request: Request, { params }: { params: { id: string; itemId: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'delete')
  if (denied(gate)) return gate.denied

  const db = admin()
  const confirmed = new URL(request.url).searchParams.get('confirm') === '1'

  let dependents
  try { dependents = await dependentsOf(db, params.id, params.itemId) }
  catch (e: any) {
    console.error('[schedule/item] dependents read failed:', e?.message)
    return NextResponse.json({ error: 'Could not check what waits on this. Nothing was deleted.' }, { status: 500 })
  }

  if (dependents.length && !confirmed) {
    const names = dependents.map(d => d.name).join(', ')
    return NextResponse.json({
      error: `${dependents.length} ${dependents.length === 1 ? 'line waits' : 'lines wait'} on this: ${names}. Deleting it unlinks ${dependents.length === 1 ? 'that one' : 'them'}.`,
      dependents,
      needsConfirm: true,
    }, { status: 409 })
  }

  const { error } = await db.from('schedule_items')
    .delete().eq('id', params.itemId).eq('project_id', params.id)
  if (error) {
    console.error('[schedule/item] delete failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ ok: true, unlinked: dependents.length })
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { friendlyDbError } from '@/lib/db-error'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding a schedule line, and changing one - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/schedule` and
// `PATCH /api/projects/[id]/schedule/[itemId]` unchanged, so the MCP server
// writes a line through exactly the whitelist the schedule screen meets. The
// routes keep their gates; this is everything after them.
//
// NEITHER OF THESE MOVES A LINE'S DATES ONCE IT EXISTS. The PATCH refuses
// `start_date` / `end_date` outright: dates go through the cascade route,
// which previews what else moves, stamps `dates_overridden_at`, writes the
// history row and decides whether anybody is told. A second writer of dates
// is exactly how that feature gets bypassed silently.
//
// No person's name is recorded by either write, so there is nothing here for
// `withVia` to credit; `userId` and `via` are accepted for the shared shape.
// ─────────────────────────────────────────────────────────────────────────────

export async function createScheduleItem(
  db: SupabaseClient,
  { projectId, body }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  // A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION, and only
  // one of them says so. `trade` was absent here while `addPlaceholder` had
  // been sending it since the day placeholders shipped: the route answered
  // 200, the line came back, and the trade was on the floor. Every one of the
  // 121 schedule lines in this database had a null trade because of this line.
  //
  // It is not cosmetic. The trade is the only name a placeholder has - a line
  // with a subcontract gets its trade from the subcontract, so this column
  // exists FOR the placeholder - and it is what `lib/trade-order.ts` reads to
  // work out what a line probably waits for. With it dropped, the dependency
  // picker named those lines from `scheduleLabel` instead and link suggestions
  // had nothing to reason from at all.
  const { label, start_date, end_date, color, subcontract_id, trade } = body
  if (!start_date || !end_date) {
    return { status: 400, body: { error: 'start_date and end_date are required' } }
  }
  if (!label && !subcontract_id) {
    return { status: 400, body: { error: 'label or subcontract_id required' } }
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    start_date,
    end_date,
    subcontract_id: subcontract_id ?? null,
    label: label ?? null,
    color: color ?? null,
    trade: String(trade ?? '').trim() || null,
  }

  let { data, error } = await db.from('schedule_items').insert(row).select().single()

  // If label/color columns don't exist yet (migration pending), retry without them
  if (error && (error as any).code === '42703') {
    delete row.label; delete row.color; delete row.trade
    const retry = await db.from('schedule_items').insert(row).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { item: data } }
}

export async function updateScheduleItem(
  db: SupabaseClient,
  { projectId, itemId, body }: { userId: string; projectId: string; itemId: string; body: any; via?: string },
): Promise<WriteResult> {
  // DATES ARE THE CASCADE'S TO WRITE, AND THIS ROUTE REFUSES THEM.
  //
  // It used to accept `start_date` / `end_date` and write them with no cascade
  // at all: no review screen, nobody pushed, no sub told, and no history row -
  // while still stamping `dates_overridden_at`, which takes the line out of
  // every FUTURE cascade as well. Today no shipped caller sends them, so the
  // whole dependency feature was safe BY CONVENTION IN THE CALLERS rather than
  // by construction here. One new caller - a gantt drag, a bulk editor, a
  // mobile screen, a script - and the feature is silently bypassed.
  //
  // Closed now rather than later precisely because the Delay action adds a
  // second way to move dates, and that is exactly when a second writer gets
  // added by accident.
  if ('start_date' in body || 'end_date' in body) {
    return {
      status: 400,
      body: { error: 'Dates go through the cascade route, so what else moves can be reviewed first.' },
    }
  }

  // A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION - the
  // route drops it and answers 200. `trade` and `progress_pct` are new, so
  // they go in here in the same change that added them to the table.
  const allowed = ['label', 'color', 'trade', 'progress_pct']
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k)),
  )
  if (!Object.keys(update).length) {
    return { status: 400, body: { error: 'Nothing to change.' } }
  }

  if (update.progress_pct != null && update.progress_pct !== '') {
    const n = Number(update.progress_pct)
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { status: 400, body: { error: 'Percent complete has to be between 0 and 100.' } }
    }
    update.progress_pct = n
  } else if ('progress_pct' in update) {
    // Clearing it is a real act: back to "nobody has said", which is not zero.
    update.progress_pct = null
  }

  // THE HAND-EDIT FLAG USED TO BE SET HERE, and is not any more: the dates it
  // watched cannot reach this route. `dates_overridden_at` is now written by
  // the cascade apply, which is the only thing that moves a date - and which
  // also knows whether the same save just created a link, the distinction that
  // `handEditWins` turns on.
  const { data, error } = await db
    .from('schedule_items').update(update)
    .eq('id', itemId).eq('project_id', projectId)
    .select().single()

  if (error) {
    console.error('[schedule/item] update failed:', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  return { status: 200, body: { item: data } }
}

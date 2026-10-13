import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { friendlyDbError } from '@/lib/db-error'
import { lineName } from '@/lib/schedule-dependencies'
import { updateScheduleItem } from '@/lib/writes/schedule-item'

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

  // Everything after the gate is `updateScheduleItem`, which Claude's MCP
  // server calls too. It refuses dates: those go through the cascade route.
  const result = await updateScheduleItem(db, {
    userId: gate.actor.userId, projectId: params.id, itemId: params.itemId, body,
  })
  return NextResponse.json(result.body, { status: result.status })
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

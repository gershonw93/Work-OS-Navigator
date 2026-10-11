import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { EVENT_FOR, repairActionProblem, type RepairAction } from '@/lib/equipment-state'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ACTIONS: RepairAction[] = ['flag', 'repaired', 'send_out', 'retire', 'reactivate']

/**
 * Everything that happens to a tool that is not a checkout: it is reported
 * broken, sent away to be fixed, fixed, retired, or brought back.
 *
 * REPORTING IS NOT DECIDING. Saying a tool is broken is something anybody who
 * can take one out can do - a worker holds `equipment: create`, and the worker
 * is who finds the bent blade. Taking it out of service, clearing the report
 * and retiring it are the office's call, so they ask `edit`.
 *
 * Every move writes an event, including the ones that undo a report. A flag
 * that can be cleared without a record is half an audit trail.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({} as any))
  const action = body.action as RepairAction
  if (!ACTIONS.includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const db = admin()
  const gate = await requirePermission(db, request, 'equipment', action === 'flag' ? 'create' : 'edit')
  if (denied(gate)) return gate.denied
  const { actor } = gate

  const { data: item } = await db
    .from('equipment')
    .select('id, status, repair_needed_at')
    .eq('id', params.id)
    .eq('company_id', actor.companyId ?? '')
    .maybeSingle()
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const note = typeof body.note === 'string' ? body.note.trim() || null : null
  const problem = repairActionProblem(item, action, note)
  if (problem) return NextResponse.json({ error: problem }, { status: 409 })

  const { data: me } = await db.from('profiles').select('full_name').eq('id', actor.userId).maybeSingle()
  const actorName = (me as any)?.full_name || null
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = {}
  switch (action) {
    case 'flag':
      Object.assign(updates, {
        repair_needed_at: now, repair_note: note,
        repair_reported_by: actor.userId, repair_reported_by_name: actorName,
      })
      break
    case 'repaired':
      Object.assign(updates, { repair_needed_at: null, repair_note: null, repair_reported_by: null, repair_reported_by_name: null })
      // Back from the repair shop means back on the shelf. A tool that was
      // only flagged while out on a job stays where it is.
      if (item.status === 'maintenance') updates.status = 'available'
      break
    case 'send_out':
      updates.status = 'maintenance'
      break
    case 'retire':
      updates.status = 'retired'
      break
    case 'reactivate':
      updates.status = 'available'
      break
  }

  const { data: saved, error } = await db
    .from('equipment')
    .update(updates)
    .eq('id', params.id)
    .eq('company_id', actor.companyId ?? '')
    .select('*')
    .single()
  if (error) {
    console.error('[equipment/repair] update failed', { id: params.id, action, error: error.message })
    return NextResponse.json({ error: 'Could not save that. Try again.' }, { status: 500 })
  }

  const { error: evErr } = await db.from('equipment_events').insert({
    equipment_id: params.id, company_id: actor.companyId, kind: EVENT_FOR[action],
    note, actor_id: actor.userId, actor_name: actorName,
  })
  if (evErr) console.error('[equipment/repair] event not recorded', { id: params.id, action, error: evErr.message })

  return NextResponse.json({ equipment: saved })
}

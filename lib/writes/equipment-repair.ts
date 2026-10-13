import type { SupabaseClient } from '@supabase/supabase-js'
import { EVENT_FOR, repairActionProblem, type RepairAction } from '@/lib/equipment-state'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Everything that happens to a tool that is not a checkout - the ONE home.
//
// Moved out of `POST /api/equipment/[id]/repair` unchanged, so the MCP server
// (Claude) reports a broken tool through exactly the code the Equipment screen
// does. The ROUTE keeps the gate, and the gate depends on the action:
// reporting (`flag`) asks `equipment: create`, deciding asks `edit`. Claude is
// only handed `flag`.
//
// Every move writes an event, including the ones that undo a report. A flag
// that can be cleared without a record is half an audit trail.
// ─────────────────────────────────────────────────────────────────────────────

export const REPAIR_ACTIONS: RepairAction[] = ['flag', 'repaired', 'send_out', 'retire', 'reactivate']

export async function equipmentRepairMove(
  db: SupabaseClient,
  { userId, companyId, equipmentId, action, body, via }:
    { userId: string; companyId: string; equipmentId: string; action: RepairAction; body: any; via?: string },
): Promise<WriteResult> {
  if (!REPAIR_ACTIONS.includes(action)) return { status: 400, body: { error: 'Unknown action.' } }

  const { data: item } = await db
    .from('equipment')
    .select('id, status, repair_needed_at')
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .maybeSingle()
  if (!item) return { status: 404, body: { error: 'Not found' } }

  const note = typeof body?.note === 'string' ? body.note.trim() || null : null
  const problem = repairActionProblem(item as any, action, note)
  if (problem) return { status: 409, body: { error: problem } }

  const { data: me } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  const actorName = (me as any)?.full_name ? withVia((me as any).full_name, via) : null
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = {}
  switch (action) {
    case 'flag':
      Object.assign(updates, {
        repair_needed_at: now, repair_note: note,
        repair_reported_by: userId, repair_reported_by_name: actorName,
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
    .eq('id', equipmentId)
    .eq('company_id', companyId)
    .select('*')
    .single()
  if (error) {
    console.error('[equipment/repair] update failed', { id: equipmentId, action, error: error.message })
    return { status: 500, body: { error: 'Could not save that. Try again.' } }
  }

  const { error: evErr } = await db.from('equipment_events').insert({
    equipment_id: equipmentId, company_id: companyId, kind: EVENT_FOR[action],
    note, actor_id: userId, actor_name: actorName,
  })
  if (evErr) console.error('[equipment/repair] event not recorded', { id: equipmentId, action, error: evErr.message })

  return { status: 200, body: { equipment: saved } }
}

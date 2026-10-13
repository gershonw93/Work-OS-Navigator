import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { ownsProject } from '@/lib/project-access'
import { checkInProblem, checkoutProblem, type ReturnCondition } from '@/lib/equipment-state'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Checking a piece of equipment OUT (to a person, optionally on a job) and back
// IN - the ONE home for both.
//
// Moved out of `POST` / `PATCH /api/equipment/[id]/assignment`, so the MCP
// server (Claude) moves a tool through exactly the code the Equipment screen
// does: the same `checkoutProblem` / `checkInProblem` rules, the same history
// row, the same repair flag on a bad return. The route keeps the gate
// (`equipment: create` - whoever can take a tool out can bring it back).
//
// Two checks the route never made, added here so both doors have them: the
// job named on a check-out must be one of the company's OWN jobs (the activity
// line lands on it), and the teammate named as holder must be in the company.
// ─────────────────────────────────────────────────────────────────────────────

export async function checkOutEquipment(
  db: SupabaseClient,
  { userId, companyId, equipmentId, body, via }: { userId: string; companyId: string; equipmentId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { data: equipment } = await db.from('equipment').select('id, status, name').eq('id', equipmentId).eq('company_id', companyId).maybeSingle()
  if (!equipment) return { status: 404, body: { error: 'Not found' } }

  // The screen hides Check out for these; this is the same rule at the door a
  // second tab goes through. A tool away being fixed is not on the shelf.
  const blocked = checkoutProblem(equipment)
  if (blocked) return { status: 409, body: { error: blocked } }

  const { holder_name, holder_profile_id, project_id, note } = body
  if (!holder_name) return { status: 400, body: { error: 'holder_name is required' } }

  if (project_id) {
    const { data: project, error: pErr } = await db.from('projects')
      .select('id, gc_company_id, created_by_company_id').eq('id', project_id).maybeSingle()
    if (pErr) return { status: 500, body: { error: 'Could not check that job.' } }
    if (!project || !ownsProject(companyId, project as any)) return { status: 403, body: { error: 'That job is not one of this company\'s.' } }
  }
  if (holder_profile_id) {
    const { data: holder } = await db.from('profiles').select('id').eq('id', holder_profile_id).eq('company_id', companyId).maybeSingle()
    if (!holder) return { status: 400, body: { error: 'That teammate is not in this company.' } }
  }

  // Close any dangling open assignment.
  await db.from('equipment_assignments')
    .update({ checked_in_at: new Date().toISOString() })
    .eq('equipment_id', equipmentId)
    .is('checked_in_at', null)

  const { data, error } = await db.from('equipment_assignments').insert({
    equipment_id: equipmentId,
    company_id: companyId,
    project_id: project_id || null,
    holder_name,
    holder_profile_id: holder_profile_id || null,
    note: note || null,
    created_by: user.id,
  }).select('*').single()
  if (error) return { status: 500, body: { error: error.message } }

  await db.from('equipment').update({ status: 'checked_out' }).eq('id', equipmentId).eq('company_id', companyId)

  if (project_id) {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    await logActivity(db, project_id, withVia((profile as any)?.full_name || 'Someone', via), 'equipment_checked_out',
      `${(equipment as any).name || 'Equipment'} checked out to ${holder_name}`,
      { equipment_id: equipmentId, holder_name }, user.id)
  }

  return { status: 200, body: { assignment: data } }
}

export async function checkInEquipment(
  db: SupabaseClient,
  { userId, companyId, equipmentId, body, via }: { userId: string; companyId: string; equipmentId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const { data: equipment } = await db.from('equipment').select('id, name').eq('id', equipmentId).eq('company_id', companyId).maybeSingle()
  if (!equipment) return { status: 404, body: { error: 'Not found' } }

  // What it came back in. An empty body is an old caller, and "it came back"
  // with nothing said is the answer it always gave: fine.
  const condition: ReturnCondition = body.condition === 'needs_repair' ? 'needs_repair' : 'ok'
  const note = typeof body.note === 'string' ? body.note.trim() || null : null
  const problem = checkInProblem(condition, note)
  if (problem) return { status: 400, body: { error: problem } }

  const { data: openAssignment } = await db
    .from('equipment_assignments')
    .select('project_id, holder_name')
    .eq('equipment_id', equipmentId)
    .is('checked_in_at', null)
    .maybeSingle()

  await db.from('equipment_assignments')
    .update({ checked_in_at: new Date().toISOString(), return_condition: condition })
    .eq('equipment_id', equipmentId)
    .is('checked_in_at', null)

  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const name = (me as any)?.full_name || null

  const back: Record<string, unknown> = { status: 'available' }
  if (condition === 'needs_repair') {
    // Reported, not decided: it goes back on the shelf with the flag on it,
    // and the office chooses whether to send it away. Same rule as reporting
    // it from the list.
    Object.assign(back, {
      repair_needed_at: new Date().toISOString(), repair_note: note,
      repair_reported_by: user.id, repair_reported_by_name: name ? withVia(name, via) : null,
    })
    const { error: evErr } = await db.from('equipment_events').insert({
      equipment_id: equipmentId, company_id: companyId, kind: 'repair_flagged',
      note, actor_id: user.id, actor_name: name ? withVia(name, via) : null,
    })
    if (evErr) console.error('[equipment/check-in] event not recorded', { id: equipmentId, error: evErr.message })
  }
  await db.from('equipment').update(back).eq('id', equipmentId).eq('company_id', companyId)

  if ((openAssignment as any)?.project_id) {
    await logActivity(db, (openAssignment as any).project_id, withVia(name || 'Someone', via), 'equipment_checked_in',
      `${(equipment as any).name || 'Equipment'} checked back in from ${(openAssignment as any).holder_name}${condition === 'needs_repair' ? ' - needs repair' : ''}`,
      { equipment_id: equipmentId }, user.id)
  }

  return { status: 200, body: { ok: true } }
}

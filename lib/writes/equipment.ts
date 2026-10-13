import type { SupabaseClient } from '@supabase/supabase-js'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding a piece of equipment and editing its details - the ONE home for both.
//
// Moved out of `POST` / `PATCH /api/equipment` unchanged, so the MCP server
// (Claude) writes through exactly the code the Equipment screen does. The
// route keeps the gate (`equipment: create` / `edit`, which carries the
// billing lock); this is everything after it. Equipment belongs to a COMPANY,
// not a job, so every write here is scoped by `company_id`.
//
// DETAILS ONLY. `status` moves through check-out/in and /repair, which are the
// doors that write the history - see equipment-assignment.ts and
// equipment-repair.ts.
// ─────────────────────────────────────────────────────────────────────────────

export async function createEquipment(
  db: SupabaseClient,
  { companyId, body }: { userId: string; companyId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { name, category, asset_tag, serial_number, notes } = body
  if (!name) return { status: 400, body: { error: 'name is required' } }

  const { data, error } = await db
    .from('equipment')
    .insert({ company_id: companyId, name, category, asset_tag, serial_number: serial_number || null, notes, status: 'available' })
    .select('*')
    .single()

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { equipment: { ...data, current: null } } }
}

export async function updateEquipment(
  db: SupabaseClient,
  { companyId, body }: { userId: string; companyId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { id, name, category, asset_tag, serial_number, notes } = body
  if (!id) return { status: 400, body: { error: 'id is required' } }
  if (name !== undefined && !String(name).trim()) return { status: 400, body: { error: 'Name is required.' } }

  // The details only. `status` used to be accepted here too, from no caller -
  // it moves through check-out/in and /repair now, which are the doors that
  // write the history. A status set here would leave a tool "In for repair"
  // with no record of who sent it.
  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = String(name).trim()
  if (category !== undefined) updates.category = category
  if (asset_tag !== undefined) updates.asset_tag = asset_tag
  if (serial_number !== undefined) updates.serial_number = serial_number
  if (notes !== undefined) updates.notes = notes

  const { data, error } = await db
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single()

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { equipment: data } }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanTypeList } from '@/lib/inspection-types'
import { quickAddProblem } from '@/lib/contact-quick-add'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding a Directory contact - the ONE home for it.
//
// Moved out of `POST /api/directory` unchanged, so the MCP server adds a sub,
// supplier or inspector through the same door: a name and an address required,
// `quickAddProblem(name, phone)` asked (a surname in the phone box is refused),
// the type whitelisted against the column's constraint, and the row stamped as
// added by the caller's company so it lands in THEIR address book.
// ─────────────────────────────────────────────────────────────────────────────

export async function createDirectoryContact(
  db: SupabaseClient,
  { myCompanyId, body }: { myCompanyId: string | null; body: any },
): Promise<WriteResult> {
  const {
    name,
    type = 'subcontractor',
    trade,
    contact_email,
    phone,
    address,
    license_number,
    website,
    // Inspector-specific
    specialty,
    jurisdiction,
    certification_number,
    notes,
    inspection_types,
  } = body

  if (!name || !contact_email) {
    return { status: 400, body: { error: 'Name and contact email are required' } }
  }

  // The same question the Quick add form asks, asked at the door as well. A
  // surname in the phone box saved without a word, and the inspections card
  // then offered it as a tap-to-call link that dials nothing.
  const problem = quickAddProblem(name, phone)
  if (problem) return { status: 400, body: { error: problem } }

  const validTypes = ['gc', 'subcontractor', 'inspector', 'supplier', 'worker', 'other']
  const safeType = validTypes.includes(type) ? type : 'other'

  // Build extra JSONB payload for inspector/supplier fields
  const extra: Record<string, string | string[]> = {}
  if (specialty) extra.specialty = specialty
  if (jurisdiction) extra.jurisdiction = jurisdiction
  if (certification_number) extra.certification_number = certification_number
  if (notes) extra.notes = notes
  if (website) extra.website = website
  // Which inspections an inspector does, so "who to call" can put the right
  // one first for a framing inspection rather than whoever sorts first.
  const types = safeType === 'inspector' ? cleanTypeList(inspection_types) : []
  if (types.length) extra.inspection_types = types

  const insertPayload: Record<string, unknown> = {
    name,
    type: safeType,
    trade: trade || null,
    contact_email,
    phone: phone || null,
    address: address || null,
    license_number: license_number || null,
    insurance_status: 'missing',
    added_by_company_id: myCompanyId,
  }

  // Attempt to set extra column - if it doesn't exist Supabase will just ignore or error
  if (Object.keys(extra).length > 0) {
    insertPayload.extra = extra
  }

  const { data, error } = await db
    .from('companies')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    // If the error is about the extra column not existing, retry without it
    if (error.message?.includes('extra') || error.code === '42703') {
      const { extra: _extra, ...payloadWithoutExtra } = insertPayload as Record<string, unknown> & { extra?: unknown }
      const { data: data2, error: error2 } = await db
        .from('companies')
        .insert(payloadWithoutExtra)
        .select()
        .single()
      if (error2) return { status: 500, body: { error: error2.message } }
      return { status: 200, body: { company: data2 } }
    }
    return { status: 500, body: { error: error.message } }
  }

  return { status: 200, body: { company: data } }
}

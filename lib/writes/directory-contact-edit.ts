import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanTypeList } from '@/lib/inspection-types'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Correcting a Directory contact - the ONE home for it, beside
// `createDirectoryContact` (directory-contact.ts).
//
// Moved out of `PATCH /api/directory/[companyId]` unchanged, so the MCP server
// (Claude) edits a contact through the same whitelist and the same merge of
// `extra` the Edit form uses.
//
// AND IT ASKS WHOSE CONTACT IT IS, which the route never did. A Directory
// "contact" is a row in `companies` - the same table that holds every
// customer of ours - so the old PATCH, asking only "are you signed in", would
// rename ANY company by its id, another GC's own account included. A contact
// is this company's to edit when this company ADDED it (`added_by_company_id`),
// which is also the only kind `search_directory` lists. The read is the gate:
// a failed one refuses rather than writing.
// ─────────────────────────────────────────────────────────────────────────────

/** null when this company added that contact; otherwise the refusal, as a result. */
export async function directoryContactProblem(
  db: SupabaseClient,
  { myCompanyId, companyId }: { myCompanyId: string | null; companyId: string },
): Promise<WriteResult | null> {
  if (!myCompanyId) return { status: 403, body: { error: 'Your account is not linked to a company.' } }
  const { data, error } = await db.from('companies').select('id, added_by_company_id').eq('id', companyId).maybeSingle()
  if (error) {
    console.error('[directory] ownership check failed', error.message)
    return { status: 500, body: { error: 'Could not check that contact just now. Try again.' } }
  }
  if (!data) return { status: 404, body: { error: 'That contact is not in your Directory.' } }
  if ((data as any).id === myCompanyId) {
    return { status: 403, body: { error: 'Your own company\'s details are changed in Settings -> Company, not in the Directory.' } }
  }
  if ((data as any).added_by_company_id !== myCompanyId) {
    return { status: 403, body: { error: 'That company keeps its own SyteNav account, so only they can change its details.' } }
  }
  return null
}

export async function updateDirectoryContact(
  db: SupabaseClient,
  { myCompanyId, companyId, body }: { myCompanyId: string | null; companyId: string; body: any },
): Promise<WriteResult> {
  const params = { companyId }

  const refused = await directoryContactProblem(db, { myCompanyId, companyId })
  if (refused) return refused

  // No website: `companies` has no such column, and Supabase answers an
  // unknown one with data: null rather than an error - so every edit on this
  // form was one typo away from saving nothing and reporting success.
  const allowed = ['name', 'type', 'trade', 'contact_email', 'phone', 'address', 'license_number']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key] || null
  }

  // Which inspections an inspector does lives in `extra` beside the
  // jurisdiction, so it is MERGED in - replacing `extra` wholesale would wipe
  // the jurisdiction and cert number this form never shows.
  if (body.inspection_types !== undefined) {
    const { data: cur } = await db.from('companies').select('extra').eq('id', params.companyId).maybeSingle()
    updates.extra = { ...(((cur as any)?.extra as Record<string, unknown>) ?? {}), inspection_types: cleanTypeList(body.inspection_types) }
  }

  const { data, error } = await db.from('companies').update(updates).eq('id', params.companyId).select().single()
  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { company: data } }
}

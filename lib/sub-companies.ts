import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// WHICH COMPANY IDS ARE "MINE" ON A SUBCONTRACT - the one reader.
//
// A GC's subcontract names the GC's own Directory row for the vendor
// (`companies.added_by_company_id = <GC>`). Since migration 169 that row can
// LINK to the sub's own company (`linked_company_id`), and the sub reaches the
// job across the link. So "does a subcontract on this job carry MY company"
// is no longer one equality: it is my company, plus every Directory row any GC
// has linked to it.
//
// Twelve places asked the old question, each with its own
// `.eq('company_id', actor.companyId)`. They ask this instead, and
// `lib/__tests__/sub-companies.ts` walks app/ and lib/ for a subcontracts
// query filtered on the caller's company so a thirteenth cannot be written the
// old way.
//
// A FAILED READ IS NULL, NEVER A SHORTER LIST. A sub missing the GC jobs he
// was linked to looks exactly like a sub nobody has hired, and a caller
// handed `[companyId]` on a failure would say so to his face.
// ─────────────────────────────────────────────────────────────────────────────

type Db = Pick<SupabaseClient, 'from'>

export async function vendorCompanyIds(
  db: Db,
  companyId: string | null | undefined,
): Promise<string[] | null> {
  if (!companyId) return []
  const { data, error } = await db.from('companies').select('id').eq('linked_company_id', companyId)
  if (error) {
    console.error('[sub-companies] linked rows read failed', { companyId, error: error.message })
    return null
  }
  return [companyId, ...((data ?? []) as { id: string }[]).map(r => r.id).filter(id => id !== companyId)]
}

/**
 * The people behind a vendor a GC named: anybody signed in UNDER the Directory
 * row itself (the old invite put them there) and anybody at the company it is
 * linked to. Who "everybody at the awarded sub" is, for a notification.
 */
export async function vendorProfileIds(db: Db, vendorCompanyId: string | null | undefined): Promise<string[]> {
  if (!vendorCompanyId) return []
  const { data: row } = await db.from('companies').select('id, linked_company_id').eq('id', vendorCompanyId).maybeSingle()
  const ids = [vendorCompanyId, (row as any)?.linked_company_id].filter(Boolean) as string[]
  const { data, error } = await db.from('profiles').select('id').in('company_id', ids)
  if (error) {
    console.error('[sub-companies] vendor people read failed', { vendorCompanyId, error: error.message })
    return []
  }
  return ((data ?? []) as { id: string }[]).map(p => p.id)
}

/** Is a subcontract's company one of mine? `mine` from `vendorCompanyIds`. */
export function holdsSubcontract(mine: readonly string[] | null, subcontractCompanyId: string | null | undefined): boolean {
  return !!mine && !!subcontractCompanyId && mine.includes(subcontractCompanyId)
}

/**
 * `vendorProfileIds` for several vendors at once, keyed by the id the GC named
 * - so a task or a subtask assigned to "Blue Wave Pools" (the GC's Directory
 * row) reaches the people at Blue Wave's own company too.
 */
export async function vendorPeopleByCompany(db: Db, vendorCompanyIds: readonly string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const ids = Array.from(new Set(vendorCompanyIds.filter(Boolean)))
  if (!ids.length) return out
  const { data: rows } = await db.from('companies').select('id, linked_company_id').in('id', ids)
  const linkOf = new Map<string, string>()
  for (const r of (rows ?? []) as { id: string; linked_company_id: string | null }[]) {
    if (r.linked_company_id) linkOf.set(r.id, r.linked_company_id)
  }
  const all = Array.from(new Set([...ids, ...Array.from(linkOf.values())]))
  const { data, error } = await db.from('profiles').select('id, company_id').in('company_id', all)
  if (error) {
    console.error('[sub-companies] vendor people read failed', { error: error.message })
    return out
  }
  for (const id of ids) {
    const targets = new Set([id, linkOf.get(id)].filter(Boolean) as string[])
    out.set(id, ((data ?? []) as { id: string; company_id: string }[]).filter(p => targets.has(p.company_id)).map(p => p.id))
  }
  return out
}

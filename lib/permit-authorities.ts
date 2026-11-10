import type { SupabaseClient } from '@supabase/supabase-js'
import { applyHowByAuthority, type AuthorityHow } from './permit-apply'

/**
 * How each township on these permits takes applications, read from the
 * caller's own Directory - the Apply card says it. One home for the Permits
 * list and the development board. A failed read is logged and says nothing:
 * a missing line is exactly the state of a card nobody has set.
 */
export async function authoritiesFor(db: SupabaseClient, companyId: string | null, names: (string | null)[]): Promise<Record<string, AuthorityHow>> {
  if (!companyId || !names.some(Boolean)) return {}
  const { data, error } = await db.from('companies').select('id, name, type, address, extra')
    .eq('added_by_company_id', companyId).limit(1000)
  if (error) { console.error('[permit-authorities] directory read failed', error.message); return {} }
  return applyHowByAuthority(names, (data ?? []) as any[])
}

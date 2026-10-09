import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A company's own inspection types, without the defaults mixed in.
 *
 * A failed read costs the custom types, not the picker - the defaults still
 * come back through `typeOptions`. Logged, because "my types vanished" is
 * otherwise unanswerable.
 */
export async function companyInspectionTypes(db: SupabaseClient, companyId: string | null | undefined): Promise<string[]> {
  if (!companyId) return []
  const { data, error } = await db.from('inspection_type_options').select('name').eq('company_id', companyId).order('name')
  if (error) console.error('[inspection-types] read failed', error.message)
  return ((data ?? []) as { name: string }[]).map(r => r.name)
}

/** Remember the non-default types among `names` as company options. Best-effort. */
export async function rememberInspectionTypes(db: SupabaseClient, companyId: string | null | undefined, names: string[]): Promise<void> {
  if (!companyId || !names.length) return
  for (const name of names) {
    const { error } = await db.from('inspection_type_options').insert({ company_id: companyId, name })
    if (error && error.code !== '23505') console.error('[inspection-types] remember failed', error.message)
  }
}

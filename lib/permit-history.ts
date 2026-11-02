import type { SupabaseClient } from '@supabase/supabase-js'
import type { PermitItem, PermitRound } from '@/lib/permit-rounds'

// The ONE reader for permits' rounds and items - the Permits tab and the
// development board read through it, so the two screens cannot be built from
// different columns. `ok: false` means the read failed and the empty lists
// mean nothing; a caller must say so rather than render "nothing logged".

export const ROUND_SELECT = 'id, permit_id, submitted_on, submitted_note, expected_by, sent_files, outcome, outcome_on, outcome_note, received_files, created_by_name, outcome_by_name, created_at'
export const ITEM_SELECT = 'id, permit_id, round_id, label, done_at, done_by_name, created_at'

export async function permitHistory(db: SupabaseClient, permitIds: string[]):
  Promise<{ rounds: PermitRound[]; items: PermitItem[]; ok: boolean }> {
  if (!permitIds.length) return { rounds: [], items: [], ok: true }
  const [r, i] = await Promise.all([
    db.from('permit_rounds').select(ROUND_SELECT).in('permit_id', permitIds),
    db.from('permit_items').select(ITEM_SELECT).in('permit_id', permitIds).order('created_at', { ascending: true }),
  ])
  if (r.error) console.error('[permit-history] rounds read failed', r.error.message)
  if (i.error) console.error('[permit-history] items read failed', i.error.message)
  if (r.error || i.error) return { rounds: [], items: [], ok: false }
  return { rounds: (r.data ?? []) as PermitRound[], items: (i.data ?? []) as PermitItem[], ok: true }
}

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ExternalState } from '@/lib/qbo-pull'

// Shared by the two halves of the QuickBooks pull: lib/quickbooks-pull.ts
// (payments and client invoices) and lib/quickbooks-pull-bills.ts (sub bills
// and the payments settling them) - kept apart so the module that marks a
// sub's bill paid is never one that touches client invoices.

export type Outcome = { status: 'applied' | 'ignored' | 'error'; message: string; logEntity?: string; logId?: string; label?: string | null }

/** Flag a SyteNav row with what QuickBooks says about it. Never deletes or rewrites the row itself. */
export async function flag(db: SupabaseClient, table: string, id: string, state: ExternalState, note: string) {
  await db.from(table).update({ qbo_external_state: state, qbo_external_note: note, qbo_external_at: new Date().toISOString() }).eq('id', id)
}

export const money = (v: unknown) => `$${Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`


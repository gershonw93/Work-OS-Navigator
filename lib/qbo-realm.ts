// ─────────────────────────────────────────────────────────────────────────────
// Which QuickBooks file an account may connect. Pure, so it can be pinned.
//
// Every qbo_id SyteNav holds for a company - customers, bills, invoices,
// payments - is an id in ONE file: one realm, in one environment. The sandbox
// and a real company number their records independently, so sandbox invoice
// 292 and production invoice 292 are different documents in different books.
// Connecting a second file while those ids stand would have the push skip
// records as "already synced" that the new file has never seen, and send voids
// at whatever the new file happens to call 292.
//
//   connect      - no file yet, or the same file again (a reconnect after an
//                  expired grant keeps every id)
//   other_file   - this account's ids belong to a different file (including
//                  sandbox vs production). Refused until somebody presses
//                  Start fresh, which archives the old ids.
//   file_taken   - another SyteNav account is connected to this file. Two
//                  accounts pushing into one set of books would each push the
//                  same job's money as their own.
// ─────────────────────────────────────────────────────────────────────────────

export interface RealmRef { realmId: string; environment: string }

export type RealmDecision = 'connect' | 'other_file' | 'file_taken'

export function sameFile(a: RealmRef, b: RealmRef): boolean {
  return String(a.realmId) === String(b.realmId) && (a.environment || 'sandbox') === (b.environment || 'sandbox')
}

export function realmDecision(input: { bound: RealmRef | null; incoming: RealmRef; takenByOtherAccount: boolean }): RealmDecision {
  if (input.takenByOtherAccount) return 'file_taken'
  if (input.bound && !sameFile(input.bound, input.incoming)) return 'other_file'
  return 'connect'
}

/**
 * Every column that holds an id in the connected file, per table - the list
 * Start fresh archives and clears. Vendors are not here: a sub is shared by
 * every GC it works for, so its id lives per FILE in quickbooks_vendor_links
 * and never needs clearing.
 */
export const QBO_ID_COLUMNS: { table: string; ids: string[]; clear: Record<string, null | boolean> }[] = [
  { table: 'customers', ids: ['qbo_id'], clear: { qbo_id: null, qbo_synced_at: null, qbo_claimed_at: null } },
  { table: 'client_invoices', ids: ['qbo_id'], clear: { qbo_id: null, qbo_synced_at: null, qbo_claimed_at: null, qbo_voided_at: null } },
  { table: 'client_payments', ids: ['qbo_id'], clear: { qbo_id: null, qbo_synced_at: null, qbo_claimed_at: null, qbo_txn_type: null, qbo_reapply_needed: false } },
  { table: 'client_payment_groups', ids: ['qbo_id'], clear: { qbo_id: null, qbo_synced_at: null, qbo_claimed_at: null } },
  { table: 'invoices', ids: ['qbo_id', 'qbo_payment_id'], clear: { qbo_id: null, qbo_synced_at: null, qbo_claimed_at: null, qbo_payment_id: null, qbo_payment_synced_at: null, qbo_payment_claimed_at: null } },
]

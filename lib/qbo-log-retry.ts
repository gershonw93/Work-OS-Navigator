// ─────────────────────────────────────────────────────────────────────────────
// A failure in the sync log comes with its way out. Pure.
//
// The log listed errors and stopped there: the reason was on screen and the
// fix was six buttons away, behind a guess about which one re-pushes a
// "bill_payment". Each failed row now says what retrying it means - the Sync
// branch to run for that one record, or, where no sync can redo it (a delete
// QuickBooks refused, an edit), what the person does instead. And a failure
// already put right by a later success says nothing, so the list of things
// needing attention is exactly that.
// ─────────────────────────────────────────────────────────────────────────────

export interface LogRowLike {
  entity_type: string
  entity_id: string | null
  action: string | null
  status: string
  message: string | null
  created_at: string
}

export type Retry =
  | { kind: 'sync'; entity: string; ids: string[] }
  | { kind: 'hint'; text: string }

const CREATE_ENTITY: Record<string, string> = {
  client_invoice: 'client-invoices',
  payment: 'payments',
  client_payment: 'payments',
  bill: 'bills',
  bill_payment: 'bill-payments',
  customer: 'customers',
  vendor: 'vendors',
}

export function retryFor(row: LogRowLike): Retry | null {
  if (row.status !== 'error') return null
  const action = row.action ?? 'create'
  if (row.entity_type === 'connection') {
    return { kind: 'hint', text: 'Reconnect QuickBooks above. Anything that missed is picked up by Sync once it is back.' }
  }
  if (!row.entity_id) return null
  if (action === 'void') {
    if (/deleted here|delete/i.test(row.message ?? '')) {
      return { kind: 'hint', text: 'The record was kept. Fix what QuickBooks names, then delete it again.' }
    }
    if (row.entity_type === 'client_invoice' || row.entity_type === 'bill_payment') {
      return { kind: 'sync', entity: 'voids', ids: [row.entity_id] }
    }
    return null
  }
  if (action === 'update') {
    if (row.entity_type === 'payment' && /credit/i.test(row.message ?? '')) return { kind: 'sync', entity: 'payments', ids: [row.entity_id] }
    return { kind: 'hint', text: 'Save the change again in SyteNav to resend it.' }
  }
  const entity = CREATE_ENTITY[row.entity_type]
  return entity ? { kind: 'sync', entity, ids: [row.entity_id] } : null
}

/** True when a LATER success for the same record and action put this failure right. */
export function isResolved(row: LogRowLike, all: LogRowLike[]): boolean {
  if (row.status !== 'error') return false
  if (row.entity_type === 'connection') {
    return all.some(r => r.entity_type === 'connection' && r.status === 'success' && r.created_at > row.created_at)
  }
  return all.some(r =>
    r.status === 'success' && r.entity_id === row.entity_id && r.entity_type === row.entity_type
    && (r.action ?? 'create') === (row.action ?? 'create') && r.created_at > row.created_at)
}

import { createHmac, timingSafeEqual } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks -> SyteNav, phase 1: the pure half. No database, no network.
//
// What comes back is ONLY what touches a record SyteNav sent: money recorded in
// QuickBooks against a SyteNav invoice or bill, and a void, delete or amount
// change made there to a SyteNav record. Anything created only in QuickBooks
// is left alone - QuickBooks does not know which job it belongs to.
//
// Changes reach us two ways, and both end up as the same ChangeEvent:
//   * Intuit's webhook, which names what changed and nothing else (ids only),
//     in either of its two formats - the original `eventNotifications` shape
//     and the CloudEvents array Intuit moved to;
//   * the daily Change Data Capture read, which returns the records themselves.
// ─────────────────────────────────────────────────────────────────────────────

/** The QuickBooks entities phase 1 listens to. Everything else is ignored. */
export const PULL_ENTITIES = ['Payment', 'Invoice', 'Bill', 'BillPayment'] as const
export type PullEntity = typeof PULL_ENTITIES[number]

export type Operation = 'Create' | 'Update' | 'Delete' | 'Void' | 'Merge' | 'Emailed'

export interface ChangeEvent {
  realmId: string
  entity: PullEntity
  id: string
  operation: Operation
  /** Intuit's own timestamp for the change - part of the de-duplication key. */
  lastUpdated: string
}

export function isPullEntity(v: unknown): v is PullEntity {
  return typeof v === 'string' && (PULL_ENTITIES as readonly string[]).includes(v)
}

const OPERATIONS: Record<string, Operation> = {
  create: 'Create', created: 'Create', update: 'Update', updated: 'Update',
  delete: 'Delete', deleted: 'Delete', void: 'Void', voided: 'Void',
  merge: 'Merge', merged: 'Merge', emailed: 'Emailed',
}
const ENTITY_BY_LOWER: Record<string, PullEntity> = {
  payment: 'Payment', invoice: 'Invoice', bill: 'Bill', billpayment: 'BillPayment',
}

/**
 * Both webhook formats, as change events. A shape we do not recognise yields
 * nothing rather than a guess - an unread event is caught by the daily read,
 * a misread one could flag the wrong record.
 */
export function parseWebhook(body: unknown): ChangeEvent[] {
  const out: ChangeEvent[] = []
  // The original format: { eventNotifications: [{ realmId, dataChangeEvent: { entities: [...] } }] }
  const notes = (body as any)?.eventNotifications
  if (Array.isArray(notes)) {
    for (const n of notes) {
      const realmId = String(n?.realmId ?? '')
      for (const e of n?.dataChangeEvent?.entities ?? []) {
        const entity = ENTITY_BY_LOWER[String(e?.name ?? '').toLowerCase()]
        const operation = OPERATIONS[String(e?.operation ?? '').toLowerCase()]
        if (realmId && entity && operation && e?.id != null) {
          out.push({ realmId, entity, id: String(e.id), operation, lastUpdated: String(e?.lastUpdated ?? '') })
        }
      }
    }
    return out
  }
  // CloudEvents: [{ type: 'qbo.payment.created.v1', intuitentityid, intuitaccountid, time }]
  if (Array.isArray(body)) {
    for (const e of body) {
      const parts = String(e?.type ?? '').split('.')
      const entity = ENTITY_BY_LOWER[(parts[1] ?? '').toLowerCase()]
      const operation = OPERATIONS[(parts[2] ?? '').toLowerCase()]
      const realmId = String(e?.intuitaccountid ?? '')
      const id = e?.intuitentityid
      if (realmId && entity && operation && id != null) {
        out.push({ realmId, entity, id: String(id), operation, lastUpdated: String(e?.time ?? '') })
      }
    }
  }
  return out
}

/**
 * Intuit signs every webhook: base64(HMAC-SHA256(verifier token, raw body)) in
 * the `intuit-signature` header. Compared in constant time. No token, no
 * header, or a mismatch is a refusal - an unsigned call that could flag or
 * create money records is the thing this exists to stop.
 */
export function signatureValid(rawBody: string, header: string | null | undefined, verifierToken: string | null | undefined): boolean {
  if (!verifierToken || !header) return false
  const expected = createHmac('sha256', verifierToken).update(rawBody, 'utf8').digest()
  let given: Buffer
  try { given = Buffer.from(header, 'base64') } catch { return false }
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/**
 * True when a QuickBooks payment was pushed BY SyteNav. Every payment SyteNav
 * sends carries its `SN-xxxxxxxx` tracking id - in the reference when the
 * payer gave none, in the memo when they did. This is the second guard against
 * the echo loop; the first is that SyteNav already holds the record's id.
 */
export function pushedBySyteNav(obj: any): boolean {
  const text = `${obj?.PaymentRefNum ?? ''} ${obj?.DocNumber ?? ''} ${obj?.PrivateNote ?? ''}`
  return /\bSN-[0-9a-f]{8}\b/i.test(text)
}

/** A transaction QuickBooks has voided: zero total and "Voided" in the memo. */
export function voidedInQbo(obj: any): boolean {
  return Number(obj?.TotalAmt ?? 0) === 0 && /voided/i.test(String(obj?.PrivateNote ?? ''))
}

/** Which transactions of a type a QuickBooks payment applies to, and how much to each. */
export function linkedAmounts(obj: any, txnType: 'Invoice' | 'Bill'): { qboId: string; amount: number }[] {
  const out = new Map<string, number>()
  for (const line of obj?.Line ?? []) {
    for (const link of line?.LinkedTxn ?? []) {
      if (link?.TxnType !== txnType || link?.TxnId == null) continue
      const id = String(link.TxnId)
      out.set(id, Math.round(((out.get(id) ?? 0) + Number(line?.Amount ?? 0)) * 100) / 100)
    }
  }
  return Array.from(out, ([qboId, amount]) => ({ qboId, amount }))
}

/** Money as cents, so a comparison never trips over 0.1 + 0.2. */
export function toCents(v: unknown): number {
  return Math.round(Number(v ?? 0) * 100)
}

export type ExternalState = 'voided' | 'deleted' | 'changed' | 'part_paid'

/** The words a flag shows on the row it is about. */
export function externalLabel(state: string | null | undefined): string | null {
  switch (state) {
    case 'voided': return 'Voided in QuickBooks'
    case 'deleted': return 'Deleted in QuickBooks'
    case 'changed': return 'Changed in QuickBooks'
    case 'part_paid': return 'Part paid in QuickBooks'
    default: return null
  }
}

/** The events Change Data Capture returns, flattened. A deleted record comes back with only its id. */
export function cdcEvents(realmId: string, response: any): ChangeEvent[] {
  const out: ChangeEvent[] = []
  for (const block of response?.CDCResponse ?? []) {
    for (const qr of block?.QueryResponse ?? []) {
      for (const entity of PULL_ENTITIES) {
        for (const obj of qr?.[entity] ?? []) {
          if (obj?.Id == null) continue
          const deleted = String(obj?.status ?? '').toLowerCase() === 'deleted'
          out.push({
            realmId, entity, id: String(obj.Id),
            operation: deleted ? 'Delete' : 'Update',
            lastUpdated: String(obj?.MetaData?.LastUpdatedTime ?? ''),
          })
        }
      }
    }
  }
  return out
}

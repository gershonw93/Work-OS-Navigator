/**
 * What the QuickBooks chip on a client invoice row should say.
 *
 * THE BUG THIS EXISTS FOR. The chip meant exactly one thing - "this invoice
 * has a qbo_id" - and was drawn as a green tick. So INV-0004 sat in SyteNav
 * marked paid, wearing a green QuickBooks tick, while in QuickBooks it was
 * still an open receivable: the invoice had reached QuickBooks, the payment
 * settling it had not. The tick was true and the row was a lie.
 *
 * There are two facts, not one - the invoice is over there, and the money that
 * settles it is over there - and a chip that collapses them is worse than no
 * chip, because it stops anybody looking.
 */

export interface QbInvoice {
  status: string
  qbo_id: string | null
  settlement?: { recorded: boolean; in_qbo: boolean } | null
}

export type QbChip =
  | { show: false }
  | { show: true; tone: 'ok' | 'warn'; label: string; title: string }

export function invoiceQbChip(inv: QbInvoice, connected: boolean): QbChip {
  // No QuickBooks, nothing to say about QuickBooks. A "not synced" note on
  // every invoice of a company that never connected one is noise wearing a
  // warning's clothes.
  if (!connected) return { show: false }

  const status = String(inv.status ?? '')

  // A draft is not a receivable - nobody has been asked for this money, so
  // nothing belongs over there yet.
  if (status === 'draft') return { show: false }

  if (status === 'void') {
    return inv.qbo_id
      ? { show: true, tone: 'ok', label: 'Voided in QB', title: `Voided in QuickBooks (invoice ${inv.qbo_id})` }
      : { show: false }
  }

  if (!inv.qbo_id) {
    return {
      show: true, tone: 'warn', label: 'Not in QuickBooks',
      title: 'This invoice has not reached QuickBooks. Settings > QuickBooks > Sync client invoices.',
    }
  }

  if (status !== 'paid') {
    return { show: true, tone: 'ok', label: 'QB ✓', title: `In QuickBooks as invoice ${inv.qbo_id}` }
  }

  // Paid here. Whether it is paid THERE is the second fact.
  const s = inv.settlement
  if (s?.recorded && s.in_qbo) {
    return { show: true, tone: 'ok', label: 'QB ✓ paid', title: `Invoice ${inv.qbo_id} is settled in QuickBooks` }
  }
  if (s?.recorded) {
    return {
      show: true, tone: 'warn', label: 'QB - payment not synced',
      title: `The payment is recorded here but has not reached QuickBooks, so invoice ${inv.qbo_id} is still an open receivable there.`,
    }
  }
  return {
    show: true, tone: 'warn', label: 'QB - still open',
    title: `Marked paid here with no payment recorded, so invoice ${inv.qbo_id} is still an open receivable in QuickBooks.`,
  }
}

/**
 * "opened 3 times, last on Tuesday" rather than "opened".
 *
 * Only the first open was ever recorded, so an invoice read once in April and
 * an invoice read four times this morning were the same sentence on screen -
 * and the second one is a phone call you make differently.
 */
export function openedLabel(
  inv: { status: string; view_count?: number | null; last_viewed_at?: string | null; viewed_at?: string | null },
  fmt: (iso: string) => string,
): string | null {
  const count = Number(inv.view_count ?? 0)
  const last = inv.last_viewed_at ?? inv.viewed_at ?? null

  if (!count && !last) {
    // Silence on a draft: it has not been sent, so "not opened yet" would be
    // stating that water is wet.
    return String(inv.status) === 'sent' ? 'not opened yet' : null
  }
  // Rows from before opens were counted know a date but not a tally.
  if (!count) return `opened ${fmt(last!)}`
  const times = count === 1 ? 'opened once' : `opened ${count} times`
  return last ? `${times}, last ${fmt(last)}` : times
}

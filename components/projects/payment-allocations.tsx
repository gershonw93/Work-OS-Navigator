'use client'

import { Input } from '@/components/ui/input'
import { cents, dollars } from '@/lib/invoice-settlement'

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export interface PayableInvoice {
  id: string
  invoice_number: string
  /** Still owed, in dollars. */
  balance: number
  total: number
}

/**
 * Which invoices a payment pays, and how much goes to each.
 *
 * Tick one and the whole payment goes to it; tick several and the cheque is
 * spread across them oldest first, never past what each still owes - every
 * share stays editable, because the client may have said which invoice they
 * meant. Nothing ticked is a deposit: money that settles nothing in particular.
 *
 * The running "Applied $X of $Y" is the same arithmetic `allocationProblem`
 * runs on Save, so the line on screen and the refusal agree.
 */
export function PaymentAllocations({
  invoices, picked, shares, paymentAmount, onToggle, onShare, onAccount, onOnAccount,
}: {
  invoices: PayableInvoice[]
  picked: string[]
  shares: Record<string, string>
  paymentAmount: string
  onToggle: (id: string) => void
  onShare: (id: string, value: string) => void
  /** Keep whatever is not on an invoice as the client's credit on account. */
  onAccount: boolean
  onOnAccount: (v: boolean) => void
}) {
  const applied = picked.reduce((s, id) => s + cents(shares[id]), 0)
  const total = cents(paymentAmount)
  const left = total - applied

  // CREDIT ON ACCOUNT IS A DECISION, NOT A REMAINDER. Without the box ticked,
  // money left over with nowhere declared to go is refused as a typo; with it,
  // the rest is the client's credit, applied to an invoice later with no new
  // money. It works with nothing ticked too: a client paying ahead.
  const creditBox = (
    <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm text-ink-soft">
      <input type="checkbox" className="accent-[#C9F24A] mt-1 shrink-0" checked={onAccount} onChange={e => onOnAccount(e.target.checked)} />
      <span>
        Keep anything not on an invoice as credit for this client
        <span className="block text-xs text-faint">Apply it to an invoice later from that invoice&apos;s menu - no new payment needed.</span>
      </span>
    </label>
  )
  if (!invoices.length) return creditBox

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-ink-soft">What does this payment pay? <span className="font-normal text-faint">(optional)</span></p>
        <p className="text-xs text-muted-fg">
          Tick every invoice this one payment covers - one cheque can pay several. Leave them all unticked for a deposit.
        </p>
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line-soft">
        {invoices.map(inv => {
          const on = picked.includes(inv.id)
          return (
            <div key={inv.id} className={on ? 'bg-surface' : ''}>
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                <input type="checkbox" className="accent-[#C9F24A] shrink-0" checked={on} onChange={() => onToggle(inv.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-ink">Invoice {inv.invoice_number}</span>
                  <span className="block text-xs text-faint">
                    {inv.balance < inv.total ? `${money(inv.balance)} left of ${money(inv.total)}` : `${money(inv.total)} owed`}
                  </span>
                </span>
              </label>
              {on && (
                <div className="flex items-center gap-2 px-3 pb-2.5">
                  <span className="text-xs text-muted-fg whitespace-nowrap">Amount to this invoice</span>
                  <Input
                    type="number" inputMode="decimal" className="w-32"
                    aria-label={`Amount of this payment going to invoice ${inv.invoice_number}`}
                    value={shares[inv.id] ?? ''}
                    onChange={e => onShare(inv.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      {picked.length > 0 && (
        <p className={`text-xs ${left === 0 || (left > 0 && onAccount) ? 'text-success' : 'text-warn'}`}>
          Applied {money(dollars(applied))} of {money(dollars(total))}
          {left > 0 && (onAccount ? ` - ${money(dollars(left))} kept as credit` : ` - ${money(dollars(left))} not on an invoice yet`)}
          {left < 0 && ` - ${money(dollars(-left))} more than the payment`}
        </p>
      )}
      {creditBox}
    </div>
  )
}

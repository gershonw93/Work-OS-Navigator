'use client'

import { AlertTriangle, Plus, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BudgetDestination } from '@/lib/invoice-budget'

const money = (n: number) => `$${Math.round(n).toLocaleString()}`

/**
 * Where a sub's invoice lands on the budget - said out loud on the invoice
 * itself.
 *
 * You used to have to open the Budget tab and work backwards from the sub's
 * name to find out which line moved. Worse, when the sub had no budget line at
 * all the invoice saved happily and the budget simply never moved - real money
 * out, flat budget, no warning anywhere.
 *
 * The destination is not editable here on purpose. An invoice lands wherever
 * its SUBCONTRACT is pointed, so a per-invoice override would let two invoices
 * from one sub hit two different lines and quietly break the contract-to-line
 * total. To send it somewhere else, re-point the subcontract on the Budget tab
 * and every invoice on it moves together.
 */
export function BudgetDestinationBox({
  destination,
  subName,
  amount,
  onCreateLine,
  creating,
  className,
}: {
  destination: BudgetDestination | null | undefined
  subName: string
  /** The invoice amount, when there is one, to check against what's left. */
  amount?: number
  /** Omit to render the warning without the one-click fix. */
  onCreateLine?: () => void
  creating?: boolean
  className?: string
}) {
  if (!destination) {
    return (
      <div className={cn('rounded-lg border border-warn/30 bg-warn-tint px-3 py-2.5 space-y-2', className)}>
        <p className="flex items-start gap-1.5 text-xs font-semibold text-warn">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
          This won&apos;t show up on the budget
        </p>
        <p className="text-xs text-warn/90">
          {subName ? <>{subName} has</> : 'This subcontract has'} no budget line, so paying this invoice
          leaves the budget unchanged. Give it a line and every invoice on this contract lands there.
        </p>
        {onCreateLine && (
          <button
            type="button"
            onClick={onCreateLine}
            disabled={creating}
            className="inline-flex items-center gap-1.5 rounded-md border border-warn/40 bg-panel px-2.5 py-1.5 text-xs font-medium text-warn hover:bg-warn-tint disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {creating ? 'Adding…' : 'Add a budget line for this contract'}
          </button>
        )}
      </div>
    )
  }

  const label = [[destination.cost_code, destination.category].filter(Boolean).join(' · '), destination.description]
    .filter(Boolean).join(' - ')
  // "Left" is what the line can still absorb. Once an invoice is bigger than
  // that, the line is going over and it is better to know before approving.
  const left = destination.remaining
  const over = amount != null && amount > left + 0.005

  return (
    <div className={cn('rounded-lg border border-line bg-surface px-3 py-2.5 space-y-1.5', className)}>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-fg uppercase tracking-wide">
        <Wallet className="h-3.5 w-3.5 text-faint" />
        Lands on the budget
      </p>
      <p className="text-sm font-medium text-ink break-words">{label || 'Budget line'}</p>
      <p className="text-xs text-muted-fg">
        {money(destination.budgeted_amount)} budgeted
        {destination.change_orders_amount !== 0 && (
          <span className="text-faint"> (incl. {money(destination.change_orders_amount)} approved changes)</span>
        )} · {money(destination.billed_amount)} already billed ·{' '}
        <span className={cn('font-semibold', left < 0 ? 'text-danger' : 'text-ink-soft')}>
          {left < 0 ? `${money(Math.abs(left))} over` : `${money(left)} left`}
        </span>
      </p>
      {over && (
        <p className="text-xs font-medium text-danger">
          This invoice is {money(amount! - Math.max(left, 0))} more than that line can still cover.
        </p>
      )}
    </div>
  )
}

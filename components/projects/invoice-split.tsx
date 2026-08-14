'use client'

import { useState } from 'react'
import { Plus, Trash2, Split } from 'lucide-react'
import { cn } from '@/lib/utils'
import { allocatedTotal, unallocated, validateAllocations } from '@/lib/allocations'
import { InfoHint } from '@/components/ui/info-hint'

const money = (n: unknown) =>
  `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`

export interface SplitLineOption {
  id: string
  cost_code: string | null
  category: string
  description: string
  revised_budget: number
  billed_amount: number
}

export interface AllocationRow {
  budget_line_item_id: string
  amount: string
}

const label = (l: SplitLineOption) =>
  [[l.cost_code, l.category].filter(Boolean).join(' · '), l.description].filter(Boolean).join(' - ')

/**
 * Splitting one bill across budget lines.
 *
 * A supplier invoice covers lumber AND windows; a sub's bill is half one line
 * and half another. Neither fits "an invoice belongs to one line".
 *
 * A split does NOT have to use up the invoice - a partly-assigned bill is a
 * normal state and the remainder is shown rather than quietly sent somewhere.
 * It can never exceed the invoice, which is the one mistake that would overstate
 * what has landed on the budget.
 */
export function InvoiceSplit({
  invoiceAmount, lines, value, onChange, onSave, saving, hasContractRoute,
}: {
  invoiceAmount: number
  lines: SplitLineOption[]
  value: AllocationRow[]
  onChange: (rows: AllocationRow[]) => void
  onSave: () => void
  saving: boolean
  /** True when this invoice would otherwise land via its subcontract. */
  hasContractRoute: boolean
}) {
  const [open, setOpen] = useState(value.length > 0)

  const rows = value
  const parsed = rows.map(r => ({ budget_line_item_id: r.budget_line_item_id, amount: r.amount }))
  const total = allocatedTotal(parsed)
  const left = unallocated(invoiceAmount, parsed)
  const problems = validateAllocations(invoiceAmount, parsed)

  const set = (i: number, patch: Partial<AllocationRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  if (!open) {
    return (
      <button type="button" onClick={() => { setOpen(true); onChange([{ budget_line_item_id: '', amount: '' }]) }}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-fg hover:underline">
        <Split className="h-3.5 w-3.5" /> Split this across budget lines
      </button>
    )
  }

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
        Split across budget lines
        <InfoHint className="ml-1 align-middle" text={'Put parts of this one bill on different lines - a supplier invoice covering two trades, or a bill that is only partly this line.\n\nIt does not have to add up to the invoice total. Whatever is left over is simply unassigned, and is shown so it is never a surprise.\n\nWhile a bill has any split on it, the split is the whole story: it stops following its subcontract, so nothing is counted twice.'} />
      </p>

      <div className="mt-2 space-y-2">
        {rows.map((r, i) => {
          const line = lines.find(l => l.id === r.budget_line_item_id)
          return (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={r.budget_line_item_id}
                onChange={e => set(i, { budget_line_item_id: e.target.value })}
                className="min-w-0 flex-1 rounded-md border border-muted2 bg-panel px-2 py-1.5 text-sm text-ink focus:border-accent focus:outline-none"
              >
                <option value="">Pick a budget line…</option>
                {lines.map(l => (
                  <option key={l.id} value={l.id}>{label(l)}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <span className="text-sm text-muted-fg">$</span>
                <input
                  type="number" min="0" step="0.01" value={r.amount}
                  onChange={e => set(i, { amount: e.target.value })}
                  placeholder="0.00"
                  className="w-28 rounded-md border border-muted2 bg-panel px-2 py-1.5 text-sm tabular-nums text-ink focus:border-accent focus:outline-none"
                />
              </div>
              <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))}
                className="p-1 text-faint hover:text-danger" title="Remove this row">
                <Trash2 className="h-4 w-4" />
              </button>
              {line && (
                <p className="w-full text-[11px] text-faint">
                  {money(line.billed_amount)} of {money(line.revised_budget)} already on this line
                </p>
              )}
            </div>
          )
        })}
      </div>

      <button type="button"
        onClick={() => onChange([...rows, { budget_line_item_id: '', amount: '' }])}
        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
        <Plus className="h-3.5 w-3.5" /> Add another line
      </button>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-2.5 text-xs">
        <div className="tabular-nums">
          <span className="text-muted-fg">Split </span>
          <span className="font-semibold text-ink">{money(total)}</span>
          <span className="text-muted-fg"> of {money(invoiceAmount)}</span>
          {left > 0 && (
            <span className={cn('ml-2', hasContractRoute ? 'text-warn' : 'text-faint')}>
              {money(left)} unassigned
              {hasContractRoute && ' - this part will not land anywhere'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <button type="button" onClick={() => { onChange([]); setOpen(false); onSave() }}
              className="text-muted-fg hover:text-danger">Remove the split</button>
          )}
          <button type="button" onClick={onSave} disabled={saving || problems.length > 0}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent/90 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save split'}
          </button>
        </div>
      </div>

      {problems.map((p, i) => (
        <p key={i} className="mt-1.5 text-xs text-danger">{p.message}</p>
      ))}
    </div>
  )
}

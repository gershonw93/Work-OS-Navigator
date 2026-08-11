'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, Table2 } from 'lucide-react'
import { lineTotal, pricedTotal, type ItemLine, type PricedLine } from '@/lib/item-list'

interface Vendor {
  name: string
  lines: PricedLine[]
}

const money = (n: number | null) =>
  n == null ? '-' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

/**
 * The payoff for sending an item list: every bidder priced the same lines, so
 * this is a straight line-for-line read instead of a guess about what each
 * total covered.
 *
 * Lines are matched by the description the GC sent - the bid page never lets a
 * supplier edit those, so the rows line up by construction.
 */
export function LineComparison({ items, vendors }: { items: ItemLine[]; vendors: Vendor[] }) {
  const [open, setOpen] = useState(false)
  if (!items.length) return null

  const priceFor = (v: Vendor, item: ItemLine, i: number): PricedLine | null => {
    const byIndex = v.lines[i]
    if (byIndex && byIndex.description === item.description) return byIndex
    return v.lines.find(l => l.description === item.description) ?? null
  }

  // Where the money actually differs. Totals are for the bottom row; the point
  // of the table is the line that's 3x on one bid and missing on another.
  const totals = vendors.map(v => pricedTotal(v.lines))
  const real = totals.filter(t => t > 0)
  const best = real.length ? Math.min(...real) : null

  return (
    <div className="rounded-xl border border-line bg-surface overflow-hidden">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/40">
        <span className="text-faint shrink-0">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
        <Table2 className="h-4 w-4 text-faint shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink">
            {vendors.length ? 'Compare line by line' : `Item list sent - ${items.length} lines`}
          </span>
          <span className="block text-xs text-muted-fg">
            {vendors.length
              ? `${vendors.length} quote${vendors.length === 1 ? '' : 's'} priced against your ${items.length} lines`
              : 'Each bidder prices these lines, and their numbers land here side by side.'}
          </span>
        </span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-line-soft">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted text-[11px] uppercase tracking-wide text-faint">
                <th className="text-left font-semibold px-3 py-2 min-w-[14rem]">Item</th>
                <th className="text-right font-semibold px-3 py-2 whitespace-nowrap">Qty</th>
                {vendors.map(v => (
                  <th key={v.name} className="text-right font-semibold px-3 py-2 whitespace-nowrap min-w-[7rem]">{v.name}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {items.map((item, i) => {
                const cells = vendors.map(v => {
                  const p = priceFor(v, item, i)
                  return p ? { total: lineTotal({ qty: item.qty, unit_price: p.unit_price }), note: p.vendor_note } : null
                })
                const priced = cells.map(c => c?.total).filter((t): t is number => t != null)
                const low = priced.length > 1 ? Math.min(...priced) : null
                return (
                  <tr key={i} className="align-top">
                    <td className="px-3 py-2 text-ink-soft">
                      {item.description}
                      {item.notes && <span className="block text-[11px] text-faint">{item.notes}</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-fg whitespace-nowrap tabular-nums">
                      {item.qty == null ? '-' : item.qty.toLocaleString()} {item.unit}
                    </td>
                    {cells.map((c, j) => (
                      <td key={j} className={cn('px-3 py-2 text-right tabular-nums whitespace-nowrap',
                        c?.total == null ? 'text-faint'
                          : low != null && c.total === low ? 'font-semibold text-success'
                            : 'text-ink')}>
                        {c?.total == null ? 'not priced' : money(c.total)}
                        {c?.note && <span className="block text-[11px] font-normal text-warn max-w-[12rem] ml-auto text-right">{c.note}</span>}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            {vendors.length > 0 && (
              <tfoot>
                <tr className="bg-muted">
                  <td className="px-3 py-2.5 text-sm font-semibold text-ink" colSpan={2}>Total</td>
                  {totals.map((t, j) => (
                    <td key={j} className={cn('px-3 py-2.5 text-right text-sm font-bold tabular-nums whitespace-nowrap',
                      best != null && t === best ? 'text-success' : 'text-ink')}>
                      {money(t)}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </div>
  )
}

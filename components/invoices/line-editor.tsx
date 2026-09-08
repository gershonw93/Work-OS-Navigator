'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  reconcile, reconciliationNote, linesTotal, lineAmount,
  taxLineConflicts, taxConflictNote, type InvoiceLine,
} from '@/lib/invoice-lines'

/**
 * The breakdown on a bill: what is being charged for, plus tax and retainage.
 *
 * WHY THIS IS A COMPONENT NOW. It existed only inside the create form, so a
 * wrong line meant deleting the whole bill and re-scanning the document - and
 * the invoice card advertised the feature that did not exist: "Scanning the
 * vendor's PDF reads the lines off it, or you can add them with Edit." Edit did
 * no such thing. The server has accepted `line_items` on PATCH the whole time.
 *
 * AND TAX HAD NO INPUT AT ALL. It was written once by the scanner and then
 * invisible and uneditable, so a bill entered by hand had nowhere to put tax
 * except a line item - and a scanned bill's tax could not be zeroed to
 * compensate when somebody added one anyway. That is the "$62 more than the
 * total" warning: the same tax counted in the field and in a line.
 *
 * Editing lines is safe for QuickBooks: `billPayload` sends a single-line Bill
 * carrying the TOTAL, so line items are not represented over there and cannot
 * drift. Only `amount` can, and that has its own guarded path.
 */
export function LineEditor({
  lines, onLines, tax, onTax, retainage, amount, className,
}: {
  lines: InvoiceLine[]
  onLines: (next: InvoiceLine[]) => void
  tax: string
  onTax: (next: string) => void
  retainage?: number | null
  /** The bill total the breakdown is checked against. */
  amount: number | null
  className?: string
}) {
  const rec = reconcile({ lines, tax, retainage, amount })
  const note = reconciliationNote(rec)
  const conflicts = taxLineConflicts({ lines, tax })
  const conflictNote = taxConflictNote(conflicts, tax)

  const set = (i: number, patch: Partial<InvoiceLine>) =>
    onLines(lines.map((x, ix) => (ix === i ? { ...x, ...patch } : x)))

  /** Fold the tax-looking lines into the tax field, keeping the money once. */
  const foldIntoTax = () => {
    const folded = conflicts.reduce((sum, c) => sum + (c.amount ?? 0), 0)
    const keep = new Set(conflicts.map(c => c.index))
    onLines(lines.filter((_, i) => !keep.has(i)))
    onTax(String(Number(tax || 0) === folded ? folded : folded))
  }

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-soft">What is being charged for</span>
        <button type="button"
          onClick={() => onLines([...lines, { description: '', amount: null }])}
          className="text-xs font-medium text-accent-fg hover:underline">
          + Add a line
        </button>
      </div>

      {lines.length === 0 ? (
        <p className="text-xs text-faint">
          No breakdown. Add lines to record what the charges are — or leave it and the
          bill keeps just its total.
        </p>
      ) : (
        <div className="rounded-lg border border-line divide-y divide-line-soft">
          {lines.map((li, idx) => (
            <div key={idx} className={cn('flex items-center gap-2 px-2 py-1.5',
              conflicts.some(c => c.index === idx) && 'bg-warn-tint')}>
              <input
                value={li.description ?? ''}
                onChange={e => set(idx, { description: e.target.value })}
                placeholder="What it is"
                className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
              />
              {li.qty != null && li.unit_price != null && (
                <span className="text-[11px] text-faint shrink-0 tabular-nums">
                  {li.qty}{li.unit ? ` ${li.unit}` : ''} × ${li.unit_price}
                </span>
              )}
              <input
                type="number" step="0.01"
                value={li.amount ?? ''}
                onChange={e => set(idx, { amount: e.target.value === '' ? null : Number(e.target.value) })}
                placeholder="0.00"
                className="w-24 shrink-0 bg-transparent text-sm text-ink text-right outline-none tabular-nums placeholder:text-faint"
              />
              <button type="button" onClick={() => onLines(lines.filter((_, i) => i !== idx))}
                className="shrink-0 p-1 text-faint hover:text-danger" title="Remove this line">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between px-2 py-1.5 bg-surface text-xs">
            <span className="text-muted-fg">
              {lines.length} line{lines.length !== 1 ? 's' : ''}
              {Number(tax) ? ` + $${Number(tax).toLocaleString()} tax` : ''}
              {retainage ? ` − $${Number(retainage).toLocaleString()} retainage` : ''}
            </span>
            <span className={cn('font-semibold tabular-nums', rec.balanced ? 'text-success' : 'text-ink')}>
              ${linesTotal(lines).toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* The field that did not exist. Without it, tax on a hand-entered bill
          had nowhere to go but a line, and a scan's tax could not be corrected. */}
      <div className="flex items-center gap-2 pt-1">
        <label className="text-xs text-muted-fg shrink-0">Tax</label>
        <input
          type="number" step="0.01" value={tax}
          onChange={e => onTax(e.target.value)}
          placeholder="0.00"
          className="w-28 rounded-md border border-muted2 bg-panel px-2 py-1 text-sm text-right tabular-nums focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-faint">charged on top of the lines above</span>
      </div>

      {/* Said AS IT IS TYPED, and never acted on without being asked. Silently
          folding a line into a field changes somebody's numbers without telling
          them, and the scan is not always right about what counts as tax. */}
      {conflictNote && (
        <div className="rounded-lg border border-warn/30 bg-warn-tint px-3 py-2 space-y-2">
          <p className="text-xs text-warn">{conflictNote}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={foldIntoTax}
              className="rounded-md border border-warn/40 bg-panel px-2 py-1 text-xs font-medium text-ink-soft hover:border-warn">
              Fold {conflicts.length === 1 ? 'it' : 'them'} into the tax field
            </button>
            <button type="button" onClick={() => onTax('')}
              className="rounded-md border border-line bg-panel px-2 py-1 text-xs font-medium text-muted-fg hover:text-ink">
              Keep the line{conflicts.length === 1 ? '' : 's'}, clear the tax field
            </button>
          </div>
        </div>
      )}

      {note && <p className="text-xs text-warn">{note}</p>}
      {rec.balanced && <p className="text-xs text-success">The breakdown adds up to the total.</p>}
    </div>
  )
}

'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Upload, ClipboardPaste, ListPlus, Loader2, ChevronDown, ChevronRight } from 'lucide-react'
import { UNITS, emptyLine, parsePastedRows, type ItemLine } from '@/lib/item-list'

/**
 * The list of lines a supplier prices one by one.
 *
 * Deliberately optional and collapsed by default. Most packages never need one -
 * a foundation sub quotes off the plans. You need it when you're buying the
 * material and somebody has to count it, and that's exactly when a total-only
 * quote is useless.
 */
export function ItemListEditor({
  value, onChange, hint,
}: {
  value: ItemLine[]
  onChange: (next: ItemLine[]) => void
  /** Extra nudge from the trade template, e.g. "you're supplying the material". */
  hint?: string
}) {
  const supabase = createClient()
  const [open, setOpen] = useState(value.length > 0)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (i: number, patch: Partial<ItemLine>) =>
    onChange(value.map((l, j) => (j === i ? { ...l, ...patch } : l)))

  function addRow() {
    onChange([...value, emptyLine()])
    if (!open) setOpen(true)
  }

  async function importFile(file: File) {
    setError(''); setImporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/item-list/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { setError(body.error ?? 'Could not read that file.'); return }
      const items: ItemLine[] = body.items ?? []
      if (!items.length) { setError('No line items found in that file. Check the sheet, or paste the rows instead.'); return }
      onChange([...value, ...items])
      setOpen(true)
    } catch {
      setError('Could not read that file.')
    } finally {
      setImporting(false)
    }
  }

  function applyPaste() {
    const items = parsePastedRows(pasteText)
    if (!items.length) { setError('Nothing recognisable in that. Copy the rows from your spreadsheet including quantities.'); return }
    onChange([...value, ...items])
    setPasteText(''); setShowPaste(false); setError(''); setOpen(true)
  }

  return (
    <div className="rounded-xl border border-line bg-surface">
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = '' }} />

      <button type="button" onClick={() => setOpen(o => !o)}
        className="w-full flex items-start gap-2 px-4 py-3 text-left">
        <span className="mt-0.5 text-faint shrink-0">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-ink">
            Item list <span className="font-normal text-faint">- optional</span>
            {value.length > 0 && (
              <span className="ml-2 rounded-full bg-accent-tint px-2 py-0.5 text-[11px] font-semibold text-accent-fg">
                {value.length} line{value.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
          <span className="block text-xs text-muted-fg mt-0.5">
            {value.length > 0
              ? 'Every bidder prices these same lines, so the quotes compare exactly.'
              : 'Add one when you’re buying the material - lumber, trusses, mouldings, windows. Skip it otherwise.'}
          </span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3">
          {hint && (
            <p className="rounded-lg bg-warn-tint px-3 py-2 text-xs text-warn">{hint}</p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing} className="gap-1.5">
              {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Import takeoff</>}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShowPaste(v => !v)} className="gap-1.5">
              <ClipboardPaste className="h-3.5 w-3.5" /> Paste rows
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={addRow} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add line
            </Button>
            {value.length > 0 && (
              <button type="button" onClick={() => onChange([])}
                className="ml-auto text-xs text-faint hover:text-danger">Clear all</button>
            )}
          </div>

          {showPaste && (
            <div className="space-y-1.5">
              <Label className="text-xs">Paste straight from Excel or Sheets</Label>
              <textarea rows={5} value={pasteText} onChange={e => setPasteText(e.target.value)}
                placeholder={'2x6 x 16′ SPF #2\t148\tea\n7/16 OSB sheathing\t210\tsheet\nLVL 1-3/4 x 11-7/8\t14\tlf'}
                className="w-full rounded-md border border-muted2 bg-panel px-3 py-2 font-mono text-xs text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none" />
              <div className="flex gap-2">
                <Button type="button" size="sm" onClick={applyPaste} disabled={!pasteText.trim()}>Add these lines</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => { setShowPaste(false); setPasteText('') }}>Cancel</Button>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          {value.length === 0 ? (
            <div className="rounded-lg border border-dashed border-muted2 px-3 py-6 text-center">
              <ListPlus className="h-5 w-5 text-faint mx-auto mb-2" />
              <p className="text-xs text-muted-fg">
                No lines yet. Import a takeoff, paste rows from a spreadsheet, or add them one at a time.
              </p>
            </div>
          ) : (
            <div className="rounded-lg border border-line overflow-hidden">
              <div className="hidden sm:grid grid-cols-[1fr_5rem_5rem_1fr_2rem] gap-2 bg-muted px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
                <span>Item</span><span>Qty</span><span>Unit</span><span>Spec / notes</span><span />
              </div>
              <div className="divide-y divide-line-soft max-h-[26rem] overflow-y-auto">
                {value.map((line, i) => (
                  <div key={i} className="grid grid-cols-[1fr_2rem] sm:grid-cols-[1fr_5rem_5rem_1fr_2rem] gap-2 px-3 py-2 items-center">
                    <Input value={line.description} onChange={e => set(i, { description: e.target.value })}
                      placeholder="e.g. 2x6 x 16' SPF #2" className="h-8 text-sm col-span-1" />
                    <Input type="number" inputMode="decimal" value={line.qty ?? ''}
                      onChange={e => set(i, { qty: e.target.value === '' ? null : Number(e.target.value) })}
                      placeholder="Qty" className="h-8 text-sm" />
                    <Input list="sytenav-units" value={line.unit} onChange={e => set(i, { unit: e.target.value })}
                      placeholder="ea" className="h-8 text-sm" />
                    <Input value={line.notes ?? ''} onChange={e => set(i, { notes: e.target.value })}
                      placeholder="optional" className="h-8 text-sm" />
                    <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}
                      className="justify-self-end text-faint hover:text-danger" aria-label="Remove line">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <datalist id="sytenav-units">{UNITS.map(u => <option key={u} value={u} />)}</datalist>
        </div>
      )}
    </div>
  )
}

/** Read-only view of the lines, for anyone who isn't editing them. */
export function ItemListView({ items, title = 'Item list' }: { items: ItemLine[]; title?: string }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint font-semibold mb-2">{title} ({items.length})</p>
      <div className="rounded-lg border border-line overflow-hidden">
        <div className="divide-y divide-line-soft">
          {items.map((l, i) => (
            <div key={i} className="flex items-baseline gap-3 px-3 py-2">
              <span className="flex-1 min-w-0 text-sm text-ink-soft">
                {l.description}
                {l.notes && <span className="block text-[11px] text-faint">{l.notes}</span>}
              </span>
              <span className={cn('shrink-0 text-sm tabular-nums', l.qty == null ? 'text-faint' : 'text-ink')}>
                {l.qty == null ? '-' : l.qty.toLocaleString()} {l.unit}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

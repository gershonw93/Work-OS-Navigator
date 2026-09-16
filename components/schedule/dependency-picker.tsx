'use client'

import { useState } from 'react'
import { Link2, Loader2, Plus, Trash2, X } from 'lucide-react'

// "Depends on another trade?" - asked after the dates, never before them.
//
// TWO RULES FROM THE SPEC, both of which are about not stopping somebody:
//
//   - If the trade they need has no line yet, they can make a PLACEHOLDER from
//     right here. Sending somebody off to create a line and come back is how a
//     dependency never gets recorded at all.
//   - The whole thing is optional and collapsed. A schedule line that waits for
//     nothing is the common case.
//
// The Add button OPENS; it does not toggle. After a failed save the form is
// already open, which is exactly when somebody presses the button again.

export interface PickableLine {
  id: string
  name: string
  start_date: string
  end_date: string
  hasSub: boolean
}

export interface ExistingDependency {
  id: string
  predecessor_task_id: string
  min_predecessor_progress: number | null
  lag_days: number
  predecessorName: string
}

export function DependencyPicker({
  lines, existing, selfId, onAdd, onRemove, onAddPlaceholder,
}: {
  /** Every line on this project except this one. Placeholders included. */
  lines: PickableLine[]
  existing: ExistingDependency[]
  selfId: string | null
  onAdd: (input: { predecessor_task_id: string; min_predecessor_progress: number | null; lag_days: number }) => Promise<string | null>
  onRemove: (dependencyId: string) => Promise<void>
  onAddPlaceholder: (trade: string) => Promise<PickableLine | null>
}) {
  const [open, setOpen] = useState(false)
  const [predecessor, setPredecessor] = useState('')
  const [progress, setProgress] = useState('')
  const [lag, setLag] = useState('0')
  const [problem, setProblem] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [addingPlaceholder, setAddingPlaceholder] = useState(false)
  const [placeholderTrade, setPlaceholderTrade] = useState('')

  const available = lines.filter(l => l.id !== selfId && !existing.some(e => e.predecessor_task_id === l.id))

  async function add() {
    // Asked at the FIELD with the same rule the route uses. A server's answer
    // can only arrive as a message about a whole request that did not happen.
    if (!predecessor) { setProblem('Pick the trade this one waits for.') ; return }
    const pct = progress.trim() === '' ? null : Number(progress)
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setProblem('How far along has to be between 0 and 100.'); return
    }
    const lagDays = Number(lag || 0)
    if (!Number.isInteger(lagDays) || lagDays < 0) { setProblem('Lag has to be a whole number of days.'); return }

    setProblem(null); setSaving(true)
    try {
      const err = await onAdd({ predecessor_task_id: predecessor, min_predecessor_progress: pct, lag_days: lagDays })
      if (err) { setProblem(err); return }
      setPredecessor(''); setProgress(''); setLag('0'); setOpen(false)
    } finally { setSaving(false) }
  }

  async function addPlaceholder() {
    const trade = placeholderTrade.trim()
    if (!trade) { setProblem('Give the trade a name.'); return }
    setProblem(null); setSaving(true)
    try {
      const line = await onAddPlaceholder(trade)
      if (line) { setPredecessor(line.id); setPlaceholderTrade(''); setAddingPlaceholder(false) }
      else setProblem('Could not add that line.')
    } finally { setSaving(false) }
  }

  const field = 'w-full rounded-lg border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none'

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Link2 className="h-4 w-4 text-muted-fg" />
          Depends on another trade?
        </h3>
        {!open && (
          <button type="button" onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-panel">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {existing.length > 0 && (
        <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line bg-panel">
          {existing.map(d => (
            <li key={d.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">Waits for {d.predecessorName}</p>
                <p className="text-xs text-muted-fg">
                  {d.min_predecessor_progress != null ? `until it is ${d.min_predecessor_progress}% along` : 'until it finishes'}
                  {d.lag_days > 0 && `, then ${d.lag_days} ${d.lag_days === 1 ? 'day' : 'days'} later`}
                </p>
              </div>
              {/* No hover-reveal: there is no hover on a phone, and invisible
                  is indistinguishable from absent. */}
              <button type="button" onClick={() => onRemove(d.id)} aria-label={`Unlink ${d.predecessorName}`} title="Unlink"
                className="shrink-0 rounded-lg p-2 text-muted-fg hover:bg-surface hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 space-y-2">
          <div>
            <label htmlFor="dep-pred" className="mb-1 block text-sm font-medium text-muted-fg lg:text-xs">
              Waits for *
            </label>
            {/* Starts EMPTY. A useState default on a required select is a claim,
                and it disarms the `required` beside it. */}
            <select id="dep-pred" className={field} value={predecessor} onChange={e => setPredecessor(e.target.value)}>
              <option value="">-- Select --</option>
              {available.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.start_date} to {l.end_date}){l.hasSub ? '' : ' - no sub yet'}
                </option>
              ))}
            </select>
          </div>

          {!addingPlaceholder ? (
            <button type="button" onClick={() => setAddingPlaceholder(true)}
              className="text-xs font-medium text-accent-fg hover:underline">
              The trade I need has no line yet
            </button>
          ) : (
            <div className="rounded-lg border border-line bg-panel p-2">
              <label htmlFor="dep-placeholder" className="mb-1 block text-sm font-medium text-muted-fg lg:text-xs">
                Trade name * (dates TBD - you can set them later)
              </label>
              <div className="flex gap-2">
                <input id="dep-placeholder" className={field} value={placeholderTrade} placeholder="Sheetrock"
                  onChange={e => setPlaceholderTrade(e.target.value)} />
                <button type="button" onClick={addPlaceholder} disabled={saving}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add line'}
                </button>
                <button type="button" onClick={() => { setAddingPlaceholder(false); setPlaceholderTrade('') }}
                  aria-label="Cancel adding a line" title="Cancel"
                  className="shrink-0 rounded-lg p-2 text-muted-fg hover:bg-surface">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="row-even lg:flex lg:gap-2">
            <div>
              <label htmlFor="dep-progress" className="mb-1 block text-sm font-medium text-muted-fg lg:text-xs">
                How far along? (optional)
              </label>
              <input id="dep-progress" type="number" min={0} max={100} className={field}
                value={progress} placeholder="e.g. 80" onChange={e => setProgress(e.target.value)} />
            </div>
            <div>
              <label htmlFor="dep-lag" className="mb-1 block text-sm font-medium text-muted-fg lg:text-xs">
                Days in between (optional)
              </label>
              <input id="dep-lag" type="number" min={0} className={field}
                value={lag} onChange={e => setLag(e.target.value)} />
            </div>
          </div>

          {problem && <p className="text-xs text-danger">{problem}</p>}

          <div className="row-even lg:flex lg:justify-end lg:gap-2">
            {/* Disabled only for IN FLIGHT. A greyed-out button explains
                nothing; let it fire and answer with the missing field. */}
            <button type="button" onClick={add} disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Link
            </button>
            <button type="button" onClick={() => { setOpen(false); setProblem(null) }} disabled={saving}
              className="whitespace-nowrap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-panel disabled:opacity-60">
              Cancel
            </button>
          </div>
        </div>
      )}

      {!open && existing.length === 0 && (
        <p className="mt-1 text-xs text-muted-fg">Nothing - it can start whenever it is scheduled.</p>
      )}
    </div>
  )
}

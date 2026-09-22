'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Link2, Loader2, Plus, Trash2, X } from 'lucide-react'
import { formatDateShort } from '@/lib/dates'
import { linkSentence, deliveryGateProblem, type LineKind } from '@/lib/schedule-link-words'

// "Can't start till another trade finishes?" - asked after the dates.
//
// THE THREE THINGS REPORTED, all of them fair:
//
//   "why is it a 2 step"
//       Adding a link used to save itself immediately, through its own route,
//       while "Save Changes" saved the label and dates - so one dialog had two
//       buttons that each saved a different half, and pressing Cancel after
//       Link had already written something. NOTHING here saves on its own now.
//       Everything is staged and "Save Changes" commits the lot; Cancel really
//       does cancel. Removing a link somebody saved earlier is staged too, or
//       the dialog would be honest in one direction and not the other.
//
//   "it doesnt say %"
//       A number box labelled "How far along?" is a number with no unit. The
//       sign is IN the row now, after the field, where the value is.
//
//   "how far along between needs a or between the 2 options or something"
//       Two optional boxes side by side with no statement of how they relate.
//       They are not alternatives and they are not a pair - each finishes a
//       different sentence about the same link, so each is written as one:
//       "Don't start until they are [80] % done" and "Then wait [0] days
//       before starting". The heading above them says what leaving both blank
//       means, which is the common case and was never stated anywhere.

export interface PickableLine {
  id: string
  name: string
  start_date: string
  end_date: string
  hasSub: boolean
  /** A delivery is not a trade, and the sentence and the gate both differ. */
  kind: LineKind
}

export interface ExistingDependency {
  id: string
  predecessor_task_id: string
  /** A NUMERIC column comes back QUOTED - "80.00". Read it with `pctLabel`. */
  min_predecessor_progress: number | string | null
  lag_days: number
  predecessorName: string
  predecessorKind: LineKind
}

/** A link somebody has built here but not saved yet. */
export interface PendingDependency {
  predecessor_task_id: string
  min_predecessor_progress: number | string | null
  lag_days: number
  predecessorName: string
  predecessorKind: LineKind
}

export function DependencyPicker({
  lines, existing, existingState, pending, removing, selfId,
  onStage, onUnstage, onStageRemoval, onUndoRemoval, onAddPlaceholder,
}: {
  /** Every line on this project except this one. Placeholders included. */
  lines: PickableLine[]
  /** Links already saved against this line. */
  existing: ExistingDependency[]
  /**
   * Whether `existing` is an ANSWER yet.
   *
   * THE REPORT: "open a linked row's Edit Item and the dependency section says
   * 'Nothing - it can start whenever it is scheduled.' even though a link
   * exists; clicking Add or reopening makes it appear." The links are fetched
   * when the dialog opens and `existing` is `[]` until they land - so an empty
   * array meant BOTH "still asking" and "there are none", and the panel stated
   * the second one confidently. Pressing Add only appeared to fix it: Add hides
   * that sentence, and by then the fetch had landed.
   *
   * Intermittent for the obvious reason - on a fast request the window is a
   * blink. A 'failed' load renders the same sentence, which is worse: a stale
   * token would tell somebody their links were gone.
   */
  existingState: 'loading' | 'ready' | 'failed'
  /** Links built here and waiting for Save Changes. */
  pending: PendingDependency[]
  /** Ids of saved links marked for removal on save. */
  removing: string[]
  selfId: string | null
  onStage: (d: PendingDependency) => void
  onUnstage: (predecessorTaskId: string) => void
  onStageRemoval: (dependencyId: string) => void
  onUndoRemoval: (dependencyId: string) => void
  onAddPlaceholder: (trade: string) => Promise<PickableLine | null>
}) {
  const [open, setOpen] = useState(false)
  const [predecessor, setPredecessor] = useState('')
  const [progress, setProgress] = useState('')
  const [lag, setLag] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  // Collapsed on purpose - see the comment beside it.
  const [showMore, setShowMore] = useState(false)

  const [addingPlaceholder, setAddingPlaceholder] = useState(false)
  const [placeholderTrade, setPlaceholderTrade] = useState('')
  const [savingPlaceholder, setSavingPlaceholder] = useState(false)

  const taken = new Set([
    ...existing.map(e => e.predecessor_task_id),
    ...pending.map(p => p.predecessor_task_id),
  ])
  // A picker must not offer to add what it is already showing you.
  const available = lines.filter(l => l.id !== selfId && !taken.has(l.id))

  // A DELIVERY IS NOT A TRADE. It lands or it does not, so it takes different
  // words and must never be offered a percent - see `deliveryGateProblem`.
  const picked = lines.find(l => l.id === predecessor) ?? null
  const pickedKind: LineKind = picked?.kind ?? 'work'
  const pickedIsDelivery = pickedKind === 'delivery'

  function add() {
    // Asked at the FIELD, with our own words.
    if (!predecessor) { setProblem('Pick the trade this one comes after.'); return }
    const pct = progress.trim() === '' ? null : Number(progress)
    if (pct != null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      setProblem('How far along has to be a number between 0 and 100.'); return
    }
    // The SAME function the dependencies route asks. A gate on a delivery can
    // never open, which looks exactly like a gate that is working.
    const deliveryProblem = deliveryGateProblem(pickedKind, pct)
    if (deliveryProblem) { setProblem(deliveryProblem); return }
    const lagDays = lag.trim() === '' ? 0 : Number(lag)
    if (!Number.isInteger(lagDays) || lagDays < 0) {
      setProblem('Days to wait has to be a whole number, 0 or more.'); return
    }

    setProblem(null)
    onStage({
      predecessor_task_id: predecessor,
      min_predecessor_progress: pct,
      lag_days: lagDays,
      predecessorName: picked?.name ?? 'that line',
      predecessorKind: pickedKind,
    })
    setPredecessor(''); setProgress(''); setLag(''); setShowMore(false); setOpen(false)
  }

  async function addPlaceholder() {
    const trade = placeholderTrade.trim()
    if (!trade) { setProblem('Give the trade a name.'); return }
    setProblem(null); setSavingPlaceholder(true)
    try {
      const line = await onAddPlaceholder(trade)
      if (line) { setPredecessor(line.id); setPlaceholderTrade(''); setAddingPlaceholder(false) }
      else setProblem('Could not add that line.')
    } finally { setSavingPlaceholder(false) }
  }

  /**
   * "After Framing hits 80%, plus 2 days" - how a link reads back.
   *
   * `linkSentence` owns the wording AND reads the percent through `pctLabel`:
   * the column is NUMERIC and comes back as the string "80.00", which prints a
   * trailing .00 nobody typed.
   */
  function describe(d: {
    predecessorName: string
    predecessorKind?: LineKind
    min_predecessor_progress: number | string | null
    lag_days: number
  }) {
    // ONE HOME FOR THE SENTENCE. The review screen says the same fact in its
    // own words; three wordings of one link is how "waits on Sheetrock" came
    // to print for an 80% link and a plain one alike.
    return linkSentence({
      predecessorName: d.predecessorName,
      predecessorKind: d.predecessorKind ?? 'work',
      gate: { pct: d.min_predecessor_progress, lagDays: d.lag_days },
    })
  }

  const field = 'rounded-lg border border-muted2 bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none'
  const nothingLinked = existing.length === 0 && pending.length === 0

  return (
    <div className="rounded-xl border border-line bg-surface p-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <Link2 className="h-4 w-4 text-muted-fg" />
          Can&apos;t start till another trade finishes?
        </h3>
        {!open && available.length > 0 && (
          <button type="button" onClick={() => { setOpen(true); setProblem(null) }}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface">
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {(existing.length > 0 || pending.length > 0) && (
        <ul className="mt-2 divide-y divide-line-soft rounded-lg border border-line bg-panel">
          {existing.map(d => {
            const marked = removing.includes(d.id)
            return (
              <li key={d.id} className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
                <p className={`min-w-0 truncate text-sm ${marked ? 'text-faint line-through' : 'text-ink'}`}>
                  {describe(d)}
                </p>
                {marked ? (
                  <button type="button" onClick={() => onUndoRemoval(d.id)}
                    className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-medium text-accent-fg hover:bg-surface">
                    Undo
                  </button>
                ) : (
                  <button type="button" onClick={() => onStageRemoval(d.id)}
                    aria-label={`Remove the link to ${d.predecessorName}`} title="Remove"
                    className="shrink-0 rounded-lg p-2 text-muted-fg hover:bg-surface hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            )
          })}
          {pending.map(d => (
            <li key={d.predecessor_task_id} className="flex min-w-0 items-center justify-between gap-2 bg-surface px-3 py-2">
              <p className="min-w-0 truncate text-sm text-ink">{describe(d)}</p>
              <button type="button" onClick={() => onUnstage(d.predecessor_task_id)}
                aria-label={`Remove the link to ${d.predecessorName}`} title="Remove"
                className="shrink-0 rounded-lg p-2 text-muted-fg hover:bg-panel hover:text-danger">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="mt-3 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="dep-pred" className="block text-sm font-medium text-muted-fg lg:text-xs">
              After: <span className="text-danger">*</span>
            </label>
            {/* Starts EMPTY. A useState default on a required select is a claim. */}
            <select id="dep-pred" className={`w-full ${field}`} value={predecessor}
              onChange={e => setPredecessor(e.target.value)}>
              <option value="">-- Select --</option>
              {available.map(l => (
                <option key={l.id} value={l.id}>
                  {l.name} ({formatDateShort(l.start_date)} to {formatDateShort(l.end_date)}){l.hasSub ? '' : ' - no sub yet'}
                </option>
              ))}
            </select>
          </div>

          {!addingPlaceholder ? (
            <button type="button" onClick={() => { setAddingPlaceholder(true); setProblem(null) }}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-surface">
              <Plus className="h-3.5 w-3.5" /> My trade&apos;s not here
            </button>
          ) : (
            <div className="rounded-lg border border-line bg-panel p-2">
              <label htmlFor="dep-placeholder" className="mb-1 block text-sm font-medium text-muted-fg lg:text-xs">
                Trade name <span className="text-danger">*</span>
                <span className="font-normal"> - dates TBD, you can set them later</span>
              </label>
              <div className="flex gap-2">
                <input id="dep-placeholder" className={`w-full ${field}`} value={placeholderTrade} placeholder="Sheetrock"
                  onChange={e => setPlaceholderTrade(e.target.value)} />
                <button type="button" onClick={addPlaceholder} disabled={savingPlaceholder}
                  className="shrink-0 whitespace-nowrap rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60">
                  {savingPlaceholder ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add line'}
                </button>
                <button type="button" onClick={() => { setAddingPlaceholder(false); setPlaceholderTrade('') }}
                  aria-label="Cancel adding a line" title="Cancel"
                  className="shrink-0 rounded-lg p-2 text-muted-fg hover:bg-surface">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* NINETY PERCENT OF THE JOB IS "after the sheetrock guy".
              The percent gate and the extra days are real, and they were in
              everybody's way: two boxes on the main path for a question almost
              nobody is asking. Behind a tap, off by default, and the summary
              on the tap says what they do so nobody has to open it to find out. */}
          {!showMore ? (
            <button type="button" onClick={() => setShowMore(true)}
              className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1 py-1.5 text-xs font-medium text-accent-fg hover:underline">
              <ChevronDown className="h-3.5 w-3.5" />{' '}
              {pickedIsDelivery ? 'More options - leave extra days' : 'More options - wait for a %, or leave extra days'}
            </button>
          ) : (
            <div className="rounded-lg border border-line-soft bg-panel p-2.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-fg">Leave these blank and it starts when they&apos;re done.</p>
                <button type="button" onClick={() => setShowMore(false)}
                  aria-label="Hide the extra options" title="Hide"
                  className="shrink-0 rounded-lg p-1 text-muted-fg hover:bg-surface">
                  <ChevronUp className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 space-y-2">
                {/* A DELIVERY EITHER ARRIVES OR IT DOES NOT. Offering a percent
                    here builds a gate that can never open - nothing ever sets a
                    delivery's progress, and an unknown predecessor blocks. */}
                {pickedIsDelivery ? (
                  <p className="text-sm text-muted-fg">
                    A delivery either arrives or it doesn&apos;t - there&apos;s no percent on one.
                  </p>
                ) : (
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <label htmlFor="dep-progress" className="whitespace-nowrap">Wait till they&apos;re</label>
                  <span className="inline-flex items-center gap-1">
                    <input id="dep-progress" type="number" min={0} max={100} inputMode="numeric"
                      className={`w-20 ${field}`} value={progress} placeholder="80"
                      onChange={e => setProgress(e.target.value)} />
                    <span className="text-muted-fg">%</span>
                  </span>
                  <span className="whitespace-nowrap">done</span>
                </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <label htmlFor="dep-lag" className="whitespace-nowrap">Plus</label>
                  <input id="dep-lag" type="number" min={0} inputMode="numeric"
                    className={`w-20 ${field}`} value={lag} placeholder="0"
                    onChange={e => setLag(e.target.value)} />
                  <span className="whitespace-nowrap">extra days</span>
                </div>
              </div>
            </div>
          )}

          {problem && <p className="text-xs text-danger">{problem}</p>}

          <div className="row-even lg:flex lg:justify-end lg:gap-2">
            {/* Labelled "Save" because that is the word asked for, but it
                still WRITES NOTHING - it puts the link in the list above, and
                "Save Changes" at the foot of the dialog is the only thing that
                reaches the database. Two buttons reading Save is a real risk of
                the same "why is it a 2 step" confusion; flagged to the owner
                rather than quietly overruled. */}
            <button type="button" onClick={add}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90">
              Save
            </button>
            <button type="button" onClick={() => { setOpen(false); setProblem(null) }}
              className="whitespace-nowrap rounded-lg border border-line bg-panel px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Three states, not one. "Loading" and "failed" are different facts
          from "there are none", and only the last of them may be stated. */}
      {existingState === 'loading' && pending.length === 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-fg">
          <Loader2 className="h-3 w-3 animate-spin" /> Checking what this waits for...
        </p>
      )}

      {existingState === 'failed' && (
        <p className="mt-1 text-xs text-warn">
          Could not load this line&apos;s links - this is not the same as it having none.
          Reload the page before changing anything here.
        </p>
      )}

      {existingState === 'ready' && !open && nothingLinked && (
        <p className="mt-1 text-xs text-muted-fg">
          {available.length === 0
            ? 'There is nothing else on this schedule to wait for yet.'
            : 'Nothing - it can start whenever it is scheduled.'}
        </p>
      )}

      {(pending.length > 0 || removing.length > 0) && (
        <p className="mt-2 text-xs text-muted-fg">
          Not saved yet - press Save Changes below.
        </p>
      )}
    </div>
  )
}

'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Mail } from 'lucide-react'
import type { LineGateState } from '@/lib/schedule-unblocked'

// "These are clear to start." The screen between an opened gate and a sub's
// inbox.
//
// THE REVIEW SCREEN IS THE FEATURE. The route that sends these emails has
// existed since the percent gate shipped and had no caller anywhere in the
// repository, so the release note promising the letter, the public guide
// describing it, and the Settings toggle offering to turn it off were all
// describing something that had never happened once.
//
// Same rules as CascadeReview beside it: nothing goes out without a press,
// `.overlay` + `data-overlay` rather than a hand-rolled `fixed inset-0`, and
// the panel caps itself rather than reaching for a vh that knows nothing
// about the notch.

export interface UnblockedSub {
  taskId: string
  companyName: string
  email: string | null
}

export function UnblockedReview({
  rows, subs, projectName, onConfirm, onCancel,
}: {
  /** Already filtered to clear-and-untold by `clearToTell`. */
  rows: LineGateState[]
  /** Who each line's letter would go to, keyed by task. */
  subs: Record<string, UnblockedSub | undefined>
  projectName: string | null
  onConfirm: (taskIds: string[]) => Promise<void>
  onCancel: () => void
}) {
  // EVERY ROW STARTS TICKED. This screen opens because somebody pressed a
  // button that said these were ready to be told - starting empty would make
  // the commonest press a no-op, which reads as a dead button.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(rows.map(r => r.taskId)))
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setPicked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function go() {
    setBusy(true)
    // try/finally, always: `setBusy(false)` as the last statement of the happy
    // path leaves the dialog spinning for ever on a throw.
    try { await onConfirm(Array.from(picked)) } finally { setBusy(false) }
  }

  const chosen = rows.filter(r => picked.has(r.taskId))
  const withEmail = chosen.filter(r => subs[r.taskId]?.email)
  const withoutEmail = chosen.filter(r => !subs[r.taskId]?.email)

  return (
    <div className="overlay" data-overlay role="dialog" aria-modal="true" aria-label="Tell the subs who are clear to start">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            {rows.length} {rows.length === 1 ? 'trade is' : 'trades are'} clear to start
          </h2>
          <p className="mt-0.5 text-sm text-muted-fg">
            The work they were waiting on has reached the percent you set
            {projectName ? ` on ${projectName}` : ''}. Nothing is sent until you press the button.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto">
          <ul className="divide-y divide-line-soft">
            {rows.map(r => {
              const sub = subs[r.taskId]
              return (
                <li key={r.taskId} className="px-5 py-3">
                  {/* The whole row is the control - a 44px target rather than
                      a 16px box somebody has to hit on a phone. */}
                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox" checked={picked.has(r.taskId)} disabled={busy}
                      onChange={() => toggle(r.taskId)}
                      className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-baseline justify-between gap-3">
                        <span className="min-w-0 truncate text-sm font-medium text-ink">{r.taskName}</span>
                        {r.taskStart && (
                          <span className="whitespace-nowrap text-xs text-muted-fg">starts {r.taskStart}</span>
                        )}
                      </span>
                      {/* WHY IT IS CLEAR, per gate. A line held by two trades
                          is clear because BOTH got there, and a row naming one
                          of them cannot be checked against the job. */}
                      <span className="mt-0.5 block text-xs text-muted-fg">
                        {r.gates.map(g => (
                          <span key={g.predecessorId} className="block">
                            {g.predecessorName} reached {g.need}%
                            {g.progress != null && g.progress !== g.need ? ` (now ${g.progress}%)` : ''}
                            {g.progressSource === 'budget' ? ' - from their budget lines' : ''}
                          </span>
                        ))}
                      </span>
                      <span className="mt-0.5 block text-xs text-faint">
                        {sub?.email
                          ? `${sub.companyName} - ${sub.email}`
                          : `${sub?.companyName ?? 'No sub on this line'} - no email on file`}
                      </span>
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="border-t border-line px-5 py-3">
          {withEmail.length > 0 && (
            <p className="text-xs text-muted-fg">
              <span className="font-medium text-ink">{withEmail.length} {withEmail.length === 1 ? 'sub' : 'subs'}</span>
              {' would get one email each: '}
              {withEmail.map(r => subs[r.taskId]?.companyName).join(', ')}
            </p>
          )}
          {/* NAMED, not counted. "2 have no email" leaves somebody to work out
              which two, and the answer decides whether a phone call is owed. */}
          {withoutEmail.length > 0 && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-warn">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                No email on file for {withoutEmail.map(r => subs[r.taskId]?.companyName ?? r.taskName).join(', ')} - they will not hear about this from SyteNav.
              </span>
            </p>
          )}
          {chosen.length === 0 && (
            <p className="text-xs text-muted-fg">Nothing is ticked, so there is nobody to tell.</p>
          )}
          {/* SAID ONCE, BEFORE THE PRESS. The offer does not come back: a
              second press would be a second identical email, so the row goes
              quiet once it has been taken. */}
          <p className="mt-1.5 text-xs text-faint">
            Each line is only offered once. Telling them is recorded against the job.
          </p>
        </div>

        {/* Three controls do not share 390px, so below lg the actions take
            their own row. `.row-even` reaches both edges. */}
        <div className="border-t border-line px-5 py-3">
          <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
            <button
              type="button" onClick={onCancel} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Not now
            </button>
            <button
              type="button" onClick={go} disabled={busy || chosen.length === 0}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              {/* The verb names what the press does, and the count is in it -
                  "Send" alone is a promise with no scope on it. */}
              Tell {chosen.length} {chosen.length === 1 ? 'sub' : 'subs'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * The banner that opens it.
 *
 * On the board rather than behind a tab, because a gate opens when somebody
 * updates a PERCENT - on the budget, or on another line's dialog - and nobody
 * goes looking at the schedule afterwards to see who that freed.
 */
export function UnblockedBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count < 1) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-success/30 bg-success-tint p-4">
      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-success">
        {count} {count === 1 ? 'trade is' : 'trades are'} clear to start
      </span>
      <button
        type="button" onClick={onOpen}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90"
      >
        <Mail className="h-4 w-4" /> Review and tell them
      </button>
    </div>
  )
}

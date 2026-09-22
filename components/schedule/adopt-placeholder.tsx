'use client'

import { useState } from 'react'
import { AlertTriangle, ArrowRight, Loader2, Merge } from 'lucide-react'
import type { AdoptOffer } from '@/lib/schedule-adopt'

// "This placeholder is still standing in for work you have awarded."
//
// IT ASKS. An automatic merge on a matching trade name would be the obvious
// fix and the wrong one: a trade is free text on both sides, a wrong merge
// silently rewires somebody else's chain onto the wrong sub, and a
// placeholder created through "My trade's not here" can never match anything
// at all - so match-only would help the easy cases and abandon the ones that
// needed it. The exact match is offered first and marked; everything else on
// the board is offered too.

export function AdoptBanner({ count, onOpen }: { count: number; onOpen: () => void }) {
  if (count < 1) return null
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-warn/30 bg-warn-tint p-4">
      <Merge className="h-4 w-4 shrink-0 text-warn" />
      <span className="min-w-0 flex-1 text-sm font-semibold text-warn">
        {count === 1
          ? '1 placeholder still has trades waiting on it'
          : `${count} placeholders still have trades waiting on them`}
      </span>
      <button
        type="button" onClick={onOpen}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90"
      >
        Sort it out
      </button>
    </div>
  )
}

export function AdoptDialog({
  offers, onConfirm, onCancel,
}: {
  offers: AdoptOffer[]
  onConfirm: (placeholderId: string, targetId: string) => Promise<void>
  onCancel: () => void
}) {
  const [index, setIndex] = useState(0)
  const offer = offers[index] ?? offers[0]
  // Starts on the SUGGESTION where there is one, and EMPTY where there is not
  // - a select that starts on a value cannot fail its own required check, and
  // the record does not look blank afterwards.
  const [targetId, setTargetId] = useState(offer?.suggestedTargetId ?? '')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  if (!offer) return null

  async function go() {
    // IT FIRES AND ANSWERS. Returning silently on a missing pick is the same
    // failure as grey-ing the button out: the person presses it, nothing
    // happens, and nothing says why.
    if (!targetId) {
      setProblem('Pick the line that took its place first.')
      return
    }
    setProblem(null)
    setBusy(true)
    try { await onConfirm(offer.placeholderId, targetId) } finally { setBusy(false) }
  }

  const chosen = offer.targets.find(t => t.id === targetId) ?? null

  return (
    <div className="overlay" data-overlay role="dialog" aria-modal="true" aria-label="Replace a placeholder with the awarded line">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold text-ink">
            Has &ldquo;{offer.placeholderName}&rdquo; been awarded?
          </h2>
          <p className="mt-0.5 text-sm text-muted-fg">
            It is a placeholder for {offer.placeholderTrade}, and{' '}
            <span className="font-medium text-ink">
              {offer.dependentCount} {offer.dependentCount === 1 ? 'trade waits' : 'trades wait'}
            </span>{' '}
            on it. A placeholder can never report progress, so anything gated behind it stays shut.
          </p>
        </div>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4 space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="adopt-target" className="block text-sm font-medium text-muted-fg lg:text-xs">
              Which line took its place? <span className="text-danger">*</span>
            </label>
            <select
              id="adopt-target" value={targetId} onChange={e => { setTargetId(e.target.value); setProblem(null) }}
              disabled={busy}
              className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-base text-ink lg:text-sm"
            >
              <option value="">-- Select --</option>
              {offer.targets.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name}{t.subName ? ` - ${t.subName}` : ''}{t.suggested ? '  (same trade)' : ''}
                </option>
              ))}
            </select>
            {/* SAID, not assumed. The match is a suggestion because a trade
                name is free text on both sides. */}
            {offer.suggestedTargetId ? (
              <p className="text-xs text-faint">
                The one marked &ldquo;same trade&rdquo; matches this placeholder&rsquo;s trade exactly. Check it is the right line - a trade name is typed, not picked.
              </p>
            ) : (
              <p className="text-xs text-faint">
                Nothing on the board matches &ldquo;{offer.placeholderTrade}&rdquo; exactly, so there is nothing to suggest. Pick the line yourself.
              </p>
            )}
          </div>

          {chosen && (
            <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
              <p className="flex flex-wrap items-center gap-1.5 text-sm text-ink">
                <span className="text-muted-fg line-through">{offer.placeholderName}</span>
                <ArrowRight className="h-3.5 w-3.5 text-faint" />
                <span className="font-medium">{chosen.name}</span>
              </p>
              <p className="mt-1 text-xs text-muted-fg">
                {offer.dependentCount === 1 ? 'The trade waiting' : `All ${offer.dependentCount} trades waiting`} on the placeholder will wait on {chosen.subName ?? chosen.name} instead, and the placeholder row goes.
              </p>
            </div>
          )}

          {problem && (
            <p className="rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-ink-soft">
              {problem}
            </p>
          )}

          <p className="flex items-start gap-1.5 text-xs text-warn">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>This cannot be undone from here - you would have to link the trades up again by hand.</span>
          </p>

          {offers.length > 1 && (
            <p className="text-xs text-faint">
              {index + 1} of {offers.length}.{' '}
              {index + 1 < offers.length && (
                <button
                  type="button" disabled={busy}
                  onClick={() => { const n = index + 1; setIndex(n); setTargetId(offers[n]?.suggestedTargetId ?? '') }}
                  className="underline hover:text-muted-fg disabled:opacity-60"
                >
                  Skip to the next one
                </button>
              )}
            </p>
          )}
        </div>

        <div className="border-t border-line px-5 py-3">
          <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2">
            <button
              type="button" onClick={onCancel} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink hover:bg-surface disabled:opacity-60"
            >
              Leave it alone
            </button>
            {/* NOT disabled on a missing pick - a disabled button explains
                nothing. It fires and answers with what is missing. */}
            <button
              type="button" onClick={go} disabled={busy}
              className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Merge className="h-4 w-4" />}
              Use that line instead
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

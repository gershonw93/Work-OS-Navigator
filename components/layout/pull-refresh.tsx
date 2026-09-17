'use client'

import { useCallback } from 'react'
import { Loader2, ArrowDown } from 'lucide-react'
import { usePullRefresh } from '@/lib/use-pull-refresh'
import { pullLabel, pullProgress, PULL_THRESHOLD } from '@/lib/pull-refresh'

/**
 * The thing you see when you pull down at the top of a screen.
 *
 * WHY IT RELOADS RATHER THAN CALLING `router.refresh()`. Eighteen of the twenty
 * project screens are client components that fetch in a `useEffect`;
 * `router.refresh()` re-renders SERVER components and leaves every one of those
 * exactly as it was. A refresh gesture that refreshes nothing on almost every
 * screen it is offered on is the same lie as a button whose verb the product
 * cannot honour - so it reloads, which is true everywhere.
 *
 * The cost is in-page state, and the guard against losing anything that matters
 * is in `canStartPull`: never with an overlay open. A half-typed note lives in
 * a dialog; the screens you pull on are lists.
 *
 * NOT an overlay. It carries no `data-overlay` on purpose - it must not freeze
 * the page it is sitting on, and it is gone the moment the finger lifts.
 */
export function PullRefresh() {
  // Stable, or the hook's effect tears down and rebuilds its listeners on
  // every render - which is every touchmove.
  const refresh = useCallback(() => { window.location.reload() }, [])
  const { travel, state } = usePullRefresh(refresh)

  if (state === 'idle' || travel <= 0) return null

  const progress = pullProgress(travel)
  const spinning = state === 'refreshing'

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center"
      style={{ transform: `translateY(${Math.max(0, travel - PULL_THRESHOLD / 2)}px)` }}
    >
      <div className="mt-2 flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 shadow-sm">
        {spinning ? (
          <Loader2 className="h-4 w-4 animate-spin text-accent-fg" />
        ) : (
          <ArrowDown
            className="h-4 w-4 text-muted-fg transition-transform"
            style={{ transform: `rotate(${progress >= 1 ? 180 : 0}deg)` }}
          />
        )}
        <span className="whitespace-nowrap text-xs font-medium text-ink">{pullLabel(state)}</span>
      </div>
    </div>
  )
}

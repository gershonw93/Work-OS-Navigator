'use client'

import { useCallback, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

/**
 * Which record a list screen has open, held in the URL (`?open=<id>`).
 *
 * A bill opened as a screen of its own has to be one Back - the browser's, the
 * phone's edge swipe - away from the list, and a refresh, a search result or a
 * link from somewhere else must land on the same bill.
 *
 * READ FROM `useSearchParams`, NOT FROM `window.location` ONCE. The first
 * version read the URL on mount and on popstate only, so a search result
 * pointing at `?open=` while you were already on the page changed the address
 * bar and nothing else. Next 14.2 keeps `useSearchParams` in step with
 * `history.pushState`, so opening one is a pushState - the list is already
 * loaded, there is nothing for a navigation to fetch. It needs a Suspense
 * boundary around the page that calls it.
 */
export function useOpenRecord(param = 'open') {
  const id = useSearchParams().get(param)
  // Whether WE put the entry there. Closing pops it if so - a second Back
  // would otherwise walk through the same bill again - and otherwise replaces.
  const pushed = useRef(false)

  const toTop = () => document.querySelector('[data-app-scroll]')?.scrollTo({ top: 0 })

  const open = useCallback((next: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(param, next)
    window.history.pushState(null, '', url)
    pushed.current = true
    toTop()
  }, [param])

  const close = useCallback(() => {
    if (pushed.current) {
      pushed.current = false
      window.history.back()
      return
    }
    const url = new URL(window.location.href)
    url.searchParams.delete(param)
    window.history.replaceState(null, '', url)
    toTop()
  }, [param])

  return { id, open, close }
}

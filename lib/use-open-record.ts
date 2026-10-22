'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Which record a list screen has open, held in the URL (`?open=<id>`).
 *
 * A bill opened as a screen of its own has to be one Back - the browser's, the
 * phone's edge swipe - away from the list, and a refresh must land on the same
 * bill. State alone would do neither: Back would leave the job entirely.
 *
 * `history.pushState` rather than the router: Next 14.2 syncs with it, and the
 * list is already loaded, so there is nothing for a navigation to fetch.
 */
export function useOpenRecord(param = 'open') {
  const [id, setId] = useState<string | null>(null)
  // Whether WE put the entry there. Closing pops it if so - a second Back
  // would otherwise walk through the same bill again - and otherwise replaces.
  const pushed = useRef(false)

  useEffect(() => {
    const read = () => setId(new URLSearchParams(window.location.search).get(param))
    read()
    window.addEventListener('popstate', read)
    return () => window.removeEventListener('popstate', read)
  }, [param])

  const toTop = () => document.querySelector('[data-app-scroll]')?.scrollTo({ top: 0 })

  const open = useCallback((next: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set(param, next)
    window.history.pushState(null, '', url)
    pushed.current = true
    setId(next)
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
    setId(null)
    toTop()
  }, [param])

  return { id, open, close }
}

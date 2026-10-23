'use client'

import { useEffect, useRef } from 'react'

/**
 * Where a link from somewhere else wanted this page to land.
 *
 * A link that names a thing has to arrive AT that thing. The project Overview
 * said "1 RFI unanswered" with an Answer button, and the button opened the top
 * of the RFI list - the person then had to find, on a second screen, what the
 * first screen had already found for them. The same failure as the setup
 * checklist's "Share the portal" opening the document-sending page.
 *
 * These pages load their rows AFTER mount, so neither a browser `#hash` nor a
 * read on mount can work by itself: the element is not there yet. So a page
 * reads the param, waits until it says it is `ready`, and acts ONCE - guarded
 * by a ref, so closing what it opened does not open it again on the next
 * render. Same rule as the Directory's `?contact=`.
 */
export function landingParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(name)
}

/** Scroll to `#id` once the page has drawn it. */
export function useLandOnHash(ready: boolean) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current || typeof window === 'undefined') return
    const id = decodeURIComponent(window.location.hash.slice(1))
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    done.current = true
    requestAnimationFrame(() => el.scrollIntoView({ block: 'start' }))
  }, [ready])
}

/** Run `act(value)` once, when `?name=` is present and the page is `ready`. */
export function useLandOnParam(name: string, ready: boolean, act: (value: string) => void) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    const value = landingParam(name)
    if (!value) return
    done.current = true
    act(value)
    // `act` is a fresh closure every render; reading it once is the point.
  }, [ready, name]) // eslint-disable-line react-hooks/exhaustive-deps
}

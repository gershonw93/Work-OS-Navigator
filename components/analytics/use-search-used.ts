'use client'

import { useEffect, useRef } from 'react'
import { track } from '@/lib/analytics-client'
import type { SEARCH_AREAS } from '@/lib/analytics'

const SETTLE_MS = 1500

/**
 * One search_used per search somebody actually finished typing - not one per
 * keystroke, and not a second one for the same words. What leaves is the area
 * and how many results came back; THE QUERY NEVER DOES. It is held here only
 * to tell "the same search again" from a new one, and never passed to `track`.
 */
export function useSearchUsed(area: (typeof SEARCH_AREAS)[number], query: string, resultsCount: number, settled: boolean) {
  const last = useRef('')
  useEffect(() => {
    const term = query.trim().toLowerCase()
    if (!settled || term.length < 2 || term === last.current) return
    const t = setTimeout(() => {
      last.current = term
      track('search_used', { search_area: area, results_count: resultsCount })
    }, SETTLE_MS)
    return () => clearTimeout(t)
  }, [area, query, resultsCount, settled])
}

'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { flushOutcomes, pageView, startAnalytics } from '@/lib/analytics-client'

// Mounted ONCE, from the root layout. Starts the tag if this browser is
// measured (lib/analytics.ts says who is not) and sends one page view per
// committed route. Renders nothing.
export function Analytics() {
  const pathname = usePathname()
  useEffect(() => {
    if (!pathname || !startAnalytics()) return
    pageView(pathname, window.location.search)
    flushOutcomes()
  }, [pathname])
  return null
}

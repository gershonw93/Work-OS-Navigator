'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { routeChanged } from '@/lib/analytics-client'

// Mounted ONCE, from the root layout. Every decision - whether the tag loads,
// whether it is silenced on a token link, what a page view says - is
// `routeChanged`'s (lib/analytics-client.ts). Renders nothing.
export function Analytics() {
  const pathname = usePathname()
  useEffect(() => {
    if (pathname) routeChanged(pathname, window.location.search)
  }, [pathname])
  return null
}

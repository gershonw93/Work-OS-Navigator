'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { optedOut, setOptOut } from '@/lib/analytics-client'

// The switch the Cookie Policy promises. Analytics is on by default with no
// banner, so turning it off has to be one press on the page that discloses it.
// The cookie is set on the parent domain, so the choice covers app.sytenav.com
// as well as this site. A browser sending Global Privacy Control is already
// off, and the button says so rather than offering to turn it on.
export function AnalyticsOptOut() {
  const [off, setOff] = useState<boolean | null>(null)
  const [gpc, setGpc] = useState(false)

  useEffect(() => {
    setGpc(!!(navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl)
    setOff(optedOut())
  }, [])

  if (off === null) return null

  return (
    <div className="mt-10 rounded-xl border border-line bg-panel p-4">
      <p className="text-sm font-semibold text-ink">Analytics on this browser</p>
      <p className="mt-1 text-sm text-muted-fg">
        {gpc
          ? 'Off. Your browser sends a Global Privacy Control signal, and we honour it.'
          : off
            ? 'Off. We will not load Google Analytics on this browser.'
            : 'On. Turning it off stops Google Analytics on sytenav.com and the SyteNav web app in this browser.'}
      </p>
      {!gpc && (
        <Button
          type="button" variant="outline" className="mt-3"
          onClick={() => { setOptOut(!off); setOff(!off) }}
        >
          {off ? 'Turn analytics back on' : 'Turn analytics off'}
        </Button>
      )}
    </div>
  )
}

'use client'

import { Play, Apple } from 'lucide-react'
import { useNativePlatform } from '@/lib/use-native'
import { PLAY_STORE_URL, APP_STORE_URL } from '@/lib/app-stores'

const BADGE = 'inline-flex items-center gap-2.5 rounded-xl px-3.5 py-2 whitespace-nowrap'

// "Get the app" in the marketing footer. Google Play is live; the App Store
// badge is greyed out and says Coming soon until APP_STORE_URL exists
// (lib/app-stores.ts).
//
// NOT INSIDE THE NATIVE APP. The shell loads app.sytenav.com, but a legal link
// from the login screen lands on sytenav.com inside the same WebView, and a
// "Get it on Google Play" badge inside the iOS app is a reference to another
// platform's store - App Review 2.3.10. Somebody in the app already has it, so
// there is nothing to lose. Hidden until the platform is known, the same
// default as a price (canShowPricing): a badge shown for a frame on iOS is the
// mistake that cannot be taken back.
export function AppBadges() {
  const { isNative, ready } = useNativePlatform()
  if (!ready || isNative) return null
  return (
    <div className="pt-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-faint mb-2.5">Get the app</p>
      <div className="flex flex-wrap gap-2.5">
        <a href={PLAY_STORE_URL} target="_blank" rel="noopener noreferrer"
          className={`${BADGE} bg-ink text-surface hover:bg-ink/90 transition-colors`}>
          <Play className="h-5 w-5 fill-current" aria-hidden />
          <span className="leading-tight text-left">
            <span className="block text-[10px] opacity-80">Get it on</span>
            <span className="block text-sm font-semibold">Google Play</span>
          </span>
        </a>
        {APP_STORE_URL ? (
          <a href={APP_STORE_URL} target="_blank" rel="noopener noreferrer"
            className={`${BADGE} bg-ink text-surface hover:bg-ink/90 transition-colors`}>
            <Apple className="h-5 w-5" aria-hidden />
            <span className="leading-tight text-left">
              <span className="block text-[10px] opacity-80">Download on the</span>
              <span className="block text-sm font-semibold">App Store</span>
            </span>
          </a>
        ) : (
          <span aria-disabled="true" title="Coming soon"
            className={`${BADGE} border border-line bg-muted text-faint cursor-not-allowed select-none`}>
            <Apple className="h-5 w-5" aria-hidden />
            <span className="leading-tight text-left">
              <span className="block text-[10px]">Coming soon</span>
              <span className="block text-sm font-semibold">App Store</span>
            </span>
          </span>
        )}
      </div>
    </div>
  )
}

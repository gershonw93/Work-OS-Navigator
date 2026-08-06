'use client'

import { useEffect, useState } from 'react'

// Is the web app running inside the native shell, and on which platform?
//
// Capacitor injects `window.Capacitor` into the webview at runtime, so this
// works with no npm dependency - it simply reports 'web' everywhere else,
// including before the native platforms exist at all.
//
// Detection has to happen after mount: the server has no idea which shell will
// load the page, so rendering off it during SSR would mismatch.

export type NativePlatform = 'web' | 'ios' | 'android'

export function useNativePlatform(): { platform: NativePlatform; isNative: boolean; ready: boolean } {
  const [platform, setPlatform] = useState<NativePlatform>('web')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const cap = (window as any).Capacitor
    const p = cap?.getPlatform?.()
    if (cap?.isNativePlatform?.() && (p === 'ios' || p === 'android')) setPlatform(p)
    setReady(true)
  }, [])

  return { platform, isNative: platform !== 'web', ready }
}

/**
 * Can this build show sign-up and anything else that leads to buying a plan?
 *
 * Apple takes a cut of anything sold inside an iOS app, so the iOS build is
 * sign-in only: you sign up and pay on the website, then log in on the phone.
 * Same shape Slack and Salesforce use. Android and the web are unaffected.
 *
 * To turn sign-up back on for iOS later - if billing moves to In-App Purchase,
 * or the rules on linking out settle - flip IOS_SIGNUP_ALLOWED to true. That is
 * the only change needed; every caller reads this one function.
 */
const IOS_SIGNUP_ALLOWED = false

export function canSignUpHere(platform: NativePlatform): boolean {
  return platform !== 'ios' || IOS_SIGNUP_ALLOWED
}

export function useCanSignUp(): { allowed: boolean; ready: boolean } {
  const { platform, ready } = useNativePlatform()
  return { allowed: canSignUpHere(platform), ready }
}

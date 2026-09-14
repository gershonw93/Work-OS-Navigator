'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * We could not reach the sign-in service - and the one thing this screen must
 * do is SAY SO, rather than showing the login form again.
 *
 * THE REPORT THIS ANSWERS. "I'm having a hard time logging in now. It's blank
 * or just loading forever." Signing in worked every time; the page behind it
 * could not verify the session and bounced back to /login, so the only thing
 * on screen was the login form - which reads as a wrong password. The
 * production trace has them opening the password reset page twice.
 *
 * So: not a login form, not an empty state, and no mention of a password. A
 * sentence naming what failed, and a button to ask again. Same rule as
 * PermissionsBanner one layer up - a check that FAILED is announced, never
 * quietly rendered as a denial.
 */
export function AuthUnavailable() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-6">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-warn/10">
          <WifiOff className="h-6 w-6 text-warn" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-ink">Can&apos;t reach the sign-in service</h1>
        <p className="mt-2 text-sm text-muted-fg">
          SyteNav couldn&apos;t check who you are just now. This is a connection problem,
          not your password &mdash; you&apos;re most likely still signed in.
        </p>
        <Button className="mt-5 w-full" onClick={() => window.location.reload()}>
          <RefreshCw className="h-4 w-4" aria-hidden />
          Try again
        </Button>
        <p className="mt-4 text-xs text-faint">
          If it keeps happening, close the app and open it again.
        </p>
      </div>
    </div>
  )
}

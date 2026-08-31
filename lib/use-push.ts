'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useNativePlatform } from '@/lib/use-native'

// ─────────────────────────────────────────────────────────────────────────────
// Registering this phone for notifications, and doing something sensible when
// one is tapped.
//
// Runs ONLY inside the native shell. On the web `useNativePlatform()` reports
// 'web' and this does nothing at all - no permission prompt, no import, no
// network. The plugins are loaded with a dynamic import for the same reason:
// nobody opening SyteNav in a browser should download push code that cannot
// run there.
//
// NEVER THROWS AND NEVER BLOCKS. Somebody who declines the permission prompt,
// or is offline when the app opens, gets an app that works exactly as before.
// Push is a convenience layered on top of the bell, not a thing to be signed
// in through.
// ─────────────────────────────────────────────────────────────────────────────

async function authToken(): Promise<string> {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

// iOS gives you the device token once, on an event, and there is no way to ask
// for it again later. Signing out has to release it, so it is kept here from
// the moment it arrives. localStorage rather than a module variable because a
// sign-out can happen after a reload, on a shell that never re-registered.
const TOKEN_KEY = 'sytenav-device-token'
function remember(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode */ }
}
function remembered(): string | null {
  try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
}

export function usePush() {
  const { isNative, ready } = useNativePlatform()
  const router = useRouter()

  useEffect(() => {
    if (!ready || !isNative) return
    let cancelled = false
    const cleanups: (() => void)[] = []

    ;(async () => {
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        // Ask only if we have not already been answered. Re-prompting somebody
        // who said no is not possible on iOS anyway - the second call returns
        // the previous answer - but asking cleanly keeps the state readable.
        let status = await PushNotifications.checkPermissions()
        if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
          status = await PushNotifications.requestPermissions()
        }
        if (status.receive !== 'granted' || cancelled) return

        // Apple hands the token back on an event, not from the register()
        // call, so the listener has to be attached BEFORE registering or the
        // first token of a cold start is missed.
        const registered = await PushNotifications.addListener('registration', async ({ value }) => {
          try {
            const jwt = await authToken()
            if (!jwt || !value) return
            remember(value)
            await fetch('/api/me/device-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ token: value, platform: 'ios' }),
            })
          } catch { /* the next cold start registers again */ }
        })
        cleanups.push(() => { registered.remove() })

        // Registration can fail for reasons nobody here can fix (no signal, a
        // provisioning profile without the push entitlement). Swallowed: the
        // app must not show an error about a feature the person did not ask
        // for and is not using yet.
        const failed = await PushNotifications.addListener('registrationError', () => {})
        cleanups.push(() => { failed.remove() })

        // Tapping a notification should open the THING, not just the app.
        // `link` is the app-relative path notify.ts put alongside Apple's own
        // `aps` block - see apnsPayload in lib/push.ts.
        const tapped = await PushNotifications.addListener('pushNotificationActionPerformed', e => {
          const link = (e.notification?.data as any)?.link
          if (typeof link === 'string' && link.startsWith('/')) router.push(link)
        })
        cleanups.push(() => { tapped.remove() })

        await PushNotifications.register()
      } catch { /* no push on this device; the bell still works */ }
    })()

    return () => {
      cancelled = true
      for (const c of cleanups) { try { c() } catch { /* unmounting */ } }
    }
  }, [ready, isNative, router])
}

/**
 * Hand the phone back on sign-out.
 *
 * Without this the next person to sign in on a shared site tablet is still
 * reachable at the previous person's address until they happen to register
 * again. Called from wherever signing out happens; safe to call on the web,
 * where it does nothing.
 */
export async function unregisterThisDevice(): Promise<void> {
  try {
    if (!(window as any).Capacitor?.isNativePlatform?.()) return
    const token = remembered()
    if (!token) return

    // The session is still alive at this point - this has to run BEFORE the
    // sign-out, or there is no token to authenticate the release with and the
    // row is orphaned on the previous person.
    const jwt = await authToken()
    if (jwt) {
      await fetch('/api/me/device-token', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ token }),
      })
    }
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }

    // Anything already on the lock screen belongs to the person leaving.
    const { PushNotifications } = await import('@capacitor/push-notifications')
    await PushNotifications.removeAllDeliveredNotifications()
  } catch { /* a stale row is tidied by the next person's registration */ }
}

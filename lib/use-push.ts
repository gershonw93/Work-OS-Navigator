'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useNativePlatform } from '@/lib/use-native'
import { readPushState, writePushState } from '@/lib/push-state'

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
//
// It does, however, WRITE DOWN HOW IT WENT. Every exit below used to be silent,
// and one of them was taken on a real phone: permission granted, register()
// called, and `device_tokens` empty, with nothing anywhere saying why. The
// Settings card meanwhile told the person - standing inside the app, on the
// phone - to go and open the app. `writePushState` is that fix and the whole of
// it: nothing here interrupts anybody, it only stops the screen guessing.
// See lib/push-state.ts.
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
    if (!ready) return
    if (!isNative) { writePushState('not_native'); return }
    let cancelled = false
    const cleanups: (() => void)[] = []

    ;(async () => {
      // Written first, so that NO record at all means this never ran, rather
      // than meaning one of the three things it used to mean.
      writePushState('starting')
      try {
        const { PushNotifications } = await import('@capacitor/push-notifications')

        // Ask only if we have not already been answered. Re-prompting somebody
        // who said no is not possible on iOS anyway - the second call returns
        // the previous answer - but asking cleanly keeps the state readable.
        let status = await PushNotifications.checkPermissions()
        if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
          status = await PushNotifications.requestPermissions()
        }
        if (cancelled) return
        if (status.receive !== 'granted') { writePushState('denied'); return }

        // Apple hands the token back on an event, not from the register()
        // call, so the listener has to be attached BEFORE registering or the
        // first token of a cold start is missed.
        const registered = await PushNotifications.addListener('registration', async ({ value }) => {
          try {
            if (!value) return
            const jwt = await authToken()
            if (!jwt) { writePushState('no_session'); return }
            remember(value)
            const res = await fetch('/api/me/device-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
              body: JSON.stringify({ token: value, platform: 'ios' }),
            })
            // The status, not just "it went wrong" - a 401 and a 500 are two
            // different problems and only one of them is ours.
            writePushState(res.ok ? 'registered' : 'save_failed', res.ok ? undefined : `error ${res.status}`)
          } catch { writePushState('save_failed', 'no connection') }
        })
        cleanups.push(() => { registered.remove() })

        // Registration can fail for reasons nobody here can fix (no signal, a
        // provisioning profile without the push entitlement). Still swallowed -
        // no popup - but Apple says WHICH, and throwing that sentence away was
        // the difference between "notifications are broken" and a fix.
        const failed = await PushNotifications.addListener('registrationError', err => {
          writePushState('apple_refused', (err as any)?.error)
        })
        cleanups.push(() => { failed.remove() })

        // Tapping a notification should open the THING, not just the app.
        // `link` is the app-relative path notify.ts put alongside Apple's own
        // `aps` block - see apnsPayload in lib/push.ts.
        const tapped = await PushNotifications.addListener('pushNotificationActionPerformed', e => {
          const link = (e.notification?.data as any)?.link
          if (typeof link === 'string' && link.startsWith('/')) router.push(link)
        })
        cleanups.push(() => { tapped.remove() })

        // register() resolving means Apple was ASKED, not that it answered -
        // the answer arrives on a listener, or on nothing at all if the app
        // delegate has no method to receive it. Recording the question is what
        // tells those two apart; without it, waiting forever and never having
        // started looked identical on the settings screen.
        await PushNotifications.register()
        // Only if nothing has answered yet. The registration listener can fire
        // BEFORE register() resolves, and moving the record back to "waiting"
        // would report a phone that had already registered as one that never
        // heard back - a position must never overwrite an outcome.
        if (!cancelled && readPushState()?.stage === 'starting') writePushState('registering')
      } catch {
        // The plugin did not load, or the permission call itself threw. The
        // bell still works; the card will say push never started.
        writePushState('unavailable')
      }
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

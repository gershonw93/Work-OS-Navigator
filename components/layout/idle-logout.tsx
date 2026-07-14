'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LAST_ACTIVITY_KEY = 'sytenav_last_activity'
const CHECK_EVERY_MS = 30_000

// Signs the user out after the company's configured minutes of inactivity
// (Settings -> Security). Activity = any pointer/key/scroll/touch in this tab.
// The timestamp lives in localStorage so closing the tab and reopening later
// still counts the idle time, and multiple tabs share the same clock.
export function IdleLogout() {
  const router = useRouter()
  const minutesRef = useRef(0) // 0 = disabled
  const signingOut = useRef(false)

  useEffect(() => {
    const supabase = createClient()
    let interval: ReturnType<typeof setInterval> | null = null
    let active = true

    const touch = () => {
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now())) } catch {}
    }

    async function check() {
      const minutes = minutesRef.current
      if (!minutes || signingOut.current) return
      let last = 0
      try { last = Number(localStorage.getItem(LAST_ACTIVITY_KEY) || 0) } catch {}
      if (!last) { touch(); return }
      if (Date.now() - last > minutes * 60_000) {
        signingOut.current = true
        try { localStorage.removeItem(LAST_ACTIVITY_KEY) } catch {}
        await supabase.auth.signOut()
        router.replace('/login')
        router.refresh()
      }
    }

    let cleanupRef: (() => void) | null = null
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/settings', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!res.ok || !active) return
      const minutes = Number((await res.json()).company?.auto_logout_minutes || 0)
      minutesRef.current = minutes
      if (!minutes) return

      touch()
      const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'scroll', 'touchstart']
      for (const e of events) window.addEventListener(e, touch, { passive: true })
      document.addEventListener('visibilitychange', check)
      interval = setInterval(check, CHECK_EVERY_MS)
      // Also check immediately on mount, so reopening a long-idle tab logs out.
      check()

      cleanupRef = () => {
        for (const e of events) window.removeEventListener(e, touch)
        document.removeEventListener('visibilitychange', check)
      }
    })()

    return () => {
      active = false
      if (interval) clearInterval(interval)
      cleanupRef?.()
    }
  }, [router])

  return null
}

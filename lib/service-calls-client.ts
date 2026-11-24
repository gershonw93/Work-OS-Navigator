'use client'

import { createClient } from '@/lib/supabase/client'

// The browser half of service calls: an authenticated fetch, and the times in
// the reader's OWN zone. The server never formats a call's time (it does not
// know which clock the crew member reads - lib/service-calls-server.ts), so
// every time on these screens is turned into words here, by the browser.

export async function callFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const { data: { session } } = await createClient().auth.getSession()
  return fetch(url, {
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
  })
}

/** "Tue Nov 25, 9:00 AM" in the reader's zone, or null. */
export function callTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** "9:00 AM - 10:30 AM" (or just the start). */
export function callWindow(start: string | null | undefined, end: string | null | undefined): string | null {
  const s = callTime(start)
  if (!s) return null
  if (!end) return s
  const e = new Date(end)
  if (Number.isNaN(e.getTime())) return s
  return `${s} - ${e.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

/** ISO -> the value a datetime-local input shows, in the reader's zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** A datetime-local value (the reader's zone) -> ISO, or null. */
export function fromLocalInput(v: string): string | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

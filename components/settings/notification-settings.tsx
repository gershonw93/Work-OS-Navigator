'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Mail } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Channel, NotificationType, Prefs } from '@/lib/notifications'

/**
 * What you want to be told about, and how.
 *
 * The screen this replaces had eight switches that saved NOTHING - the PATCH
 * handler ended in `void notifications`. You could turn an email off, watch the
 * switch move, reload, and find it back on. Its list was also wrong: eight
 * switches against sixteen real notification types, two of which matched.
 *
 * Rendered entirely from the catalog the send path validates against
 * (lib/notifications.ts), so the two lists cannot drift apart again - that
 * drift was the actual cause, not the symptom.
 */
export function NotificationSettings() {
  const supabase = createClient()
  const [types, setTypes] = useState<NotificationType[]>([])
  const [prefs, setPrefs] = useState<Prefs>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    }
  }, [supabase])

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/settings/notifications', { headers: await authHeaders() })
      if (res.ok) {
        const d = await res.json()
        setTypes(d.types ?? [])
        setPrefs(d.prefs ?? {})
      }
      setLoading(false)
    })()
  }, [authHeaders])

  async function toggle(type: string, channel: Channel, value: boolean) {
    const previous = prefs
    // Optimistic, but reverted on failure - the whole point of this screen is
    // that what it shows is true.
    setPrefs(p => ({ ...p, [type]: { ...p[type], [channel]: value } }))
    setSaving(`${type}:${channel}`)
    setError(null)
    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ type, channel, value }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? 'Could not save')
      const d = await res.json()
      setPrefs(p => ({ ...p, [type]: d.prefs }))
    } catch (e) {
      setPrefs(previous)
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.')
    } finally {
      setSaving(null)
    }
  }

  if (loading) return <p className="py-10 text-center text-sm text-faint">Loading…</p>

  const groups = Array.from(new Set(types.map(t => t.group)))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-fg">
        In-app notifications show in the bell. Email goes to your account address.
        Email is off by default except where missing it costs you something.
      </p>

      {error && (
        <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>
      )}

      {groups.map(group => (
        <div key={group} className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-fg">{group}</h3>
            <div className="flex shrink-0 gap-6 pr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
              <span className="inline-flex w-10 items-center justify-center gap-1"><Bell className="h-3 w-3" /> App</span>
              <span className="inline-flex w-10 items-center justify-center gap-1"><Mail className="h-3 w-3" /> Email</span>
            </div>
          </div>

          {types.filter(t => t.group === group).map(t => {
            const planned = t.status !== 'live'
            const p = prefs[t.key] ?? t.defaults
            return (
              <div key={t.key} className="flex items-start justify-between gap-4 border-b border-line-soft px-4 py-3 last:border-0">
                <div className="min-w-0">
                  <p className={cn('text-sm font-medium', planned ? 'text-faint' : 'text-ink')}>
                    {t.label}
                    {planned && (
                      <span className="ml-2 rounded-full bg-surface px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-faint">
                        Coming soon
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-fg">{t.description}</p>
                </div>
                <div className="flex shrink-0 gap-6 pt-0.5">
                  {(['inApp', 'email'] as Channel[]).map(ch => (
                    <div key={ch} className="flex w-10 justify-center">
                      <Switch
                        checked={!!p[ch]}
                        disabled={planned || saving === `${t.key}:${ch}`}
                        label={`${t.label} — ${ch === 'inApp' ? 'in-app' : 'email'}`}
                        onChange={v => toggle(t.key, ch, v)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function Switch({
  checked, disabled, label, onChange,
}: { checked: boolean; disabled?: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
        checked ? 'bg-accent' : 'bg-muted2',
        disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-panel shadow ring-0 transition-transform',
        checked ? 'translate-x-5' : 'translate-x-0',
      )} />
    </button>
  )
}

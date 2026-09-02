'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Bell, Mail, Smartphone, Loader2 } from 'lucide-react'
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
  const [push, setPush] = useState<{ configured: boolean; devices: number; lastSeen: string | null } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    }
  }, [supabase])

  useEffect(() => {
    (async () => {
      const headers = await authHeaders()
      const [res, pushRes] = await Promise.all([
        fetch('/api/settings/notifications', { headers }),
        // Never allowed to break this screen: the switches are the point, and
        // the phone card is an extra. A failure here just leaves it hidden.
        fetch('/api/me/push-test', { headers }).catch(() => null),
      ])
      if (res.ok) {
        const d = await res.json()
        setTypes(d.types ?? [])
        setPrefs(d.prefs ?? {})
      }
      if (pushRes?.ok) setPush(await pushRes.json().catch(() => null))
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

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/me/push-test', { method: 'POST', headers: await authHeaders() })
      const d = await res.json().catch(() => null)
      setTestResult(d?.text ? { ok: !!d.ok, text: d.text } : { ok: false, text: 'Could not reach the server. Try again.' })
      // A dead phone is removed by the send, so the count on screen has to
      // follow - otherwise it keeps claiming a phone that is not there.
      if (d && typeof d.devices === 'number') {
        setPush(p => p ? { ...p, devices: d.dead ? Math.max(0, d.devices - d.dead) : d.devices } : p)
      }
    } catch {
      setTestResult({ ok: false, text: 'Could not reach the server. Try again.' })
    } finally {
      setTesting(false)
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

      {/* The phone card.
          HIDDEN unless there is something true to say - push is switched on
          for SyteNav, or this person has a phone registered. Today neither is
          true for anybody on the web, and a card that only ever reads "not set
          up" is noise on a screen everyone sees. */}
      {push && (push.configured || push.devices > 0) && (
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-muted-fg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">Your phone</p>
              <p className="mt-0.5 text-sm text-muted-fg">
                {push.devices === 0
                  ? 'No phone registered yet. Open SyteNav on your phone, sign in, and allow notifications when it asks.'
                  : `${push.devices === 1 ? 'One phone is' : `${push.devices} phones are`} set up for notifications${push.lastSeen ? `, last seen ${new Date(push.lastSeen).toLocaleDateString()}` : ''}.`}
              </p>
              {testResult && (
                <p className={cn('mt-2 rounded-lg px-3 py-2 text-sm',
                  testResult.ok ? 'bg-success-tint text-success' : 'bg-warn-tint text-warn')}>
                  {testResult.text}
                </p>
              )}
            </div>
            <button
              type="button" onClick={sendTest} disabled={testing || push.devices === 0}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink disabled:opacity-50"
            >
              {testing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {testing ? 'Sending' : 'Send test'}
            </button>
          </div>
        </div>
      )}

      {groups.map(group => (
        <div key={group} className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex items-center justify-between gap-4 border-b border-line bg-surface px-4 py-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wide text-muted-fg">{group}</h3>
            {/* gap-3 on a phone, gap-6 from sm. Two 40px switches with a 24px
                gutter is 104px of a 390px screen taken from the label beside
                them, which is what put "Task assigned to me" on three lines. */}
            <div className="flex shrink-0 gap-3 pr-1 text-[11px] font-semibold uppercase tracking-wide text-faint sm:gap-6">
              <span className="inline-flex w-10 items-center justify-center gap-1"><Bell className="h-3 w-3" /> App</span>
              <span className="inline-flex w-10 items-center justify-center gap-1"><Mail className="h-3 w-3" /> Email</span>
            </div>
          </div>

          {types.filter(t => t.group === group).map(t => {
            const planned = t.status !== 'live'
            const p = prefs[t.key] ?? t.defaults
            return (
              <div key={t.key} className="flex items-start justify-between gap-3 border-b border-line-soft px-4 py-3 last:border-0 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-medium', planned ? 'text-faint' : 'text-ink')}>
                    {t.label}
                    {planned && (
                      <span className="ml-2 whitespace-nowrap rounded-full bg-surface px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-faint">
                        Coming soon
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs leading-snug text-muted-fg">{t.description}</p>
                </div>
                <div className="flex shrink-0 gap-3 pt-0.5 sm:gap-6">
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

'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { CalendarPlus, X, Copy, Check, RefreshCw, ChevronRight } from 'lucide-react'

// Reusable "Connect to Calendar" button + provider popup. Fetches the user's
// private iCal feed on demand and deep-links into Google / Apple / Outlook.
export function ConnectCalendarButton({ className, label = 'Connect to Calendar' }: { className?: string; label?: string }) {
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [feedUrl, setFeedUrl] = useState('')
  const [copied, setCopied] = useState(false)

  async function openModal() {
    setOpen(true)
    if (feedUrl) return
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/settings/calendar', { headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (res.ok) setFeedUrl(`${window.location.origin}/api/calendar/${(await res.json()).calendar_token}`)
  }
  async function resetFeed() {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch('/api/settings/calendar', { method: 'POST', headers: { Authorization: `Bearer ${session?.access_token}` } })
    if (res.ok) setFeedUrl(`${window.location.origin}/api/calendar/${(await res.json()).calendar_token}`)
  }
  function copyFeed() { navigator.clipboard?.writeText(feedUrl); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  const webcal = feedUrl.replace(/^https?:\/\//, 'webcal://')
  const google = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
  const outlook = `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent('SyteNav')}`
  const go = (url: string) => { if (feedUrl) window.open(url, '_blank') }
  const providers = [
    { key: 'google', label: 'Google Calendar', sub: 'Opens Google to add it', bg: 'bg-[#4285F4]', url: google },
    { key: 'apple', label: 'Apple Calendar', sub: 'iPhone, iPad & Mac', bg: 'bg-ink', url: webcal },
    { key: 'outlook', label: 'Outlook', sub: 'Outlook.com / Microsoft 365', bg: 'bg-[#0072C6]', url: outlook },
  ]

  return (
    <>
      <button onClick={openModal} className={cn('inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-line text-sm font-medium text-accent-fg hover:bg-surface', className)}>
        <CalendarPlus className="h-4 w-4" /> {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <h2 className="text-lg font-bold text-ink">Connect to your calendar</h2>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm text-muted-fg">Pick your calendar. Your schedules, task due dates, and inspections will show up there automatically. It's read-only, so this never changes anything in SyteNav.</p>
              <div className="space-y-2">
                {providers.map(p => (
                  <button key={p.key} onClick={() => go(p.url)} disabled={!feedUrl}
                    className="flex w-full items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 text-left hover:border-accent hover:bg-surface disabled:opacity-50 transition-colors">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white', p.bg)}><CalendarPlus className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{p.label}</span>
                      <span className="block text-xs text-muted-fg">{p.sub}</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
                  </button>
                ))}
              </div>
              {!feedUrl && <p className="text-center text-xs text-faint">Generating your private link…</p>}
              <details className="pt-1">
                <summary className="cursor-pointer text-xs text-muted-fg hover:text-ink">Other app? Copy the link instead</summary>
                <div className="mt-2 flex items-center gap-1.5">
                  <input readOnly value={feedUrl || '…'} className="flex-1 min-w-0 rounded-md border border-line bg-surface px-2.5 py-2 text-xs text-ink-soft" />
                  <button onClick={copyFeed} disabled={!feedUrl} className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-2 text-xs text-muted-fg hover:bg-surface disabled:opacity-50">
                    {copied ? <><Check className="h-3.5 w-3.5 text-success" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                  </button>
                </div>
                <button onClick={resetFeed} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-muted-fg hover:text-danger"><RefreshCw className="h-3 w-3" /> Reset link</button>
              </details>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

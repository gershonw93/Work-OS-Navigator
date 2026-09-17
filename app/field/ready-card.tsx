'use client'

import { useEffect, useState, useCallback } from 'react'
import { HardHat, CheckCircle2, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { formatDate } from '@/lib/dates'
import type { Countdown } from '@/lib/inspection-status'

// ─────────────────────────────────────────────────────────────────────────────
// "The work is ready" - the control the `mark-ready` permission always implied
// and never had.
//
// Field Worker has been granted `mark-ready: view + edit` since the permission
// was split out of `inspections`, and the only button that wrote it sat on the
// office Inspections tab, behind `inspections` - which the same role is
// denied. So the checkbox was real, the route enforced it correctly, and there
// was nowhere on earth to press it.
//
// It lives on Field Home rather than behind a tab because that is where the
// 7:30am email sends people, and because a worker opens this screen while
// standing on the thing being inspected.
// ─────────────────────────────────────────────────────────────────────────────

interface ReadyInspection {
  id: string
  project_id: string
  project_name: string
  type: string
  trade: string | null
  scheduled_date: string | null
  countdown: Countdown | null
}

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

// The three tones are the countdown's, not this card's - the row's colour and
// whether the reminder fires come off one rule, so a calm row cannot sit here
// while the email goes out about it.
const TONE: Record<string, string> = {
  overdue: 'text-danger',
  urgent: 'text-warn',
  quiet: 'text-muted-fg',
}

export function ReadyCard({ workerName }: { workerName: string }) {
  const [rows, setRows] = useState<ReadyInspection[]>([])
  // Loading, failed and empty are three different facts. An empty list is the
  // HAPPY answer here ("nothing to mark ready"), so defaulting to it would
  // state the good news while the answer is still unknown - or while a stale
  // token is refusing it.
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [saving, setSaving] = useState<string | null>(null)
  const notify = useNotice()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/me/inspections', {
        headers: { Authorization: `Bearer ${await token()}` },
      })
      // A 403 is a real verdict: this company has taken mark-ready off the
      // role. Show nothing rather than an error - it is not a fault.
      if (res.status === 403) { setRows([]); setState('ready'); return }
      if (!res.ok) { setState('failed'); return }
      setRows((await res.json()).inspections ?? [])
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function markReady(i: ReadyInspection) {
    setSaving(i.id)
    try {
      const res = await fetch(`/api/projects/${i.project_id}/inspections/${i.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          ready_marked_by: workerName,
          ready_marked_at: new Date().toISOString(),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        notify(body?.error ?? 'Could not save that. Try again in a moment.')
        return
      }
      notify(`${i.type} marked ready at ${i.project_name}.`, { tone: 'success' })
    } catch (e) {
      notify(fetchProblem(e, 'marking the work ready'))
    } finally {
      setSaving(null)
      // In `finally` so the list refreshes whichever way it went - a row that
      // saved and a row that did not must not both be left as they were.
      load()
    }
  }

  // Nothing to say, and nothing worth a box on a phone screen.
  if (state === 'ready' && rows.length === 0) return null

  if (state === 'loading') return null

  if (state === 'failed') {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-panel p-4 text-sm text-muted-fg">
        Could not check your inspections. Pull down to reload.
      </div>
    )
  }

  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-ink">
        <HardHat className="h-5 w-5 text-accent" /> Ready for inspection?
      </h2>
      <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel">
        {rows.map(i => (
          <div key={i.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              {/* One truncating box for the label, not two flex children
                  fighting over 390px. */}
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{i.type}</p>
                <p className="truncate text-sm text-muted-fg">{i.project_name}</p>
              </div>
              {i.countdown && (
                <span className={`shrink-0 whitespace-nowrap text-sm font-semibold ${TONE[i.countdown.tone] ?? TONE.quiet}`}>
                  {i.countdown.label}
                </span>
              )}
            </div>
            {i.scheduled_date && (
              <p className="mt-1 text-xs text-faint">
                Inspector due {formatDate(i.scheduled_date, { weekday: 'short', month: 'short', day: 'numeric' })}
              </p>
            )}
            <button
              onClick={() => markReady(i)}
              // Disabled only for IN FLIGHT. Nothing else can be missing here -
              // the answer is the button.
              disabled={saving === i.id}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 font-semibold text-accent-fg active:opacity-90 disabled:opacity-60"
            >
              {saving === i.id
                ? <><Loader2 className="h-5 w-5 animate-spin" /> Saving…</>
                : <><CheckCircle2 className="h-5 w-5" /> The work is ready</>}
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

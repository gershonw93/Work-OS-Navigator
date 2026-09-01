'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { usePermissions } from '@/lib/use-permissions'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, ChevronDown, CircleAlert, CircleCheck, X, ArrowRight } from 'lucide-react'

const STATUSES = ['planning', 'active', 'on_hold', 'completed', 'cancelled']

interface Check {
  key: string
  label: string
  ok: boolean
  detail: string
  hint?: string
  href?: string
}

/**
 * The status badge in the project header, made clickable.
 *
 * Going from planning to Active is the one transition worth pausing on: it is
 * the moment a job becomes real money. It locks the markup as your billed fee
 * and opens up billing, so it gets a pre-flight built from what the job
 * already has. Nothing there blocks the change - jobs legitimately start
 * before the permit lands - it just stops a job going live with the deposit
 * forgotten. Every other transition is one click.
 */
export function ProjectStatusSwitch({
  projectId, status, isSite,
}: {
  projectId: string
  status: string | null
  isSite?: boolean
}) {
  const { can } = usePermissions()
  // A site is a container - its status means nothing, the jobs underneath it
  // carry their own.
  const canEdit = can('projects', 'edit') && !isSite
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [checks, setChecks] = useState<Check[] | null>(null)
  const [startDate, setStartDate] = useState('')
  const [saving, setSaving] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const current = status ?? 'planning'

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  async function token() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function setStatus(next: string, extra: Record<string, unknown> = {}) {
    setSaving(true)
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
      body: JSON.stringify({ status: next, ...extra }),
    })
    setSaving(false)
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error ?? 'Could not change the status')
      return
    }
    setConfirming(false)
    setOpen(false)
    // The tab bar caches status on mount, and going active unhides tabs.
    window.dispatchEvent(new Event('sytenav:project-updated'))
    router.refresh()
  }

  async function choose(next: string) {
    if (next === current) { setOpen(false); return }
    if (next !== 'active' || current !== 'planning') return setStatus(next)

    // Winning the job - run the pre-flight first.
    setOpen(false)
    setConfirming(true)
    setChecks(null)
    const res = await fetch(`/api/projects/${projectId}/readiness`, {
      headers: { Authorization: `Bearer ${await token()}` },
    })
    if (res.ok) {
      const d = await res.json()
      setChecks(d.checks ?? [])
      setStartDate((d.start_date ?? '').slice(0, 10))
    } else {
      setChecks([])
    }
  }

  if (!canEdit) {
    return (
      <Badge variant={getStatusVariant(current)} className="shrink-0 capitalize">
        {current.replace('_', ' ')}
      </Badge>
    )
  }

  const done = (checks ?? []).filter(c => c.ok).length

  return (
    <>
      <div ref={wrapRef} className="relative shrink-0">
        <button onClick={() => setOpen(o => !o)} title="Change status"
          className="inline-flex items-center gap-1 rounded-full hover:opacity-80 transition-opacity">
          <Badge variant={getStatusVariant(current)} className="capitalize">
            {current.replace('_', ' ')}
          </Badge>
          <ChevronDown className="h-3.5 w-3.5 text-faint" />
        </button>
        {open && (
          <div className="absolute left-0 top-full z-40 mt-1 w-56 overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
            {STATUSES.map(s => (
              <button key={s} onClick={() => choose(s)}
                className={cn('flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm capitalize transition-colors',
                  s === current ? 'bg-muted text-ink' : 'text-ink-soft hover:bg-surface')}>
                {s.replace('_', ' ')}
                {s === current && <Check className="h-4 w-4 text-accent-fg" />}
              </button>
            ))}
            <p className="border-t border-line-soft px-3 py-2 text-[11px] leading-snug text-faint">
              Active means under contract - won and billable, whether or not anyone is on site yet.
            </p>
          </div>
        )}
      </div>

      {/* Pre-flight before going live */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setConfirming(false)}>
          <div className="w-full max-w-md rounded-xl bg-panel shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Set this job to Active</h2>
              <button onClick={() => setConfirming(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-fg">
                Active means you have the job under contract. Your markup locks in as the billed fee, and billing,
                daily logs, time clock and inspections all switch on.
              </p>

              {checks === null ? (
                <p className="text-sm text-faint py-4 text-center">Checking the job…</p>
              ) : (
                <>
                  {/* 0% MARKUP, SAID PLAINLY.
                      The markup was already one of six checklist rows, all
                      weighted the same, so it read as a to-do rather than as
                      "you are about to bill this whole job at cost". A GC
                      could run a job at no fee and not notice - which a
                      reviewer did, on a real one.
                      A WARNING, NOT A BLOCK: some jobs genuinely are at cost,
                      and refusing those would be the app inventing a rule the
                      trade does not have. */}
                  {checks.some(c => c.key === 'price' && !c.ok) && (
                    <div className="rounded-lg border border-warn/40 bg-warn-tint px-3 py-2.5">
                      <p className="text-sm font-semibold text-warn">This job has no markup set.</p>
                      <p className="mt-0.5 text-xs text-warn">
                        Going active locks the markup as your billed fee. At 0% you will bill this
                        job at cost and earn nothing on it. Set a rate on the Budget tab first
                        unless that is genuinely the deal.
                      </p>
                    </div>
                  )}
                  <div className="rounded-lg border border-line divide-y divide-line-soft">
                    {checks.map(c => (
                      <div key={c.key} className="flex items-start gap-2.5 px-3 py-2.5">
                        {c.ok
                          ? <CircleCheck className="h-4 w-4 shrink-0 mt-0.5 text-success" />
                          : <CircleAlert className="h-4 w-4 shrink-0 mt-0.5 text-warn" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn('text-sm', c.ok ? 'text-ink-soft' : 'text-ink')}>{c.label}</p>
                          <p className="text-xs text-faint">{c.detail}</p>
                          {!c.ok && c.hint && <p className="text-xs text-warn mt-0.5">{c.hint}</p>}
                        </div>
                        {!c.ok && c.href && (
                          <a href={`/projects/${projectId}/${c.href}`}
                            className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-accent-fg hover:underline">
                            Open <ArrowRight className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>

                  {done < checks.length && (
                    <p className="text-xs text-muted-fg">
                      {checks.length - done} of {checks.length} not done. None of it stops you - plenty of jobs start
                      before the permit lands.
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                    <p className="text-xs text-faint">When work actually begins on site. Separate from winning the job.</p>
                  </div>
                </>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={saving}>Cancel</Button>
                <Button
                  onClick={() => setStatus('active', startDate ? { start_date: startDate } : {})}
                  disabled={saving || checks === null}
                >
                  {saving ? 'Saving…' : 'Set to Active'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

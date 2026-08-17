'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, X, ArrowRight, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SetupProgress, SetupStep } from '@/lib/job-setup'

/** What the API adds to the pure progress calculation. */
type SetupState = SetupProgress & { dismissed: boolean }

/**
 * Setting up a job that already exists, in the order that actually works.
 *
 * A DRAWER, not a banner. This began as a full-width bar above the tabs and
 * was immediately too much: the project header already carries a status
 * switch, team, share, activity and settings, and a tenth of the screen given
 * over to a checklist you are not currently working through is furniture.
 *
 * So it is one small chip in the row of controls that already exists, showing
 * how far through you are, and everything else lives behind it.
 *
 * Hidden once complete, and dismissible before then - reversibly, because a
 * single mis-click should not permanently remove a guide: Undo in the drawer,
 * and a switch in Project Settings afterwards.
 *
 * The dismissal is stored per (person, job) on the SERVER. It was in
 * localStorage, which is the browser rather than the person - hide it on the
 * laptop and it was still there on the phone, and two people sharing a machine
 * shared the decision. It is deliberately not on the project row either:
 * setup guidance is personal, and an admin who knows the app should not be
 * able to hide the walkthrough from somebody who just joined.
 */
export function SetupChecklist({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [data, setData] = useState<SetupState | null>(null)
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState(false) // drives the slide-in
  const [justDismissed, setJustDismissed] = useState(false)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${projectId}/setup`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (res.ok) setData(await res.json())
  }, [projectId, supabase])

  useEffect(() => { load() }, [load])

  // Project Settings can switch it back on; reload so it reappears without a
  // page refresh.
  useEffect(() => {
    const onChange = () => { setJustDismissed(false); load() }
    window.addEventListener('sytenav:setup-visibility', onChange)
    return () => window.removeEventListener('sytenav:setup-visibility', onChange)
  }, [load])

  const setDismissedOnServer = useCallback(async (next: boolean) => {
    const { data: { session } } = await supabase.auth.getSession()
    await fetch(`/api/projects/${projectId}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({ dismissed: next }),
    })
    window.dispatchEvent(new Event('sytenav:setup-visibility'))
  }, [projectId, supabase])

  // Re-check when something reports a change, so a step ticks off without a
  // reload - including while the drawer is open.
  useEffect(() => {
    const onChanged = () => load()
    window.addEventListener('sytenav:project-updated', onChanged)
    return () => window.removeEventListener('sytenav:project-updated', onChanged)
  }, [load])

  // Mount first, then slide - a panel that is already in place on the first
  // frame has nothing to animate from.
  useEffect(() => {
    if (!open) { setShown(false); return }
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function close() {
    setShown(false)
    // Let it slide out before it leaves the tree.
    setTimeout(() => setOpen(false), 200)
  }

  function dismiss() {
    // Optimistic, so the drawer closes onto the Undo rather than onto a
    // spinner. The server call follows.
    setData(d => (d ? { ...d, dismissed: true } : d))
    setJustDismissed(true)
    close()
    setDismissedOnServer(true)
  }

  function restore() {
    setData(d => (d ? { ...d, dismissed: false } : d))
    setJustDismissed(false)
    setDismissedOnServer(false)
  }

  if (!data || data.complete) return null

  // Hidden, but say so once and offer it back rather than vanishing silently.
  if (data.dismissed) {
    if (!justDismissed) return null
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-fg">
        Checklist hidden.
        <button onClick={restore} className="font-semibold text-accent-fg hover:underline">Undo</button>
      </span>
    )
  }

  const pct = Math.round((data.done / data.total) * 100)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="What is left to set up on this job"
        className="inline-flex items-center gap-2 rounded-lg border border-accent/40 bg-accent-tint/40 px-2.5 py-2 text-xs font-semibold text-accent-fg transition-colors hover:bg-accent-tint"
      >
        <span className="relative inline-flex h-4 w-4 items-center justify-center">
          <svg viewBox="0 0 36 36" className="h-4 w-4 -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="6" className="stroke-accent/25" />
            <circle cx="18" cy="18" r="15" fill="none" strokeWidth="6" strokeLinecap="round"
              className="stroke-accent" strokeDasharray={`${(pct / 100) * 94.2} 94.2`} />
          </svg>
        </span>
        Setup {data.done}/{data.total}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden" role="dialog" aria-label="Job setup checklist">
          <div
            onClick={close}
            className={cn('absolute inset-0 bg-black/40 transition-opacity duration-200',
              shown ? 'opacity-100' : 'opacity-0')}
          />

          <div className={cn(
            'absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-panel shadow-2xl',
            'transition-transform duration-200 ease-out',
            shown ? 'translate-x-0' : 'translate-x-full',
          )}>
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-base font-semibold text-ink">Setting up this job</h2>
                <p className="mt-0.5 text-xs text-muted-fg">
                  {data.done} of {data.total} done
                  {data.essentialsLeft > 0 && ` · ${data.essentialsLeft} still needed`}
                </p>
              </div>
              <button onClick={close} aria-label="Close" className="text-faint hover:text-ink">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="h-1 w-full bg-surface">
              <div className="h-1 bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-xs text-muted-fg">
                In this order on purpose - each one makes the ones after it work.
              </p>
              <ol className="space-y-2">
                {data.steps.map((s, i) => (
                  <Step key={s.key} step={s} index={i + 1} projectId={projectId} />
                ))}
              </ol>
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-line px-5 py-3">
              <button onClick={dismiss} className="text-xs text-muted-fg hover:text-danger">
                Hide this checklist
              </button>
              {data.next && (
                <a href={`/projects/${projectId}/${data.next.href}`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-ink hover:bg-accent/90">
                  {data.next.cta} <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function Step({ step, index, projectId }: { step: SetupStep; index: number; projectId: string }) {
  return (
    <li className={cn(
      'rounded-lg border px-3 py-2.5',
      step.done ? 'border-line-soft bg-surface/60' : 'border-line bg-panel',
    )}>
      <div className="flex items-start gap-3">
        <span className={cn(
          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
          step.done ? 'bg-success text-white' : 'border border-line text-faint',
        )}>
          {step.done ? <Check className="h-3 w-3" /> : index}
        </span>

        <div className="min-w-0 flex-1">
          <p className={cn('text-sm font-medium', step.done ? 'text-muted-fg line-through' : 'text-ink')}>
            {step.label}
            {step.essential && !step.done && (
              <span className="ml-1.5 rounded-full bg-warn-tint px-1.5 py-0 align-middle text-[10px] font-semibold text-warn">
                needed
              </span>
            )}
          </p>
          {!step.done && <p className="mt-1 text-xs leading-snug text-muted-fg">{step.why}</p>}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[11px] text-faint">{step.detail}</span>
            {!step.done && (
              <a href={`/projects/${projectId}/${step.href}`}
                className="text-xs font-semibold text-accent-fg hover:underline">
                {step.cta} →
              </a>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

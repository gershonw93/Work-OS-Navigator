'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Check, ChevronDown, ChevronUp, X, ArrowRight, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SetupProgress, SetupStep } from '@/lib/job-setup'

/**
 * Setting up a job that already exists, in the order that actually works.
 *
 * Collapsed to one line by default. A permanent open panel across every tab
 * would be nagging; a line that says "4 of 10 - next: bring the budget in" is
 * a signpost you can ignore.
 *
 * Hidden once it is complete, and dismissible before then. Dismissal is per
 * job and per browser - a checklist you cannot get rid of is one people learn
 * to resent, and the Help article covers the same ground for anyone who wants
 * it back.
 */
export function SetupChecklist({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [data, setData] = useState<SetupProgress | null>(null)
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState(true) // assume hidden until we've checked

  const storageKey = `sytenav:setup-dismissed:${projectId}`

  useEffect(() => {
    try { setDismissed(localStorage.getItem(storageKey) === '1') } catch { setDismissed(false) }
  }, [storageKey])

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${projectId}/setup`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (res.ok) setData(await res.json())
  }, [projectId, supabase])

  useEffect(() => { load() }, [load])

  // Re-check when a tab reports it changed something, so ticking a step off
  // does not need a reload to show.
  useEffect(() => {
    const onChanged = () => load()
    window.addEventListener('sytenav:project-updated', onChanged)
    return () => window.removeEventListener('sytenav:project-updated', onChanged)
  }, [load])

  if (!data || data.complete || dismissed) return null

  function dismiss() {
    try { localStorage.setItem(storageKey, '1') } catch { /* private mode - fine */ }
    setDismissed(true)
  }

  const pct = Math.round((data.done / data.total) * 100)

  return (
    <div className="border-b border-line bg-accent-tint/20 print:hidden">
      <div className="px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <button
            onClick={() => setOpen(v => !v)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span className="relative inline-flex h-7 w-7 shrink-0 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-7 w-7 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" className="stroke-line" />
                <circle cx="18" cy="18" r="15" fill="none" strokeWidth="4" strokeLinecap="round"
                  className="stroke-accent"
                  strokeDasharray={`${(pct / 100) * 94.2} 94.2`} />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">
                Setting up this job · {data.done} of {data.total}
              </span>
              {data.next && !open && (
                <span className="block truncate text-xs text-muted-fg">
                  Next: {data.next.label}
                </span>
              )}
            </span>
            {open ? <ChevronUp className="h-4 w-4 shrink-0 text-faint" />
              : <ChevronDown className="h-4 w-4 shrink-0 text-faint" />}
          </button>

          {!open && data.next && (
            <a href={`/projects/${projectId}/${data.next.href}`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink hover:bg-accent/90">
              {data.next.cta} <ArrowRight className="h-3.5 w-3.5" />
            </a>
          )}

          <button onClick={dismiss} aria-label="Hide this checklist"
            className="shrink-0 rounded p-1 text-faint hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        {open && (
          <ol className="mt-3 space-y-1.5 pb-1">
            {data.steps.map((s, i) => (
              <Step key={s.key} step={s} index={i + 1} projectId={projectId} />
            ))}
            <li className="pt-1 text-[11px] text-faint">
              Hiding this only hides it here - the same walkthrough lives in Help under
              &ldquo;Set up a job that has already started&rdquo;.
            </li>
          </ol>
        )}
      </div>
    </div>
  )
}

function Step({ step, index, projectId }: { step: SetupStep; index: number; projectId: string }) {
  return (
    <li className={cn(
      'flex items-start gap-3 rounded-lg border px-3 py-2',
      step.done ? 'border-line-soft bg-panel/60' : 'border-line bg-panel',
    )}>
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
        {!step.done && <p className="mt-0.5 text-xs text-muted-fg">{step.why}</p>}
        <p className="mt-0.5 text-[11px] text-faint">{step.detail}</p>
      </div>

      {!step.done && (
        <a href={`/projects/${projectId}/${step.href}`}
          className="shrink-0 self-center rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-accent-fg hover:border-accent hover:bg-accent-tint/40">
          {step.cta}
        </a>
      )}
    </li>
  )
}

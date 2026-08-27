'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  ArrowRight, CalendarDays, ClipboardCheck, CheckCircle2, Inbox, Clock,
} from 'lucide-react'

interface Item {
  key: string
  count: number
  href: string
  label: string
  detail: string | null
  tone?: 'warn' | 'danger' | 'muted'
}

interface Overview {
  project: { id: string; name: string; status: string }
  money: {
    received: number; committed: number; vendorBilled: number
    vendorPaid: number; outstandingToVendors: number; feePct: number
  }
  waitingOnYou: Item[]
  waitingOnOthers: Item[]
  upcoming: { id: string; label: string; start_date: string; end_date: string | null; inDays: number }[]
  inspections: { id: string; label: string; date: string; inDays: number }[]
  tasks: { open: number; overdue: number }
  subcontracts: number
}

const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

function when(inDays: number) {
  if (inDays < 0) return `${Math.abs(inDays)}d ago`
  if (inDays === 0) return 'today'
  if (inDays === 1) return 'tomorrow'
  return `in ${inDays}d`
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <p className="text-xs text-muted-fg">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-ink">{value}</p>
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  )
}

/**
 * Where this job stands, and what has piled up since you last looked.
 *
 * NOT A CHECKLIST, deliberately. A GC knows how to run a job - being told to
 * "approve invoices" is noise, and a list that is never complete is noise you
 * learn to scroll past. What nobody can know without opening six tabs is what
 * is sitting there NOW, so this states facts and links to them and stops.
 *
 * The two piles are split because they need different responses: things you can
 * clear yourself this minute, and things you can only chase somebody about.
 */
export default function OverviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${params.id}/overview`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    // Subcontractors and sites have no overview. Because /projects/[id] lands
    // everyone here, this is where they get sent on - a blank page would be the
    // orphan-tab problem all over again.
    if (res.status === 403 || res.status === 404) {
      router.replace(`/projects/${params.id}/plans`)
      return
    }
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [params.id, supabase, router])

  useEffect(() => { load() }, [load])

  if (loading) return <div className="py-12 text-center text-sm text-faint">Loading…</div>
  if (!data) return null

  const { money: m, waitingOnYou, waitingOnOthers, upcoming, inspections, tasks } = data
  const nothingWaiting = waitingOnYou.length === 0 && waitingOnOthers.length === 0

  const row = (i: Item, projectId: string) => (
    <Link
      key={i.key}
      href={`/projects/${projectId}/${i.href}`}
      className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-accent"
    >
      <span className={cn(
        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
        i.tone === 'danger' ? 'bg-danger-tint text-danger'
          : i.tone === 'warn' ? 'bg-warn-tint text-warn'
          : i.tone === 'muted' ? 'bg-muted text-muted-fg'
          : 'bg-info-tint text-info',
      )}>
        {i.count}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{i.label}</span>
        {i.detail && <span className="block truncate text-xs text-muted-fg">{i.detail}</span>}
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
    </Link>
  )

  return (
    <div className="max-w-4xl space-y-5">
      {/* Money position */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Received from client" value={money(m.received)} />
        <Stat label="Committed to vendors" value={money(m.committed)} hint={`${data.subcontracts} subcontract${data.subcontracts === 1 ? '' : 's'}`} />
        <Stat label="Billed by vendors" value={money(m.vendorBilled)} hint={`${money(m.vendorPaid)} paid`} />
        <Stat label="Outstanding to vendors" value={money(m.outstandingToVendors)} />
      </div>

      {nothingWaiting && (
        <div className="flex items-center gap-3 rounded-xl border border-success/30 bg-success-tint/40 px-4 py-3">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-semibold text-ink">Nothing is waiting on anyone.</p>
            <p className="text-sm text-muted-fg">No bills to approve, no RFIs open, no certificates lapsing.</p>
          </div>
        </div>
      )}

      {waitingOnYou.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-info" />
            <h2 className="text-sm font-semibold text-ink">Waiting on you</h2>
          </div>
          {waitingOnYou.map(i => row(i, data.project.id))}
        </div>
      )}

      {waitingOnOthers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-warn" />
            <h2 className="text-sm font-semibold text-ink">Waiting on someone else</h2>
          </div>
          {waitingOnOthers.map(i => row(i, data.project.id))}
        </div>
      )}

      {/* What is happening next */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-faint" />
            <h2 className="text-sm font-semibold text-ink">On site</h2>
          </div>
          {upcoming.length ? (
            <div className="space-y-1.5">
              {upcoming.map(u => (
                <div key={u.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-ink-soft">{u.label}</span>
                  <span className={cn('shrink-0 text-xs font-medium', u.inDays < 0 ? 'text-muted-fg' : 'text-faint')}>
                    {when(u.inDays)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">Nothing scheduled in the next three weeks.</p>
          )}
          <Link href={`/projects/${data.project.id}/schedule`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
            Schedule <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-faint" />
            <h2 className="text-sm font-semibold text-ink">Booked inspections</h2>
          </div>
          {inspections.length ? (
            <div className="space-y-1.5">
              {inspections.map(i => (
                <div key={i.id} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-ink-soft">{i.label}</span>
                  <span className="shrink-0 text-xs font-medium text-faint">{when(i.inDays)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">None booked in the next three weeks.</p>
          )}
          <Link href={`/projects/${data.project.id}/inspections`} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
            Inspections <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {tasks.open > 0 && (
        <Link href={`/projects/${data.project.id}/tasks`}
          className="flex items-center gap-3 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-accent">
          <span className="min-w-0 flex-1 text-sm text-ink-soft">
            <span className="font-medium text-ink">{tasks.open} open task{tasks.open === 1 ? '' : 's'}</span>
            {tasks.overdue > 0 && <span className="text-danger"> · {tasks.overdue} overdue</span>}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-faint" />
        </Link>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  ArrowRight, Banknote, CalendarDays, CheckCircle2, ClipboardCheck,
  FileSignature, HardHat, Inbox, MessageSquare, Palette, Receipt, Send,
  ShieldAlert, TrendingDown, Clock, CheckSquare,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

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

// Each kind of waiting item gets its own icon, so the list reads by shape
// before it reads by words - the same reason road signs are pictures.
const ITEM_ICONS: Record<string, LucideIcon> = {
  invoices: Receipt,
  rfis: MessageSquare,
  inspections: ClipboardCheck,
  signoffs: FileSignature,
  unsent: Send,
  requested: Banknote,
  lapsed: ShieldAlert,
  expiring: ShieldAlert,
  nodocs: ShieldAlert,
  selections: Palette,
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
 *
 * Styling follows the house idiom rather than inventing one: the tinted stat
 * tiles are the ones from Billing the client, the icon-chip section headers are
 * the dashboard's. First version of this page was bare grey boxes - correct and
 * lifeless, which on a landing page reads as "nothing to see here".
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
  const youCount = waitingOnYou.reduce((s, i) => s + i.count, 0)

  // Same tile treatment as Billing the client, so money looks like money
  // everywhere in the app.
  const tiles = [
    { label: 'Received from client', value: m.received, icon: Banknote, color: 'text-success', bg: 'bg-success-tint' },
    { label: 'Committed to vendors', value: m.committed, icon: HardHat, color: 'text-special', bg: 'bg-special-tint', hint: `${data.subcontracts} subcontract${data.subcontracts === 1 ? '' : 's'}` },
    { label: 'Billed by vendors', value: m.vendorBilled, icon: Receipt, color: 'text-info', bg: 'bg-info-tint', hint: `${money(m.vendorPaid)} paid` },
    {
      label: 'Outstanding to vendors', value: m.outstandingToVendors, icon: TrendingDown,
      color: m.outstandingToVendors > 0 ? 'text-warn' : 'text-ink',
      bg: m.outstandingToVendors > 0 ? 'bg-warn-tint' : 'bg-panel',
    },
  ]

  const row = (i: Item, projectId: string) => {
    const Icon = ITEM_ICONS[i.key] ?? Inbox
    const tone = i.tone === 'danger'
      ? { chip: 'bg-danger-tint text-danger', bar: 'bg-danger' }
      : i.tone === 'warn'
        ? { chip: 'bg-warn-tint text-warn', bar: 'bg-warn' }
        : i.tone === 'muted'
          ? { chip: 'bg-muted text-muted-fg', bar: 'bg-muted2' }
          : { chip: 'bg-info-tint text-info', bar: 'bg-info' }
    return (
      <Link
        key={i.key}
        href={`/projects/${projectId}/${i.href}`}
        className="group relative flex items-center gap-3 overflow-hidden rounded-xl border border-line bg-panel py-3 pl-4 pr-3 transition-all hover:-translate-y-px hover:border-accent hover:shadow-sm"
      >
        {/* Tone as a spine, not a wash - readable at a squint. */}
        <span className={cn('absolute inset-y-0 left-0 w-1', tone.bar)} />
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone.chip)}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink">{i.label}</span>
          {i.detail && <span className="block truncate text-xs text-muted-fg">{i.detail}</span>}
        </span>
        <ArrowRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-fg" />
      </Link>
    )
  }

  return (
    <div className="space-y-6">
      {/* Money position */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map(t => {
          const Icon = t.icon
          return (
            <div key={t.label} className={cn('rounded-xl border border-line p-4', t.bg)}>
              <div className={cn('flex items-center gap-1.5 text-xs font-medium', t.color)}>
                <Icon className="h-3.5 w-3.5" /> {t.label}
              </div>
              <p className="mt-1.5 text-2xl font-bold tracking-tight text-ink">{money(t.value)}</p>
              {'hint' in t && t.hint && <p className="mt-0.5 text-xs text-faint">{t.hint}</p>}
            </div>
          )
        })}
      </div>

      {nothingWaiting && (
        <div className="flex items-center gap-4 rounded-xl bg-accent px-5 py-4 text-accent-ink">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-ink/10">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-bold">Nothing is waiting on anyone.</p>
            <p className="text-sm opacity-80">No bills to approve, no RFIs open, no certificates lapsing.</p>
          </div>
        </div>
      )}

      {waitingOnYou.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-info-tint">
              <Inbox className="h-4 w-4 text-info" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Waiting on you</h2>
            <span className="rounded-full bg-info-tint px-2 py-0.5 text-xs font-bold text-info">{youCount}</span>
          </div>
          {waitingOnYou.map(i => row(i, data.project.id))}
        </div>
      )}

      {waitingOnOthers.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-warn-tint">
              <Clock className="h-4 w-4 text-warn" />
            </span>
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink">Waiting on someone else</h2>
          </div>
          {waitingOnOthers.map(i => row(i, data.project.id))}
        </div>
      )}

      {/* What is happening next */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-tint">
              <CalendarDays className="h-4 w-4 text-accent-fg" />
            </span>
            <h2 className="text-sm font-bold text-ink">On site</h2>
            <span className="text-xs text-faint">next 3 weeks</span>
          </div>
          {upcoming.length ? (
            <div className="space-y-0">
              {upcoming.map((u, idx) => (
                <div key={u.id} className="relative flex items-baseline justify-between gap-2 pb-3 pl-5 last:pb-0">
                  {/* timeline spine */}
                  {idx < upcoming.length - 1 && <span className="absolute left-[5px] top-2 bottom-0 w-px bg-line" />}
                  <span className={cn('absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-panel',
                    u.inDays <= 0 ? 'bg-accent' : 'bg-muted2')} />
                  <span className="min-w-0 truncate text-sm font-medium text-ink-soft">{u.label}</span>
                  <span className={cn('shrink-0 text-xs font-semibold',
                    u.inDays === 0 ? 'text-accent-fg' : u.inDays < 0 ? 'text-muted-fg' : 'text-faint')}>
                    {when(u.inDays)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">Nothing scheduled in the next three weeks.</p>
          )}
          <Link href={`/projects/${data.project.id}/schedule`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline">
            Schedule <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success-tint">
              <ClipboardCheck className="h-4 w-4 text-success" />
            </span>
            <h2 className="text-sm font-bold text-ink">Booked inspections</h2>
          </div>
          {inspections.length ? (
            <div className="space-y-2">
              {inspections.map(i => (
                <div key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
                  <span className="min-w-0 truncate text-sm font-medium text-ink-soft">{i.label}</span>
                  <span className="shrink-0 rounded-full bg-panel px-2 py-0.5 text-xs font-semibold text-muted-fg">{when(i.inDays)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">None booked in the next three weeks.</p>
          )}
          <Link href={`/projects/${data.project.id}/inspections`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-accent-fg hover:underline">
            Inspections <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </div>

      {tasks.open > 0 && (
        <Link href={`/projects/${data.project.id}/tasks`}
          className="group flex items-center gap-3 rounded-xl border border-line bg-panel px-4 py-3 transition-all hover:-translate-y-px hover:border-accent hover:shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <CheckSquare className="h-4 w-4 text-muted-fg" />
          </span>
          <span className="min-w-0 flex-1 text-sm text-ink-soft">
            <span className="font-semibold text-ink">{tasks.open} open task{tasks.open === 1 ? '' : 's'}</span>
            {tasks.overdue > 0 && <span className="font-semibold text-danger"> · {tasks.overdue} overdue</span>}
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-accent-fg" />
        </Link>
      )}
    </div>
  )
}

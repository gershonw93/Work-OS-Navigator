'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { StatStrip } from '@/components/ui/stat-strip'
import { TodayStrip } from '@/components/projects/today-strip'
import { ClientThreadPanel } from '@/components/client-thread/client-thread-panel'
import { usePermissions } from '@/lib/use-permissions'
import type { TodayInput } from '@/lib/today'
import { formatDate, formatDateShort } from '@/lib/dates'
import { overviewHref } from '@/lib/overview-links'
import { useLandOnHash } from '@/lib/use-land-on'
import { CheckCircle2, ChevronRight } from 'lucide-react'

interface Item {
  key: string
  count: number
  href: string
  label: string
  detail: string | null
  tone?: 'warn' | 'danger' | 'muted'
  /** The verb on the row's button - what pressing it lets you do. */
  cta?: string
}

interface Overview {
  project: { id: string; name: string; status: string }
  money: {
    received: number; committed: number; vendorBilled: number
    vendorPaid: number; outstandingToVendors: number; pendingApproval?: number; feePct: number
  }
  waitingOnYou: Item[]
  waitingOnOthers: Item[]
  upcoming: { id: string; label: string; start_date: string; end_date: string | null; inDays: number }[]
  inspections: { id: string; label: string; date: string; inDays: number }[]
  /** Requested and past the day they were needed. */
  lateInspections?: { id: string; label: string; date: string; inDays: number }[]
  /** Raw rows for the Today strip - the DAY is decided in the browser. */
  todayFeed?: Omit<TodayInput, 'projectId'>
  tasks: { open: number; overdue: number }
  subcontracts: number
  /** Parcel, lot, utilities - only the facts somebody filled in. */
  lot?: { label: string; value: string }[]
}


const money = (n: number) => `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

function when(inDays: number) {
  if (inDays < 0) return `${Math.abs(inDays)}d ago`
  if (inDays === 0) return 'today'
  if (inDays === 1) return 'tomorrow'
  return `in ${inDays}d`
}

const late = (inDays: number) => `${Math.abs(inDays)} day${Math.abs(inDays) === 1 ? '' : 's'} late`

/** "15 certificates expired" reads as a chip of 15 and "Certificates expired". */
function splitCount(i: Item): { n: string; title: string } {
  const lead = `${i.count} `
  if (!i.label.startsWith(lead)) return { n: String(i.count), title: i.label }
  const rest = i.label.slice(lead.length)
  return { n: String(i.count), title: rest.charAt(0).toUpperCase() + rest.slice(1) }
}

const CARD = 'rounded-2xl border border-line bg-panel'
const LIST = 'divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel'
const RAIL_LINK = 'text-[13px] font-semibold text-accent-fg hover:underline'

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
 * EVERY LINE IS A LINK TO THE THING IT NAMES (`lib/overview-links.ts`): one RFI
 * opens that RFI's answer box, one bill opens that bill, several certificates
 * land on the compliance alerts. The route builds the link; the page at the
 * other end reads it (`lib/use-land-on.ts`).
 *
 * Two columns on a desktop - the piles, and a rail of what the job adds up to.
 * On a phone the rail dissolves (`contents`) and the cards take `order-*`.
 */
export default function OverviewPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [data, setData] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)
  const { can } = usePermissions()

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${params.id}/overview`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    // Subcontractors and sites have no overview. Because /projects/[id] lands
    // everyone here, this is where they get sent on - a blank page would be the
    // orphan-tab problem all over again.
    // A SITE'S front door is its list of jobs - the houses or units it
    // holds - not a file list. Its tabs' first slot points there too.
    if (res.status === 403 || res.status === 404) {
      const d = await res.json().catch(() => ({}))
      router.replace(`/projects/${params.id}/${d?.site ? 'units' : 'plans'}`)
      return
    }
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [params.id, supabase, router])

  useEffect(() => { load() }, [load])
  // "client questions waiting" links back here, to the thread.
  useLandOnHash(!!data)

  if (loading) return <div className="py-12 text-center text-sm text-faint">Loading…</div>
  if (!data) return null

  const { money: m, waitingOnYou, waitingOnOthers, upcoming, inspections, tasks } = data
  const lateInspections = data.lateInspections ?? []
  const nothingWaiting = waitingOnYou.length === 0 && waitingOnOthers.length === 0
  const youCount = waitingOnYou.length
  const to = (href: string) => `/projects/${data.project.id}/${href}`
  const today = formatDate(new Date(), { weekday: 'short', month: 'short', day: 'numeric' })

  // Outstanding is approved-and-unpaid (lib/escrow.ts). The approval queue is
  // named under it, the same sentence the Financial Summary card uses, so a
  // $9,000 bill nobody has approved is visible without being called owed.
  const pending = m.pendingApproval ?? 0
  const pendingNote = pending > 0 ? `${money(pending)} more awaiting your approval` : undefined
  const paidPct = m.vendorBilled > 0 ? Math.min(100, (m.vendorPaid / m.vendorBilled) * 100) : 0
  // The desktop rail's figures, each a link to the screen that holds it.
  const rail = [
    { label: 'Committed to vendors', value: m.committed, href: 'budget', note: `${data.subcontracts} subcontract${data.subcontracts === 1 ? '' : 's'}` },
    { label: 'Billed by vendors', value: m.vendorBilled, href: 'invoices', hint: pendingNote },
  ]

  const dot = (tone?: Item['tone']) => tone === 'danger' ? 'bg-danger-solid' : tone === 'muted' ? 'bg-muted2' : 'bg-warn'
  const chip = (tone?: Item['tone']) => tone === 'danger' ? 'bg-danger-tint text-danger' : tone === 'muted' ? 'bg-muted text-muted-fg' : 'bg-warn-tint text-warn'

  // One link per row, the whole row - the verb on the right is what it opens,
  // not a second control beside it.
  const mineRow = (i: Item) => (
    <Link key={i.key} href={to(i.href)}
      className="group flex min-h-11 items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface lg:px-5">
      <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', dot(i.tone))} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{i.label}</span>
        {i.detail && <span className="mt-0.5 block truncate text-[13px] text-muted-fg">{i.detail}</span>}
      </span>
      <span className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-accent-fg lg:inline-flex lg:h-9 lg:items-center lg:rounded-lg lg:border lg:border-muted2 lg:bg-panel lg:px-3.5 lg:text-ink lg:group-hover:border-accent">
        {i.cta ?? 'Open'}
      </span>
    </Link>
  )

  const othersRow = (i: Item) => {
    const { n, title } = splitCount(i)
    return (
      <Link key={i.key} href={to(i.href)}
        className="flex min-h-11 items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface lg:px-5">
        <span className={cn('inline-flex h-8 min-w-11 shrink-0 items-center justify-center rounded-lg px-2 text-[15px] font-bold tabular-nums', chip(i.tone))}>{n}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{title}</span>
          {i.detail && <span className="mt-0.5 block truncate text-[13px] text-muted-fg">{i.detail}</span>}
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-faint" />
      </Link>
    )
  }

  return (
    <div className="flex flex-col gap-4 lg:gap-5 lg:p-6">
      {/* FIRST, because it is the question somebody standing on the site is
          actually asking. The Master Calendar answers it and is admins-only. */}
      <TodayStrip projectId={params.id} {...(data.todayFeed ?? {})} />

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-5">
          {nothingWaiting && (
            <div className="order-2 flex items-center gap-4 rounded-2xl bg-accent px-5 py-4 text-accent-ink lg:order-none">
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
            <section className={cn(LIST, 'order-2 lg:order-none')} data-waiting-list>
              <div className="flex items-center gap-2.5 px-4 py-4 lg:px-5">
                <h2 className="text-base font-semibold text-ink">Waiting on you</h2>
                <span className="whitespace-nowrap rounded-full bg-ink px-2 py-0.5 text-xs font-bold tabular-nums text-panel">{youCount}</span>
              </div>
              {waitingOnYou.map(mineRow)}
            </section>
          )}

          {waitingOnOthers.length > 0 && (
            <section className={cn(LIST, 'order-3 lg:order-none')} data-waiting-list>
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 px-4 py-4 lg:px-5">
                <h2 className="text-base font-semibold text-ink">Waiting on others</h2>
                <span className="text-[13px] text-muted-fg">Chase these with subs and the client</span>
              </div>
              {waitingOnOthers.map(othersRow)}
            </section>
          )}

          {/* The client's general questions about the job - the "anything else?"
              box at the bottom of their link. Only for people who handle the
              client link; a thread they cannot read is not shown as a failure. */}
          {can('client-portal', 'view') && (
            <div id="client-questions" className={cn(CARD, 'order-6 scroll-mt-4 px-4 py-3 lg:order-none lg:px-5 lg:py-4')}>
              <ClientThreadPanel projectId={data.project.id} subject="project" subjectId={null} clientName={null}
                title="Client messages" />
            </div>
          )}

          {/* The lot, when anything is known about it. Facts, not a form - the
              Settings dialog is where they are edited. */}
          {!!data.lot?.length && (
            <div className={cn(CARD, 'order-8 p-4 lg:order-none lg:p-5')}>
              <h2 className="mb-3 text-[15px] font-semibold text-ink">Lot</h2>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
                {data.lot.map(f => (
                  <div key={f.label} className="min-w-0">
                    <dt className="text-xs text-muted-fg">{f.label}</dt>
                    <dd className="break-words text-sm font-medium text-ink">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </div>

        <aside className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {/* Money position. PHONE: one card of four numbers, the colour only on
              what is owed. DESKTOP: the rail card, every figure a link. */}
          <StatStrip label="Money" className="order-1 lg:hidden" items={[
            { label: 'From client', value: money(m.received), href: to('payments') },
            { label: 'Committed', value: money(m.committed), note: `${data.subcontracts} subcontract${data.subcontracts === 1 ? '' : 's'}`, href: to('budget') },
            { label: 'Billed by vendors', value: money(m.vendorBilled), note: `${money(m.vendorPaid)} paid`, href: to('invoices') },
            { label: 'Owed to vendors', value: money(m.outstandingToVendors), tone: m.outstandingToVendors > 0 ? 'warn' : undefined, note: pendingNote, href: to('invoices') },
          ]} />
          <section className={cn(CARD, 'hidden lg:flex flex-col gap-3.5 p-5')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Money</h2>
              <Link href={to('budget')} className={RAIL_LINK}>Budget</Link>
            </div>
            <Link href={to('payments')} className="group block">
              <span className="block text-[13px] text-muted-fg">Received from client</span>
              <span className="block text-[28px] font-bold leading-tight tracking-tight text-success tabular-nums group-hover:underline">{money(m.received)}</span>
            </Link>
            <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3 text-sm">
              {rail.map(r => (
                <Link key={r.label} href={to(r.href)} className="group block">
                  <span className="flex justify-between gap-2">
                    <span className="text-muted-fg group-hover:text-ink">{r.label}</span>
                    <b className="tabular-nums text-ink">{money(r.value)}</b>
                  </span>
                  {r.note && <span className="block text-xs text-muted-fg">{r.note}</span>}
                </Link>
              ))}
              <div className="flex h-2 overflow-hidden rounded-full bg-warn-tint" role="img"
                aria-label={`${money(m.vendorPaid)} of ${money(m.vendorBilled)} paid`}>
                <div className="bg-accent-fg" style={{ width: `${paidPct}%` }} />
              </div>
              <Link href={to('invoices')} className="flex justify-between gap-2 text-[13px] hover:underline">
                <span className="flex items-center gap-1.5 text-muted-fg"><span className="h-2 w-2 rounded-sm bg-accent-fg" />Paid {money(m.vendorPaid)}</span>
                <span className={cn('flex items-center gap-1.5', m.outstandingToVendors > 0 ? 'font-semibold text-warn' : 'text-muted-fg')}>
                  <span className="h-2 w-2 rounded-sm bg-warn" />Owed {money(m.outstandingToVendors)}
                </span>
              </Link>
              {rail[1].hint && <p className="text-xs text-faint">{rail[1].hint}</p>}
            </div>
          </section>

          {/* What is happening on site - every name a link to its record. */}
          <section className={cn(CARD, 'order-4 flex flex-col gap-3 p-4 lg:order-none lg:p-5')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">On site</h2>
              <span className="text-[13px] text-muted-fg">{today}</span>
            </div>
            {lateInspections.length > 0 && (
              <div className="flex flex-col gap-1">
                {lateInspections.map(i => (
                  <Link key={i.id} href={to(overviewHref.inspection(i.id))}
                    className="-mx-2 flex min-h-11 items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-surface">
                    <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger-solid" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">{i.label}</span>
                      <span className="block text-xs text-danger">Needed by {formatDateShort(i.date)} · {late(i.inDays)}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
            <div className={cn('flex flex-col gap-2 text-[13px]', lateInspections.length > 0 && 'border-t border-line-soft pt-3')}>
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-muted-fg">Next 3 weeks</span>
                {upcoming.length ? (
                  <span className="flex min-w-0 flex-col items-end gap-1">
                    {upcoming.map(u => (
                      <Link key={u.id} href={to('schedule')} className="flex max-w-full gap-2 text-ink hover:underline">
                        <span className="truncate">{u.label}</span>
                        <span className={cn('shrink-0 font-semibold', u.inDays === 0 ? 'text-accent-fg' : 'text-faint')}>{when(u.inDays)}</span>
                      </Link>
                    ))}
                  </span>
                ) : <span className="text-ink">Nothing scheduled</span>}
              </div>
              <div className="flex items-start justify-between gap-3">
                <span className="shrink-0 text-muted-fg">Inspections booked</span>
                {inspections.length ? (
                  <span className="flex min-w-0 flex-col items-end gap-1">
                    {inspections.map(i => (
                      <Link key={i.id} href={to(overviewHref.inspection(i.id))} className="flex max-w-full gap-2 text-ink hover:underline">
                        <span className="truncate">{i.label}</span>
                        <span className="shrink-0 font-semibold text-faint">{when(i.inDays)}</span>
                      </Link>
                    ))}
                  </span>
                ) : <span className="text-ink">None</span>}
              </div>
            </div>
            <div className="row-even gap-2 lg:flex lg:gap-4">
              <Link href={to('schedule')} className="inline-flex h-11 items-center justify-center rounded-[10px] border border-muted2 text-sm font-medium text-ink lg:h-auto lg:border-0 lg:text-[13px] lg:font-semibold lg:text-accent-fg lg:hover:underline">Schedule</Link>
              <Link href={to('inspections')} className="inline-flex h-11 items-center justify-center rounded-[10px] border border-muted2 text-sm font-medium text-ink lg:h-auto lg:border-0 lg:text-[13px] lg:font-semibold lg:text-accent-fg lg:hover:underline">Inspections</Link>
            </div>
          </section>

          <section className={cn(CARD, 'order-7 flex flex-col gap-2.5 p-4 lg:order-none lg:p-5')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-semibold text-ink">Tasks</h2>
              <Link href={to(overviewHref.allTasks())} className={RAIL_LINK}>View all</Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Link href={to(overviewHref.openTasks())} className="group rounded-lg">
                <span className="block text-xs text-muted-fg">Open</span>
                <span className="block text-[22px] font-bold tabular-nums text-ink group-hover:underline">{tasks.open}</span>
              </Link>
              <Link href={to('tasks?filter=overdue')} className="group rounded-lg">
                <span className="block text-xs text-muted-fg">Overdue</span>
                <span className={cn('block text-[22px] font-bold tabular-nums group-hover:underline', tasks.overdue > 0 ? 'text-danger' : 'text-ink')}>{tasks.overdue}</span>
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

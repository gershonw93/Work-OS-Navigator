'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  CheckCircle2, AlertTriangle, Clock, ExternalLink, Loader2, ArrowLeft, Palette,
} from 'lucide-react'
import { daysUntil, isOutstanding } from '@/lib/selections'

const money = (n: number | null | undefined) =>
  n == null ? null : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

interface Option {
  id: string; name: string; description: string | null; price: number | null
  vendor: string | null; link_url: string | null; image_url: string | null
}
interface Selection {
  id: string; category: string; item: string; location: string | null
  allowance_amount: number | null; needed_by: string | null; status: string
  selected_option_id: string | null; selected_name: string | null; selected_price: number | null
  selected_at: string | null; notes: string | null
  selection_options: Option[]
}

/**
 * The client's side of the selections board.
 *
 * Same token as their project portal, because a second link is a second thing
 * to lose. Read-only everywhere else in the portal; this is the one page where
 * they're the one who has to act.
 */
export default function PortalSelectionsPage({ params }: { params: { token: string } }) {
  const [rows, setRows] = useState<Selection[]>([])
  const [project, setProject] = useState<{ name: string; address: string | null; client_name: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [writeIn, setWriteIn] = useState<Record<string, string>>({})
  const [name, setName] = useState('')

  async function load() {
    const res = await fetch(`/api/portal/${params.token}/selections`)
    if (res.ok) {
      const d = await res.json()
      setRows(d.selections ?? [])
      setProject(d.project ?? null)
      setName(n => n || d.project?.client_name || '')
    } else setError((await res.json().catch(() => ({}))).error ?? 'This link is no longer valid.')
    setLoading(false)
  }
  useEffect(() => { load() }, [params.token])

  async function choose(selectionId: string, body: any) {
    setSaving(selectionId); setError('')
    const res = await fetch(`/api/portal/${params.token}/selections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection_id: selectionId, name, ...body }),
    })
    setSaving(null)
    if (res.ok) load()
    else setError((await res.json().catch(() => ({}))).error ?? 'Could not save that. Try again.')
  }

  const outstanding = useMemo(() => rows.filter(r => isOutstanding(r.status)), [rows])
  const decided = useMemo(() => rows.filter(r => !isOutstanding(r.status)), [rows])

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="min-h-screen bg-surface">
      <div className="bg-panel border-b border-line px-4 sm:px-8 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-4">
          <SyteNavLogo size={26} />
          <div className="flex items-center gap-3">
            <Link href={`/portal/${params.token}`} className="inline-flex items-center gap-1 text-xs text-muted-fg hover:text-ink">
              <ArrowLeft className="h-3.5 w-3.5" /> Project
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-8 space-y-5">{children}</div>
    </div>
  )

  if (loading) return <Shell><p className="text-center text-muted-fg py-16">Loading…</p></Shell>
  if (error && !project) return <Shell><div className="bg-panel rounded-xl border border-line p-8 text-center text-ink"><AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />{error}</div></Shell>

  return (
    <Shell>
      <div>
        <h1 className="text-2xl font-bold text-ink">Your selections</h1>
        <p className="text-sm text-muted-fg mt-1">
          {project?.name}{project?.address ? ` · ${project.address}` : ''}
        </p>
        <p className="text-sm text-muted-fg mt-2">
          These are the choices we need from you. Each one has a date we need it by - that date is set by
          how long the material takes to arrive, not by when we get to that part of the job.
        </p>
      </div>

      <div className="bg-panel rounded-xl border border-line px-4 py-3">
        <label className="text-xs uppercase tracking-wide text-faint font-semibold">Your name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="So we know who decided"
          className="mt-1 w-full rounded-lg bg-surface border border-line px-3 py-2 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none" />
      </div>

      {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      {outstanding.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" />
          <p className="text-sm text-ink font-medium">You&apos;re all caught up.</p>
          <p className="text-sm text-muted-fg mt-1">Nothing is waiting on you right now.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs uppercase tracking-wide text-faint font-semibold">
            Waiting on you ({outstanding.length})
          </p>
          {outstanding.map(sel => {
            const days = daysUntil(sel.needed_by)
            const late = days != null && days < 0
            const soon = days != null && days >= 0 && days <= 14
            return (
              <div key={sel.id} className={cn('bg-panel rounded-xl border overflow-hidden',
                late ? 'border-danger/40' : soon ? 'border-warn/40' : 'border-line')}>
                <div className="px-4 py-3 border-b border-line-soft">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-faint">{sel.category}</p>
                      <h2 className="text-base font-semibold text-ink">
                        {sel.item}{sel.location && <span className="text-muted-fg font-normal"> · {sel.location}</span>}
                      </h2>
                    </div>
                    {days != null && (
                      <span className={cn('inline-flex items-center gap-1 shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold',
                        late ? 'bg-danger-tint text-danger' : soon ? 'bg-warn-tint text-warn' : 'bg-muted text-muted-fg')}>
                        {late ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {late ? `Needed ${Math.abs(days)} days ago` : `${days} days to decide`}
                      </span>
                    )}
                  </div>
                  {sel.allowance_amount != null && (
                    <p className="text-sm text-muted-fg mt-1.5">
                      Budgeted at <span className="font-semibold text-ink">{money(sel.allowance_amount)}</span>. Anything
                      above that is an extra we&apos;ll write up before we order.
                    </p>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  {sel.selection_options.length > 0 ? (
                    sel.selection_options.map(o => {
                      const over = sel.allowance_amount != null && o.price != null ? Number(o.price) - Number(sel.allowance_amount) : null
                      return (
                        <div key={o.id} className="rounded-lg border border-line p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-ink">{o.name}</p>
                              {o.vendor && <p className="text-xs text-faint">{o.vendor}</p>}
                              {o.description && <p className="text-sm text-muted-fg mt-1">{o.description}</p>}
                            </div>
                            <div className="text-right shrink-0">
                              {o.price != null && <p className="text-sm font-bold text-ink">{money(o.price)}</p>}
                              {over != null && over !== 0 && (
                                <p className={cn('text-xs font-semibold', over > 0 ? 'text-danger' : 'text-success')}>
                                  {over > 0 ? `${money(over)} extra` : `${money(Math.abs(over))} back`}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3 mt-2.5">
                            <button onClick={() => choose(sel.id, { option_id: o.id })} disabled={saving === sel.id}
                              className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 hover:bg-accent/90 disabled:opacity-60 inline-flex items-center gap-1.5">
                              {saving === sel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Choose this
                            </button>
                            {o.link_url && (
                              <a href={o.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent-fg hover:underline">
                                <ExternalLink className="h-3.5 w-3.5" /> See it
                              </a>
                            )}
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-fg">
                      No set options here - tell us what you&apos;d like and we&apos;ll price it.
                    </p>
                  )}

                  {/* A write-in is just as valid a decision as picking an option. */}
                  <div className="pt-1">
                    <p className="text-xs text-faint mb-1.5">
                      {sel.selection_options.length > 0 ? 'Or something else:' : 'What did you choose?'}
                    </p>
                    <div className="flex gap-2">
                      <input value={writeIn[sel.id] ?? ''} onChange={e => setWriteIn(p => ({ ...p, [sel.id]: e.target.value }))}
                        placeholder="e.g. Sherwin Williams Alabaster"
                        className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-3 py-2 text-base text-ink placeholder:text-faint focus:border-accent focus:outline-none" />
                      <button onClick={() => choose(sel.id, { selected_name: writeIn[sel.id] })}
                        disabled={saving === sel.id || !(writeIn[sel.id] ?? '').trim()}
                        className="shrink-0 rounded-lg border border-line px-4 text-sm font-medium text-ink-soft hover:bg-surface disabled:opacity-50">
                        Submit
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {decided.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-faint font-semibold">Already decided ({decided.length})</p>
          <div className="bg-panel rounded-xl border border-line divide-y divide-line-soft">
            {decided.map(sel => (
              <div key={sel.id} className="px-4 py-2.5 flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-ink-soft min-w-0">
                  {sel.item}
                  {sel.location && <span className="text-faint"> · {sel.location}</span>}
                  {sel.selected_name && <span className="block text-xs text-muted-fg">{sel.selected_name}</span>}
                </span>
                <span className="text-xs text-faint shrink-0 capitalize">
                  {sel.status === 'chosen' ? 'Chosen' : sel.status}
                  {sel.selected_price != null ? ` · ${money(sel.selected_price)}` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-faint">
            Changed your mind on something not yet ordered? Pick again above, or give us a call.
          </p>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-faint pt-2">
        <Palette className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        No account needed - this link is just for you.
      </p>
    </Shell>
  )
}

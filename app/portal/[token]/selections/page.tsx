'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  CheckCircle2, AlertTriangle, Clock, ExternalLink, Loader2, ArrowLeft, Palette, Pencil, Truck,
} from 'lucide-react'
import { daysUntil, isOutstanding, STATUS_TINT, type SelectionStatus } from '@/lib/selections'

const money = (n: number | null | undefined) =>
  n == null ? null : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/** What the client should call each stage. Not the GC's internal wording. */
const CLIENT_STATUS: Record<string, string> = {
  pending: 'Not started',
  waiting: 'Waiting on you',
  chosen: 'You chose this',
  ordered: 'Ordered',
  installed: 'Installed',
}

interface Option {
  id: string; name: string; description: string | null; price: number | null
  brand: string | null; model_number: string | null
  color_hex: string | null; image_url: string | null; link_url: string | null
}
interface Selection {
  id: string; category: string; item: string; location: string | null
  allowance_amount: number | null; needed_by: string | null; status: SelectionStatus
  selected_option_id: string | null; selected_name: string | null; selected_price: number | null
  selected_at: string | null; notes: string | null
  ordered_at: string | null; expected_delivery: string | null
  change_requested_at: string | null
  selection_options: Option[]
}

export default function PortalSelectionsPage({ params }: { params: { token: string } }) {
  const [rows, setRows] = useState<Selection[]>([])
  const [project, setProject] = useState<{ name: string; address: string | null; client_name: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [writeIn, setWriteIn] = useState<Record<string, string>>({})
  const [reopened, setReopened] = useState<Set<string>>(new Set())
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
    setSaving(selectionId); setError(''); setNotice('')
    const res = await fetch(`/api/portal/${params.token}/selections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selection_id: selectionId, name, ...body }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(null)
    if (res.ok) {
      setNotice(data.message ?? 'Saved.')
      setReopened(p => { const n = new Set(p); n.delete(selectionId); return n })
      load()
    } else setError(data.error ?? 'Could not save that. Try again.')
  }

  const outstanding = useMemo(() => rows.filter(r => isOutstanding(r.status)), [rows])
  const decided = useMemo(() => rows.filter(r => !isOutstanding(r.status)), [rows])
  // A decided item they've asked to revisit joins the list they can act on.
  const openNow = useMemo(
    () => [...outstanding, ...decided.filter(r => reopened.has(r.id))],
    [outstanding, decided, reopened])

  const toggleReopen = (id: string) => setReopened(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

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
        <p className="text-sm text-muted-fg mt-1">{project?.name}{project?.address ? ` · ${project.address}` : ''}</p>
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

      {notice && <p className="rounded-lg bg-success-tint px-3 py-2 text-sm text-success">{notice}</p>}
      {error && <p className="rounded-lg bg-danger-tint px-3 py-2 text-sm text-danger">{error}</p>}

      {openNow.length === 0 ? (
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
          {openNow.map(sel => {
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
                    {days != null && isOutstanding(sel.status) && (
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
                  {sel.selected_name && (
                    <p className="text-xs text-info mt-1.5">
                      You currently have <span className="font-semibold">{sel.selected_name}</span> - picking again replaces it.
                    </p>
                  )}
                </div>

                <div className="p-4 space-y-2">
                  {sel.selection_options.length > 0 ? (
                    sel.selection_options.map(o => {
                      const over = sel.allowance_amount != null && o.price != null
                        ? Number(o.price) - Number(sel.allowance_amount) : null
                      const isCurrent = sel.selected_option_id === o.id
                      return (
                        <div key={o.id} className={cn('rounded-lg border p-3',
                          isCurrent ? 'border-accent bg-accent-tint' : 'border-line')}>
                          <div className="flex items-start gap-3">
                            {/* You cannot choose a color from a text label. */}
                            {o.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={o.image_url} alt={o.name}
                                className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
                            ) : o.color_hex ? (
                              <span className="h-16 w-16 shrink-0 rounded-lg border border-line"
                                style={{ backgroundColor: o.color_hex }} aria-label={`Color swatch ${o.color_hex}`} />
                            ) : null}

                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  {o.brand && <p className="text-[11px] uppercase tracking-wide text-faint font-semibold">{o.brand}</p>}
                                  <p className="text-sm font-semibold text-ink">{o.name}</p>
                                  {o.model_number && <p className="text-[11px] text-faint">Model {o.model_number}</p>}
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
                              <div className="flex flex-wrap items-center gap-3 mt-2.5">
                                <button onClick={() => choose(sel.id, { option_id: o.id })} disabled={saving === sel.id}
                                  className={cn('rounded-lg text-sm font-semibold px-4 py-2 disabled:opacity-60 inline-flex items-center gap-1.5',
                                    isCurrent ? 'border border-accent text-accent-fg' : 'bg-accent text-accent-ink hover:bg-accent/90')}>
                                  {saving === sel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                                  {isCurrent ? 'Keep this' : 'Choose this'}
                                </button>
                                {o.link_url && (
                                  <a href={o.link_url} target="_blank" rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                                    <ExternalLink className="h-3.5 w-3.5" /> See it online
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-fg">
                      No set options here - tell us what you&apos;d like and we&apos;ll price it.
                    </p>
                  )}

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
            {decided.map(sel => {
              const opt = sel.selection_options.find(o => o.id === sel.selected_option_id)
              const canChange = sel.status === 'chosen'
              return (
                <div key={sel.id} className="px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0">
                      {opt?.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opt.image_url} alt="" className="h-10 w-10 shrink-0 rounded-md border border-line object-cover" />
                      ) : opt?.color_hex ? (
                        <span className="h-10 w-10 shrink-0 rounded-md border border-line" style={{ backgroundColor: opt.color_hex }} />
                      ) : null}
                      <div className="min-w-0">
                        <p className="text-sm text-ink-soft">
                          {sel.item}{sel.location && <span className="text-faint"> · {sel.location}</span>}
                        </p>
                        {sel.selected_name && (
                          <p className="text-xs text-muted-fg">
                            {opt?.brand ? `${opt.brand} ` : ''}{sel.selected_name}
                            {sel.selected_price != null ? ` · ${money(sel.selected_price)}` : ''}
                          </p>
                        )}
                        {sel.status === 'ordered' && sel.expected_delivery && (
                          <p className="text-[11px] text-accent-fg inline-flex items-center gap-1 mt-0.5">
                            <Truck className="h-3 w-3" /> Due {new Date(sel.expected_delivery + 'T00:00:00').toLocaleDateString()}
                          </p>
                        )}
                        {sel.change_requested_at && (
                          <p className="text-[11px] text-warn mt-0.5">
                            Change requested - we&apos;ll be in touch.
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* The client should be able to see where each one is up to. */}
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', STATUS_TINT[sel.status])}>
                        {CLIENT_STATUS[sel.status] ?? sel.status}
                      </span>
                      {canChange ? (
                        <button onClick={() => toggleReopen(sel.id)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline">
                          <Pencil className="h-3 w-3" /> {reopened.has(sel.id) ? 'Cancel' : 'Change'}
                        </button>
                      ) : !sel.change_requested_at ? (
                        <button onClick={() => toggleReopen(sel.id)}
                          className="text-xs font-medium text-muted-fg hover:text-ink hover:underline">
                          Need a change?
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {/* Already ordered: a request, not an edit. Saying otherwise
                      would let them believe a change happened when the truck is
                      already loaded. */}
                  {reopened.has(sel.id) && !canChange && (
                    <div className="mt-2.5 rounded-lg border border-warn/40 bg-warn-tint p-3 space-y-2">
                      <p className="text-xs text-warn">
                        This is already {sel.status === 'installed' ? 'installed' : 'on order'}. Tell us what you&apos;d
                        rather have and we&apos;ll let you know if we can still change it.
                      </p>
                      <div className="flex gap-2">
                        <input value={writeIn[sel.id] ?? ''} onChange={e => setWriteIn(p => ({ ...p, [sel.id]: e.target.value }))}
                          placeholder="What would you like instead?"
                          className="flex-1 min-w-0 rounded-lg bg-surface border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none" />
                        <button onClick={() => choose(sel.id, { selected_name: writeIn[sel.id] })}
                          disabled={saving === sel.id || !(writeIn[sel.id] ?? '').trim()}
                          className="shrink-0 rounded-lg bg-accent text-accent-ink px-4 text-sm font-semibold disabled:opacity-50">
                          Send request
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <p className="flex items-start gap-2 text-xs text-faint pt-2">
        <Palette className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        No account needed - this link is just for you.
      </p>
    </Shell>
  )
}

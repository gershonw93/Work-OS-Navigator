'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Receipt, GitPullRequest, ShoppingCart, FileText, ExternalLink, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { parseDate } from '@/lib/dates'

const money = (n: unknown) =>
  `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

interface TiedInvoice {
  id: string
  invoice_number: string | null
  company_name: string | null
  description: string | null
  /** What lands on THIS line - a slice, when the bill was split. */
  amount: number
  invoice_total: number
  status: string
  created_at: string | null
  note: string | null
  via: 'split' | 'contract'
  /** Whether it has been accepted, and so actually counts against the budget. */
  counts: boolean
}

/**
 * What is behind one budget line.
 *
 * The sheet could say a line was at $86,340 and nothing about what made it
 * that. Answering "why" meant opening three other tabs and matching things up
 * by the sub's name.
 *
 * Also where the line's markup lives, because "permits at cost, electrical at
 * 15%" is a fact about the trade, not about each bill as it happens to arrive.
 */
export function BudgetLineDetail({
  projectId, lineId, projectMarkup, costPlus, onClose, onChanged, onEdit,
}: {
  projectId: string
  lineId: string
  /** Project rate as a percent, for the "follows the job" placeholder. */
  projectMarkup: number
  costPlus: boolean
  onClose: () => void
  onChanged?: () => void
  /** Opens the row's own edit form - cost code, description, amounts. */
  onEdit?: () => void
}) {
  const supabase = createClient()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`/api/projects/${projectId}/budget/${lineId}`, {
      headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
    })
    if (res.ok) setData(await res.json())
    setLoading(false)
  }, [projectId, lineId, supabase])

  useEffect(() => { load() }, [load])

  // Escape closes. A modal you can only leave by aiming at a small x is a
  // modal people stop opening.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function saveMarkup(patch: { markup_pct?: number | null; markup_excluded?: boolean }) {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch(`/api/projects/${projectId}/budget/${lineId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify(patch),
      })
      await load()
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const line = data?.line
  const invoices: TiedInvoice[] = data?.invoices ?? []
  const changeOrders = data?.change_orders ?? []
  const materials = data?.materials ?? []

  // Every figure comes off the shared rollup rather than being re-added here.
  // Adding them up locally is how this panel came to disagree with the row that
  // opened it - it worked out "Left" as budget less what had been billed, which
  // ignores a signed contract entirely.
  const r = data?.rollup
  const pending = invoices.filter(i => !i.counts).reduce((s, i) => s + i.amount, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-6"
      onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium text-faint">
              {[line?.cost_code, line?.category].filter(Boolean).join(' · ') || 'Budget line'}
            </p>
            <h2 className="truncate text-lg font-semibold text-ink">{line?.description || 'Budget line'}</h2>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {onEdit && (
              <button onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-muted-fg transition-colors hover:border-accent hover:text-accent-fg">
                <Pencil className="h-3.5 w-3.5" /> Edit line
              </button>
            )}
            <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {loading ? (
          <p className="px-5 py-8 text-sm text-faint">Loading…</p>
        ) : (
          <div className="max-h-[75vh] space-y-5 overflow-y-auto px-5 py-4">
            {/* The same four columns as the row on the sheet, in the same
                order, from the same rollup - so they cannot disagree. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Figure label="Budgeted" value={money(r?.revised_budget)}
                note={r?.change_orders_amount
                  ? `${money(r.original_budget)} + ${money(r.change_orders_amount)} CO`
                  : 'as estimated'} />
              <Figure label="Committed" value={money(r?.committed_amount)} tone="text-info"
                note={r && r.committed_amount > r.actual_amount
                  ? `${money(r.committed_amount - r.actual_amount)} signed, not billed`
                  : undefined} />
              <Figure label="Actual" value={money(r?.actual_amount)} tone="text-success"
                note={pending > 0
                  ? `${money(pending)} not yet approved`
                  : (r?.materials_amount ? `incl. ${money(r.materials_amount)} receipts` : undefined)} />
              <Figure label="Variance" value={money(r?.variance)}
                tone={(r?.variance ?? 0) < 0 ? 'text-danger' : 'text-success'}
                note="budget less the bigger of signed or billed" />
            </div>

            {data?.subcontract && (
              <Section icon={FileText} title="Contract">
                <Row
                  left={data.subcontract.companies?.name ?? data.subcontract.trade ?? 'Subcontract'}
                  sub={data.subcontract.trade ?? undefined}
                  right={money(data.subcontract.contract_amount)}
                />
              </Section>
            )}

            <Section icon={Receipt} title={`Bills (${invoices.length})`}
              empty={invoices.length === 0 ? 'No bills have landed on this line yet.' : undefined}>
              {invoices.map(i => (
                <Row key={`${i.id}-${i.via}`}
                  left={i.company_name || i.invoice_number || 'Invoice'}
                  sub={[
                    i.invoice_number,
                    i.via === 'split'
                      ? `part of a ${money(i.invoice_total)} bill`
                      : null,
                    i.counts ? null : `${i.status.replace(/_/g, ' ')} - not counted yet`,
                  ].filter(Boolean).join(' · ')}
                  right={money(i.amount)}
                  dim={!i.counts}
                  href={`/projects/${projectId}/invoices`}
                />
              ))}
            </Section>

            <Section icon={GitPullRequest} title={`Change orders (${changeOrders.length})`}
              empty={changeOrders.length === 0 ? 'No change orders against this line.' : undefined}>
              {changeOrders.map((c: any) => (
                <Row key={c.id}
                  left={c.title || 'Change order'}
                  sub={c.status === 'approved' ? 'approved - raises this budget' : `${c.status} - not counted`}
                  right={money(c.amount)}
                  dim={c.status !== 'approved'}
                  href={`/projects/${projectId}/change-orders`}
                />
              ))}
            </Section>

            {materials.length > 0 && (
              <Section icon={ShoppingCart} title={`Receipts (${materials.length})`}>
                {materials.map((m: any) => (
                  <Row key={m.id}
                    left={m.store_name || m.category || 'Purchase'}
                    sub={m.purchase_date ? parseDate(m.purchase_date)!.toLocaleDateString() : undefined}
                    right={money(m.amount)}
                    href={`/projects/${projectId}/materials`}
                  />
                ))}
              </Section>
            )}

            {/* Markup for this trade. Only worth showing where it is the pay. */}
            {costPlus && (
              <div className="rounded-lg border border-accent/30 bg-accent-tint/20 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-fg">
                  Markup on this line
                  <InfoHint className="ml-1 align-middle" text={'The rate for everything landing on this line.\n\nSet it once here instead of on every bill as it arrives - "permits at cost, electrical at 15%" is a fact about the trade, not about each invoice.\n\nA single bill can still overrule it on the Bills from subs tab. Leave it blank and the line follows the project rate, so changing that still moves it.'} />
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 text-muted-fg">
                    <input type="checkbox" className="accent-[#C9F24A]"
                      checked={!!line?.markup_excluded} disabled={saving}
                      onChange={e => saveMarkup({ markup_excluded: e.target.checked })} />
                    Everything on this line bills at cost
                  </label>
                  {!line?.markup_excluded && (
                    <span className="inline-flex items-center gap-1.5 text-muted-fg">
                      Rate
                      <input type="number" min="0" step="0.5"
                        defaultValue={line?.markup_pct ?? ''}
                        placeholder={String(projectMarkup)}
                        disabled={saving}
                        onBlur={e => {
                          const raw = e.target.value.trim()
                          const next = raw === '' ? null : Number(raw)
                          if (next !== (line?.markup_pct ?? null)) saveMarkup({ markup_pct: next })
                        }}
                        className="w-16 rounded-md border border-muted2 bg-panel px-2 py-1 text-sm tabular-nums text-ink focus:border-accent focus:outline-none" />
                      %
                      <span className="text-xs text-faint">
                        {line?.markup_pct == null
                          ? `following the job's ${projectMarkup}%`
                          : 'set on this line'}
                      </span>
                    </span>
                  )}
                  {saving && <span className="text-xs text-faint">saving…</span>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Figure({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-line px-3 py-2">
      <p className="text-[11px] font-medium text-muted-fg">{label}</p>
      <p className={cn('text-base font-bold tabular-nums', tone ?? 'text-ink')}>{value}</p>
      {note && <p className="mt-0.5 text-[10px] leading-tight text-faint">{note}</p>}
    </div>
  )
}

function Section({ icon: Icon, title, children, empty }: {
  icon: any; title: string; children?: React.ReactNode; empty?: string
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-fg">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {empty ? <p className="text-sm text-faint">{empty}</p> : <div className="space-y-1">{children}</div>}
    </div>
  )
}

function Row({ left, sub, right, dim, href }: {
  left: string; sub?: string; right: string; dim?: boolean; href?: string
}) {
  const body = (
    <div className={cn(
      'flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2',
      href && 'transition-colors hover:border-accent hover:bg-surface',
      dim && 'opacity-60',
    )}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink-soft">{left}</p>
        {sub && <p className="truncate text-[11px] text-faint">{sub}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="text-sm font-semibold tabular-nums text-ink">{right}</span>
        {href && <ExternalLink className="h-3 w-3 text-faint" />}
      </div>
    </div>
  )
  return href ? <a href={href}>{body}</a> : body
}

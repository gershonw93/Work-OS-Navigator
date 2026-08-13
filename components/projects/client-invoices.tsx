'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { FileText, Plus, Printer, Loader2, Trash2, Check } from 'lucide-react'

const money = (n: unknown) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

interface Billable {
  kind: 'invoice' | 'material'
  source_id: string
  description: string
  reference: string | null
  date: string | null
  cost: number
  pct: number
  markup: number
  clientPrice: number
  excluded: boolean
}

interface BillLine {
  id: string
  description: string
  cost: number
  markup_pct: number
  markup: number
  amount: number
}

interface Bill {
  id: string
  invoice_number: string
  status: string
  issue_date: string
  due_date: string | null
  show_markup: boolean
  client_invoice_lines: BillLine[]
}

const STATUS: Record<string, string> = {
  draft: 'bg-surface text-muted-fg border-line',
  sent: 'bg-info-tint text-info border-info/30',
  paid: 'bg-success-tint text-success border-success/30',
  void: 'bg-danger-tint text-danger border-danger/30',
}

/**
 * Billing the client on a simple-billing job.
 *
 * Built from cost already recorded - approved sub invoices and receipts - each
 * carrying its own markup, so nothing is retyped and the figures cannot drift
 * from the costs they came from.
 */
export function ClientInvoices({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [billable, setBillable] = useState<Billable[]>([])
  const [markupPct, setMarkupPct] = useState(0)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [creating, setCreating] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showMarkup, setShowMarkup] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }, [supabase])

  const load = useCallback(async () => {
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/client-invoices`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setBills(d.invoices ?? [])
      setBillable(d.billable ?? [])
      setMarkupPct(Number(d.markup_pct) || 0)
    }
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  const key = (b: Billable) => `${b.kind}:${b.source_id}`
  const chosen = billable.filter(b => picked.has(key(b)))
  const totals = chosen.reduce(
    (t, b) => ({ cost: t.cost + b.cost, markup: t.markup + b.markup, total: t.total + b.clientPrice }),
    { cost: 0, markup: 0, total: 0 },
  )

  async function create() {
    if (!chosen.length) return
    setCreating(true); setError('')
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/client-invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        sources: chosen.map(c => ({ kind: c.kind, source_id: c.source_id })),
        show_markup: showMarkup,
        due_date: dueDate || null,
      }),
    })
    setCreating(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not raise the invoice'); return }
    setPicked(new Set()); setBuilding(false); setDueDate('')
    load()
  }

  async function setStatus(bill: Bill, status: string) {
    const t = await token()
    await fetch(`/api/projects/${projectId}/client-invoices/${bill.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ status }),
    })
    load()
  }

  async function remove(bill: Bill) {
    if (!confirm(`Delete ${bill.invoice_number}? The costs on it go back to being billable.`)) return
    const t = await token()
    await fetch(`/api/projects/${projectId}/client-invoices/${bill.id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${t}` },
    })
    load()
  }

  if (loading) return <p className="text-sm text-faint">Loading…</p>

  return (
    <div className="rounded-xl border border-line bg-panel p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-ink">Invoices to your client</p>
          <p className="text-xs text-muted-fg mt-0.5">
            Built from costs you have already approved, with your markup applied.
          </p>
        </div>
        {!building && (
          <Button size="sm" onClick={() => setBuilding(true)} disabled={billable.length === 0}>
            <Plus className="h-4 w-4" /> Bill the client
          </Button>
        )}
      </div>

      {billable.length === 0 && !building && bills.length === 0 && (
        <p className="text-sm text-faint">
          Nothing to bill yet. Approve a sub&apos;s invoice or add a material receipt and it shows up here,
          with your markup on it.
        </p>
      )}

      {building && (
        <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
          <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">
            What is going on this invoice
          </p>

          {billable.length === 0 ? (
            <p className="text-sm text-faint">Every recorded cost is already on an invoice.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-line divide-y divide-line-soft bg-panel">
              {billable.map(b => (
                <label key={key(b)} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface">
                  <input type="checkbox" className="accent-[#C9F24A] shrink-0"
                    checked={picked.has(key(b))}
                    onChange={e => setPicked(p => {
                      const n = new Set(p)
                      if (e.target.checked) n.add(key(b)); else n.delete(key(b))
                      return n
                    })} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-ink-soft truncate">{b.description}</span>
                    <span className="block text-[11px] text-faint">
                      {b.reference ? `${b.reference} · ` : ''}{money(b.cost)} cost
                      {b.excluded ? ' · at cost, no markup' : ` + ${b.pct}% (${money(b.markup)})`}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink tabular-nums shrink-0">{money(b.clientPrice)}</span>
                </label>
              ))}
            </div>
          )}

          {/* The whole question: does the client see what it cost you? */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" className="accent-[#C9F24A] mt-0.5"
              checked={showMarkup} onChange={e => setShowMarkup(e.target.checked)} />
            <span className="text-sm text-ink-soft">
              Show the client the cost and my markup
              <InfoHint className="ml-1 align-middle" text={
                'ON: each line shows what it cost, your percentage, and the total - the open-book presentation a cost-plus contract usually requires.\n\n'
                + 'OFF: the client sees one amount per line and one total. Your margin is not on the document.\n\n'
                + 'It defaults to OFF because a client who was never shown your margin cannot be un-shown it. You can change it on a draft before you send.'
              } />
              <span className="block text-xs text-faint mt-0.5">
                {showMarkup
                  ? `Each line will read: cost + ${markupPct}% = amount.`
                  : 'The client sees one amount per line. Your markup is not shown.'}
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1">Due date <span className="text-faint font-normal">(optional)</span></label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className="h-8 w-40 text-sm" />
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs text-muted-fg">
                {chosen.length} item{chosen.length !== 1 ? 's' : ''} · {money(totals.cost)} cost + {money(totals.markup)} markup
              </p>
              <p className="text-xl font-bold text-accent-fg tabular-nums">{money(totals.total)}</p>
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => { setBuilding(false); setPicked(new Set()); setError('') }}>
              Cancel
            </Button>
            <Button size="sm" onClick={create} disabled={creating || !chosen.length}>
              {creating ? <><Loader2 className="h-4 w-4 animate-spin" /> Raising…</> : `Raise invoice for ${money(totals.total)}`}
            </Button>
          </div>
        </div>
      )}

      {bills.length > 0 && (
        <div className="rounded-lg border border-line divide-y divide-line-soft">
          {bills.map(b => {
            const total = (b.client_invoice_lines ?? []).reduce((s, l) => s + Number(l.amount || 0), 0)
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 text-faint shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.invoice_number}</span>
                  <span className="block text-[11px] text-faint">
                    {(b.client_invoice_lines ?? []).length} line{(b.client_invoice_lines ?? []).length !== 1 ? 's' : ''}
                    {' · '}{b.show_markup ? 'markup shown' : 'flat amounts'}
                    {b.due_date ? ` · due ${new Date(b.due_date + 'T00:00:00').toLocaleDateString()}` : ''}
                  </span>
                </span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0', STATUS[b.status] ?? STATUS.draft)}>
                  {b.status}
                </span>
                <span className="ml-auto text-sm font-bold text-ink tabular-nums shrink-0">{money(total)}</span>
                <Link href={`/projects/${projectId}/client-invoices/${b.id}/print`} target="_blank"
                  className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface">
                  <Printer className="h-3 w-3" /> View / Print
                </Link>
                {b.status === 'draft' && (
                  <button onClick={() => setStatus(b, 'sent')}
                    className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface">
                    Mark sent
                  </button>
                )}
                {b.status === 'sent' && (
                  <button onClick={() => setStatus(b, 'paid')}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-tint px-2 py-1 text-xs font-medium text-success">
                    <Check className="h-3 w-3" /> Mark paid
                  </button>
                )}
                {b.status === 'draft' && (
                  <button onClick={() => remove(b)} title="Delete this draft"
                    className="shrink-0 p-1 text-faint hover:text-danger">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

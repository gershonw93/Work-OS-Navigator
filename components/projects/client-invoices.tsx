'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { clientAppOrigin } from '@/lib/app-url'
import { SendLinkBox } from '@/components/ui/send-link-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { FileText, Plus, Printer, Loader2, Trash2, Check, Copy, Mail, Eye } from 'lucide-react'

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
  token: string | null
  viewed_at: string | null
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
  const [copied, setCopied] = useState('')
  const [sendingId, setSendingId] = useState('')
  const [clientEmail, setClientEmail] = useState('')
  const [clientName, setClientName] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)

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
      setClientName(d.client ?? null)
      setProjectName(d.project_name ?? null)
    }
    setLoading(false)
  }, [projectId, token])

  // The client's address for the Send box. The old mailto was
  // `mailto:?subject=...` - an empty To: field next to a link the app could
  // have addressed itself.
  useEffect(() => {
    (async () => {
      const t = await token()
      if (!t) return
      const res = await fetch(`/api/projects/${projectId}/client-email`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) setClientEmail((await res.json())?.clientEmail ?? '')
    })()
  }, [projectId, token])

  useEffect(() => { load() }, [load])

  // Arriving from "Bill the client for this" on a sub's bill: open the composer
  // with that one cost already ticked. Approving a sub bill and then hunting
  // for it in a list of billable costs is the step people were dropping.
  const [prefilled, setPrefilled] = useState(false)
  useEffect(() => {
    if (prefilled || loading || !billable.length) return
    const wanted = new URLSearchParams(window.location.search).get('bill')
    if (!wanted) return
    const hit = billable.find(b => b.kind === 'invoice' && b.source_id === wanted)
    if (hit) {
      setPicked(new Set([`${hit.kind}:${hit.source_id}`]))
      setBuilding(true)
      // Leave the URL clean so a refresh does not re-open the composer.
      window.history.replaceState({}, '', window.location.pathname)
    }
    setPrefilled(true)
  }, [prefilled, loading, billable])

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

  // clientAppOrigin(), NOT window.location.origin. The bill page lives on the
  // app domain; built from wherever the page happened to be, this minted links
  // to the marketing host that a client could not open. Same bug as the admin
  // invite link (#288).
  const linkFor = (b: Bill) => (b.token ? `${clientAppOrigin()}/bill/${b.token}` : '')

  async function copyLink(b: Bill) {
    const url = linkFor(b)
    if (!url) return
    await navigator.clipboard.writeText(url)
    setCopied(b.id)
    setTimeout(() => setCopied(''), 1800)
  }

  /**
   * KEPT as a fallback, not as the main route.
   *
   * The comment here used to argue that a mailto beat a Send button because
   * there was no transactional email configured. There is now, so Send is
   * real - but this stays for the case where sending is off or fails, which
   * is exactly what the failure message tells you to fall back to.
   */
  function mailtoFor(b: Bill) {
    const total = (b.client_invoice_lines ?? []).reduce((s, l) => s + Number(l.amount || 0), 0)
    const subject = `Invoice ${b.invoice_number}${projectName ? ` - ${projectName}` : ''}`
    const body = [
      `Hi${clientName ? ` ${clientName}` : ''},`,
      '',
      `Invoice ${b.invoice_number} for ${money(total)} is ready${b.due_date ? `, due ${new Date(b.due_date + 'T00:00:00').toLocaleDateString()}` : ''}.`,
      '',
      'You can view it here:',
      linkFor(b),
      '',
      'Thanks,',
    ].join('\n')
    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
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
              <div key={b.id}>
              <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 text-faint shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.invoice_number}</span>
                  <span className="block text-[11px] text-faint">
                    {(b.client_invoice_lines ?? []).length} line{(b.client_invoice_lines ?? []).length !== 1 ? 's' : ''}
                    {' · '}{b.show_markup ? 'markup shown' : 'flat amounts'}
                    {b.viewed_at ? ' · opened by the client' : b.status === 'sent' ? ' · not opened yet' : ''}
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
                    className="shrink-0 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface"
                    title="Issues it and creates the client's link">
                    Issue &amp; get link
                  </button>
                )}
                {b.token && b.status !== 'draft' && (
                  <>
                    <button onClick={() => copyLink(b)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface">
                      <Copy className="h-3 w-3" /> {copied === b.id ? 'Copied' : 'Copy link'}
                    </button>
                    <button onClick={() => setSendingId(sendingId === b.id ? '' : b.id)}
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface">
                      <Mail className="h-3 w-3" /> Email
                    </button>
                    <a href={mailtoFor(b)} title="Compose it yourself instead"
                      className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-faint hover:bg-surface">
                      By hand
                    </a>
                  </>
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

              {sendingId === b.id && b.token && (
                <div className="border-t border-line-soft bg-surface/50 px-3 py-3">
                  <SendLinkBox
                    endpoint={`/api/projects/${projectId}/client-invoices/${b.id}/send`}
                    url={linkFor(b)}
                    defaultTo={clientEmail}
                    label={`Email invoice ${b.invoice_number} to the client`}
                    placeholder="client@example.com"
                    onSent={() => load()}
                  />
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { clientAppOrigin } from '@/lib/app-url'
import { SendLinkBox } from '@/components/ui/send-link-box'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { InfoHint } from '@/components/ui/info-hint'
import { FileText, Plus, Printer, Loader2, Trash2, Check, Copy, Mail, MoreHorizontal, AlertTriangle } from 'lucide-react'
import { useClientEmail } from '@/lib/use-client-email'
import { invoiceQbChip, openedLabel } from '@/lib/invoice-qb-state'

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
  /** Last open and how many, so "opened" stops being one bit of information. */
  last_viewed_at: string | null
  view_count: number | null
  /** Set once it reaches QuickBooks - the same fact the payments list shows. */
  qbo_id: string | null
  /**
   * Whether the money settling this invoice reached QuickBooks too. The
   * invoice being over there and the payment being over there are different
   * facts, and one green tick for both is how an invoice showed as paid here
   * while it was still an open receivable there.
   */
  settlement: { recorded: boolean; in_qbo: boolean; amount: number } | null
  client_invoice_lines: BillLine[]
}

const STATUS: Record<string, string> = {
  draft: 'bg-surface text-muted-fg border-line',
  sent: 'bg-info-tint text-info border-info/30',
  paid: 'bg-success-tint text-success border-success/30',
  void: 'bg-danger-tint text-danger border-danger/30',
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

/**
 * The rest of a row's actions, behind one button.
 *
 * A sent invoice carried seven controls in a row - View / Print, Copy link,
 * Email, By hand, Mark paid, a QuickBooks chip and Void - all the same size
 * and weight, with the one you want (Mark paid) and the one you never want
 * (Void) sitting next to each other. One action reads as the action; the rest
 * are here when you go looking.
 *
 * At module scope on purpose. Declared inside the list component, every render
 * would create a new component type and remount the open menu shut.
 */
function RowMenu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="inline-flex items-center rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-line bg-panel py-1 shadow-lg">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

function MenuItem({ onClick, href, newTab, danger, children }: {
  onClick?: () => void
  href?: string
  newTab?: boolean
  danger?: boolean
  children: React.ReactNode
}) {
  const cls = cn(
    'flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium hover:bg-surface',
    danger ? 'text-danger' : 'text-muted-fg',
  )
  return href
    ? (
      <a role="menuitem" href={href} onClick={onClick} className={cls}
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {children}
      </a>
    )
    : <button role="menuitem" type="button" onClick={onClick} className={cls}>{children}</button>
}

/**
 * Billing the client on a simple-billing job.
 *
 * Built from cost already recorded - approved sub invoices and receipts - each
 * carrying its own markup, so nothing is retyped and the figures cannot drift
 * from the costs they came from.
 */
export function ClientInvoices({
  projectId, onSettle, reloadKey = 0,
}: {
  projectId: string
  /**
   * "Mark paid" hands the invoice up to the page, which opens the same Record
   * a client payment box everything else uses.
   *
   * It used to just set status='paid': no money in the ledger, no date, no
   * method, nothing in Funds Received - and the QuickBooks invoice stayed
   * open, so receivables kept counting money that had already arrived. An
   * invoice is not paid because somebody said so; it is paid because money
   * turned up, and that money has a date and a method.
   */
  onSettle?: (invoice: { id: string; label: string; amount: number }) => void
  reloadKey?: number
}) {
  const supabase = createClient()
  const [bills, setBills] = useState<Bill[]>([])
  const [billable, setBillable] = useState<Billable[]>([])
  const [markupPct, setMarkupPct] = useState(0)
  const [loading, setLoading] = useState(true)
  const [building, setBuilding] = useState(false)
  const [creating, setCreating] = useState(false)
  // Which invoice has a status change in flight. Without this, Issue is a
  // plain button and a double-press fires two requests - which is exactly how
  // one invoice ended up as two in QuickBooks. The server claim is what makes
  // that impossible; this is what stops it being attempted.
  const [statusBusy, setStatusBusy] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [showMarkup, setShowMarkup] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')
  const [sendingId, setSendingId] = useState('')
  const clientEmail = useClientEmail(projectId)
  const [clientName, setClientName] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  // Only a company that has a QuickBooks is told anything about QuickBooks.
  const [qboConnected, setQboConnected] = useState(false)

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
      setQboConnected(!!d.quickbooks_connected)
    }
    setLoading(false)
  }, [projectId, token])

  useEffect(() => { load() }, [load, reloadKey])

  // Arriving from "Bill the client for this" on a sub's bill: open the composer
  // with that one cost already ticked. Approving a sub bill and then hunting
  // for it in a list of billable costs is the step people were dropping.
  const [prefilled, setPrefilled] = useState(false)
  // Arrived from "Bill the client" on one specific cost. The composer then
  // knows the answer and should say so, rather than showing the whole
  // pick-your-costs checklist with one box ticked - which reads as "start
  // over" to somebody who just told us what they wanted.
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (prefilled || loading || !billable.length) return
    const wanted = new URLSearchParams(window.location.search).get('bill')
    if (!wanted) return
    const hit = billable.find(b => b.kind === 'invoice' && b.source_id === wanted)
    if (hit) {
      setPicked(new Set([`${hit.kind}:${hit.source_id}`]))
      setBuilding(true)
      setFocused(true)
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
    if (statusBusy) return
    setStatusBusy(bill.id)
    try {
      const t = await token()
      const res = await fetch(`/api/projects/${projectId}/client-invoices/${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? `Could not mark it ${status}.`)
        return
      }
      await load()
    } catch {
      setError('Could not reach the server - nothing was changed.')
    } finally {
      setStatusBusy('')
    }
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

  /**
   * Void a sent invoice.
   *
   * Not delete. A client already has this document, so it stays in the list
   * with its number, greyed out - which is what an accountant expects and what
   * QuickBooks does too. The costs on it go back to being billable, and the
   * QuickBooks invoice is voided so it stops counting as money owed.
   */
  async function voidInvoice(bill: Bill) {
    if (!confirm(
      `Void ${bill.invoice_number}?\n\nIt stays on the list for the record, its costs go back to being billable, and it is voided in QuickBooks too. This cannot be undone.`
    )) return
    await setStatus(bill, 'void')
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
            {focused ? 'Billing this cost' : 'What is going on this invoice'}
          </p>

          {focused ? (
            <div className="rounded-lg border border-line bg-panel divide-y divide-line-soft">
              {chosen.map(b => (
                <div key={key(b)} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink truncate">{b.description}</span>
                    <span className="block text-[11px] text-faint">
                      {b.reference ? `${b.reference} · ` : ''}{money(b.cost)} cost
                      {b.excluded ? ' · at cost, no markup' : ` + ${b.pct}% (${money(b.markup)})`}
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink tabular-nums shrink-0">{money(b.clientPrice)}</span>
                </div>
              ))}
              {/* Nothing is taken away - the full list is one click behind
                  this, for the times you do want to add to the invoice. */}
              <button onClick={() => setFocused(false)}
                className="w-full px-3 py-2 text-left text-xs font-medium text-muted-fg hover:bg-surface">
                + Add another cost to this invoice
              </button>
            </div>
          ) : billable.length === 0 ? (
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
            const qb = invoiceQbChip(b, qboConnected)
            const opened = openedLabel(b, shortDate)
            const shareable = !!b.token && b.status !== 'draft'
            return (
              <div key={b.id}>
              <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <FileText className="h-4 w-4 text-faint shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{b.invoice_number}</span>
                  <span className="block text-[11px] text-faint">
                    {(b.client_invoice_lines ?? []).length} line{(b.client_invoice_lines ?? []).length !== 1 ? 's' : ''}
                    {' · '}{b.show_markup ? 'markup shown' : 'flat amounts'}
                    {opened ? ` · ${opened}` : ''}
                    {b.due_date ? ` · due ${new Date(b.due_date + 'T00:00:00').toLocaleDateString()}` : ''}
                  </span>
                </span>
                <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0', STATUS[b.status] ?? STATUS.draft)}>
                  {b.status}
                </span>
                {qb.show && (
                  <span title={qb.title}
                    className={cn(
                      'shrink-0 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      qb.tone === 'ok'
                        ? 'border-success/40 bg-success-tint text-success'
                        : 'border-warn/40 bg-warn-tint text-warn',
                    )}>
                    {qb.tone === 'ok' ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {qb.label}
                  </span>
                )}
                <span className="ml-auto text-sm font-bold text-ink tabular-nums shrink-0">{money(total)}</span>

                {/*
                  ONE action reads as the action. Everything else lives in the
                  menu: seven same-sized buttons in a row meant Mark paid and
                  Void looked equally like the thing to press.
                */}
                {b.status === 'draft' && (
                  <button onClick={() => setStatus(b, 'sent')} disabled={!!statusBusy}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 text-xs font-medium text-muted-fg hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Issues it and creates the client's link">
                    {statusBusy === b.id
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Issuing…</>
                      : <>Issue &amp; get link</>}
                  </button>
                )}
                {b.status === 'sent' && (
                  <button
                    onClick={() => {
                      if (onSettle) onSettle({ id: b.id, label: `Invoice ${b.invoice_number}`, amount: total })
                      else setStatus(b, 'paid')
                    }}
                    disabled={!!statusBusy}
                    className="shrink-0 inline-flex items-center gap-1 rounded-md border border-success/30 bg-success-tint px-2 py-1 text-xs font-medium text-success disabled:opacity-50 disabled:cursor-not-allowed">
                    {statusBusy === b.id
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Recording…</>
                      : <><Check className="h-3 w-3" /> Mark paid</>}
                  </button>
                )}

                <RowMenu label={`More for invoice ${b.invoice_number}`}>
                  {close => (
                    <>
                      <MenuItem newTab href={`/projects/${projectId}/client-invoices/${b.id}/print`} onClick={close}>
                        <Printer className="h-3.5 w-3.5" /> View / Print
                      </MenuItem>
                      {shareable && (
                        <>
                          <MenuItem onClick={() => { copyLink(b); close() }}>
                            <Copy className="h-3.5 w-3.5" /> {copied === b.id ? 'Link copied' : "Copy the client's link"}
                          </MenuItem>
                          <MenuItem onClick={() => { setSendingId(sendingId === b.id ? '' : b.id); close() }}>
                            <Mail className="h-3.5 w-3.5" /> Email it to the client
                          </MenuItem>
                          <MenuItem href={mailtoFor(b)} onClick={close}>
                            <Mail className="h-3.5 w-3.5" /> Compose it yourself
                          </MenuItem>
                        </>
                      )}
                      {(b.status === 'sent' || b.status === 'paid') && (
                        <MenuItem danger onClick={() => { close(); voidInvoice(b) }}>
                          <AlertTriangle className="h-3.5 w-3.5" /> Void this invoice
                        </MenuItem>
                      )}
                      {b.status === 'draft' && (
                        <MenuItem danger onClick={() => { close(); remove(b) }}>
                          <Trash2 className="h-3.5 w-3.5" /> Delete this draft
                        </MenuItem>
                      )}
                    </>
                  )}
                </RowMenu>
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

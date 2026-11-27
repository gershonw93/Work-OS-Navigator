'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Copy, Mail, Plus, Receipt, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { callFetch } from '@/lib/service-calls-client'
import { fetchProblem } from '@/lib/fetch-error'
import { usePermissions } from '@/lib/use-permissions'
import {
  BILL_STATUS_LABEL, PAYMENT_METHODS, UNITS, UNIT_LABEL, cleanLine, invoiceProblem, paymentProblem, subtotalCents, usd,
  type BillStatus, type Unit,
} from '@/lib/service-billing'
import { formatDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

// ONE INVOICE, TWO SHAPES. A DRAFT is a form: who it is to, the dates, and the
// lines - typed, or picked from the price list, each a quantity times a price.
// A SENT invoice is a record: the lines as sent, what QuickBooks came to with
// any tax, what has been paid, and what is left - plus Record payment, Email it
// again, Copy link and Void. A sent invoice is not edited line by line: it is
// in the customer's inbox and the books, so it is voided and issued again.
//
// Every rule is the route's own (lib/service-billing.ts), asked here first so
// a refusal is on the control rather than a failed request.

type Line = { key: string; description: string; quantity: string; unit: Unit; unit_price: string }
type Price = { id: string; name: string; unit: Unit; unit_price: number | string }
type Payment = { id: string; amount: number | string; paid_date: string; method: string | null; reference: string | null; qbo_id: string | null }

let keySeq = 0
const blankLine = (): Line => ({ key: `l${++keySeq}`, description: '', quantity: '1', unit: 'each', unit_price: '' })
const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function InvoiceEditor({ invoiceId, callId }: { invoiceId: string; callId: string | null }) {
  const notice = useNotice()
  const guard = useDeleteGuard()
  const router = useRouter()
  const { can } = usePermissions()
  const canEdit = can('service-billing', 'edit')
  const canDelete = can('service-billing', 'delete')

  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [inv, setInv] = useState<any>(null)
  const [settlement, setSettlement] = useState<{ total: number; paid: number; balance: number; state: string } | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [prices, setPrices] = useState<Price[]>([])
  const [f, setF] = useState({ customer_name: '', customer_email: '', issue_date: '', due_date: '', notes: '' })
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const [busy, setBusy] = useState('')
  const [problem, setProblem] = useState('')
  const [paying, setPaying] = useState(false)

  const load = useCallback(async () => {
    try {
      const [res, pr] = await Promise.all([
        callFetch(`/api/service-invoices/${invoiceId}`),
        callFetch('/api/service-prices'),
      ])
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState('failed'); return }
      const i = json.invoice
      setInv(i)
      setSettlement(json.settlement)
      setPayments(json.payments ?? [])
      setF({
        customer_name: i.customer_name ?? '', customer_email: i.customer_email ?? '',
        issue_date: i.issue_date ?? '', due_date: i.due_date ?? '', notes: i.notes ?? '',
      })
      setLines(json.lines?.length
        ? json.lines.map((l: any) => ({ key: `l${++keySeq}`, description: l.description, quantity: String(Number(l.quantity)), unit: l.unit, unit_price: String(Number(l.unit_price)) }))
        : [blankLine()])
      if (pr.ok) setPrices(((await pr.json()).items ?? []) as Price[])
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [invoiceId])
  useEffect(() => { load() }, [load])

  async function act(label: string, url: string, init: RequestInit, onOk?: (json: any) => void) {
    setBusy(label)
    try {
      const res = await callFetch(url, init)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'That did not work. Try again.'); return false }
      if (json.note) notice(json.note, { tone: 'success' })
      onOk?.(json)
      return true
    } catch (e) {
      notice(fetchProblem(e, 'saving the invoice'))
      return false
    } finally {
      setBusy('')
      load()
    }
  }

  const body = () => ({
    ...f,
    lines: lines.filter(l => l.description.trim() || l.unit_price).map(l => ({
      description: l.description, quantity: l.quantity, unit: l.unit, unit_price: l.unit_price || 0,
    })),
  })

  async function saveDraft(quiet = false) {
    const ok = await act('save', `/api/service-invoices/${invoiceId}`, { method: 'PATCH', body: JSON.stringify(body()) })
    if (ok && !quiet) notice('Draft saved.', { tone: 'success' })
    return ok
  }

  async function send() {
    const b = body()
    const p = invoiceProblem(b)
    if (p) { setProblem(p); return }
    setProblem('')
    if (!(await saveDraft(true))) return
    await act('send', `/api/service-invoices/${invoiceId}/send`, { method: 'POST' })
  }

  function addPrice(id: string) {
    const item = prices.find(p => p.id === id)
    if (!item) return
    setLines(ls => {
      const kept = ls.filter(l => l.description.trim() || l.unit_price)
      return [...kept, { key: `l${++keySeq}`, description: item.name, quantity: '1', unit: item.unit, unit_price: String(Number(item.unit_price)) }]
    })
  }

  if (state === 'loading') return <p className="text-sm text-faint py-12 text-center">Loading...</p>
  if (state === 'failed' || !inv) {
    return (
      <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
        <p>Could not load this invoice. It may have been removed, or it is not one of yours.</p>
        <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
      </div>
    )
  }

  const status = inv.status as BillStatus
  const draft = status === 'draft' && canEdit
  const sub = subtotalCents(lines.map(l => cleanLine({ ...l, unit_price: l.unit_price || 0 })))
  const tax = inv.tax_amount !== null && Number(inv.tax_amount) > 0 ? Number(inv.tax_amount) : null
  const link = inv.token ? `${window.location.origin}/service-invoice/${inv.token}` : null
  const card = 'rounded-2xl border border-line bg-panel'

  return (
    <div className="space-y-5">
      {/* Title and the acts. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-muted-fg">Invoice {inv.invoice_number}</span>
            <Badge variant={status === 'paid' ? 'success' : status === 'sent' ? 'info' : status === 'void' ? 'danger' : 'muted'}>
              {status === 'sent' && settlement?.state === 'partly_paid' ? 'Partly paid' : BILL_STATUS_LABEL[status]}
            </Badge>
            {inv.qbo_id && !inv.qbo_voided_at && <Badge variant="success">In QuickBooks</Badge>}
            {inv.viewed_at && status !== 'draft' && <Badge variant="muted">Viewed</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink break-words">{draft ? 'Bill the customer' : inv.customer_name}</h1>
          {!draft && <p className="text-sm text-muted-fg">Sent {inv.sent_at ? formatDate(inv.sent_at) : '-'}{inv.customer_email ? ` to ${inv.customer_email}` : ''}</p>}
        </div>
        <div className="row-even lg:flex lg:flex-wrap lg:justify-end gap-2 lg:shrink-0">
          {draft && <Button variant="outline" disabled={busy !== ''} onClick={() => saveDraft()}>{busy === 'save' ? 'Saving...' : 'Save draft'}</Button>}
          {draft && <Button disabled={busy !== ''} onClick={send}><Mail className="h-4 w-4" /> {busy === 'send' ? 'Sending...' : 'Send invoice'}</Button>}
          {!draft && status !== 'void' && canEdit && settlement && settlement.balance > 0 && (
            <Button disabled={busy !== ''} onClick={() => setPaying(true)}><Receipt className="h-4 w-4" /> Record payment</Button>
          )}
          {!draft && status !== 'void' && canEdit && (
            <Button variant="outline" disabled={busy !== ''} onClick={() => act('send', `/api/service-invoices/${invoiceId}/send`, { method: 'POST' })}>
              <Mail className="h-4 w-4" /> {busy === 'send' ? 'Sending...' : 'Email again'}
            </Button>
          )}
        </div>
      </div>
      {problem && <p className="text-sm text-danger">{problem}</p>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* LEFT: the lines. */}
        <div className="space-y-5 min-w-0">
          <div className={card}>
            <div className="flex items-center justify-between gap-2 px-4 pt-4">
              <p className="text-sm font-semibold text-ink">What it covers</p>
              {draft && prices.length > 0 && (
                <select aria-label="Add from your price list" value="" onChange={e => addPrice(e.target.value)}
                  className="h-11 lg:h-9 max-w-[60%] rounded-md border border-line bg-panel px-2 text-sm text-ink">
                  <option value="">+ From price list</option>
                  {prices.map(p => <option key={p.id} value={p.id}>{`${p.name} - ${usd(p.unit_price)} ${UNIT_LABEL[p.unit]}`}</option>)}
                </select>
              )}
            </div>
            {draft ? (
              <div className="p-4 space-y-3">
                {lines.map((l, i) => {
                  const amount = cleanLine({ ...l, unit_price: l.unit_price || 0 }).amount
                  const set = (patch: Partial<Line>) => setLines(ls => ls.map(x => x.key === l.key ? { ...x, ...patch } : x))
                  return (
                    <div key={l.key} className="rounded-xl border border-line-soft p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 space-y-1">
                          <Label htmlFor={`d-${l.key}`}>Line {i + 1} *</Label>
                          <Input id={`d-${l.key}`} value={l.description} onChange={e => set({ description: e.target.value })} placeholder="Replaced 20A breaker" />
                        </div>
                        <button type="button" onClick={() => setLines(ls => ls.length > 1 ? ls.filter(x => x.key !== l.key) : [blankLine()])}
                          aria-label={`Remove line ${i + 1}`} title="Remove line" className="mt-6 h-11 w-11 lg:h-9 lg:w-9 shrink-0 flex items-center justify-center rounded-md text-faint hover:bg-surface hover:text-danger">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor={`q-${l.key}`}>Qty *</Label>
                          <Input id={`q-${l.key}`} inputMode="decimal" value={l.quantity} onChange={e => set({ quantity: e.target.value })} />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`u-${l.key}`}>Unit *</Label>
                          <select id={`u-${l.key}`} value={l.unit} onChange={e => set({ unit: e.target.value as Unit })}
                            className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-2 text-sm text-ink">
                            {UNITS.map(u => <option key={u} value={u}>{u === 'each' ? 'Each' : 'Hour'}</option>)}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor={`p-${l.key}`}>Price ($) *</Label>
                          <Input id={`p-${l.key}`} inputMode="decimal" value={l.unit_price} onChange={e => set({ unit_price: e.target.value })} placeholder="0.00" />
                        </div>
                      </div>
                      <p className="text-right text-sm font-medium text-ink">{usd(amount)}</p>
                    </div>
                  )
                })}
                <Button variant="outline" onClick={() => setLines(ls => [...ls, blankLine()])}><Plus className="h-4 w-4" /> Add line</Button>
              </div>
            ) : (
              <ul className="divide-y divide-line-soft mt-2">
                {lines.map(l => {
                  const c = cleanLine(l)
                  return (
                    <li key={l.key} className="flex items-start justify-between gap-4 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-ink break-words">{c.description}</p>
                        <p className="text-xs text-muted-fg">{c.quantity} x {usd(c.unit_price)} {UNIT_LABEL[c.unit]}</p>
                      </div>
                      <p className="shrink-0 font-medium text-ink">{usd(c.amount)}</p>
                    </li>
                  )
                })}
              </ul>
            )}
            <dl className="space-y-1.5 border-t border-line p-4 text-sm">
              <div className="flex justify-between"><dt className="text-muted-fg">Subtotal</dt><dd className="text-ink">{usd(sub / 100)}</dd></div>
              {!draft && tax !== null && <div className="flex justify-between"><dt className="text-muted-fg">Sales tax (QuickBooks)</dt><dd className="text-ink">{usd(tax)}</dd></div>}
              {!draft && settlement && (
                <>
                  <div className="flex justify-between font-semibold"><dt className="text-ink">Total</dt><dd className="text-ink">{usd(settlement.total)}</dd></div>
                  {settlement.paid > 0 && <div className="flex justify-between"><dt className="text-muted-fg">Paid</dt><dd className="text-ink">-{usd(settlement.paid)}</dd></div>}
                  {status !== 'void' && <div className="flex justify-between border-t border-line-soft pt-2 text-base font-bold"><dt className="text-ink">Owed</dt><dd className="text-ink">{usd(settlement.balance)}</dd></div>}
                </>
              )}
              {draft && <p className="text-xs text-muted-fg">Any sales tax is added by QuickBooks when you send it, and the customer is emailed that total.</p>}
            </dl>
          </div>

          {(draft || f.notes) && (
            <div className={cn(card, 'p-4 space-y-2')}>
              {draft
                ? <Label htmlFor="inv-notes">Note to the customer (optional)</Label>
                : <p className="text-xs font-semibold uppercase tracking-wide text-faint">Note to the customer</p>}
              {draft
                ? <textarea id="inv-notes" value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} rows={3}
                    className="w-full rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink" placeholder="Thanks for your business. 90-day warranty on parts." />
                : <p className="whitespace-pre-wrap text-sm text-ink break-words">{f.notes}</p>}
            </div>
          )}
        </div>

        {/* RIGHT: who and when, then money received. */}
        <div className="space-y-5 min-w-0">
          <div className={cn(card, 'p-4 space-y-3')}>
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Bill to</p>
            {draft ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-name">Customer *</Label>
                  <Input id="inv-name" value={f.customer_name} onChange={e => setF(p => ({ ...p, customer_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="inv-email">Email (optional)</Label>
                  <Input id="inv-email" type="email" value={f.customer_email} onChange={e => setF(p => ({ ...p, customer_email: e.target.value }))} placeholder="Where the invoice goes" />
                  {!f.customer_email && <p className="text-xs text-muted-fg">Without one nobody is emailed - you can copy the link to send it yourself.</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-issue">Invoice date *</Label>
                    <Input id="inv-issue" type="date" value={f.issue_date} onChange={e => setF(p => ({ ...p, issue_date: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-due">Due (optional)</Label>
                    <Input id="inv-due" type="date" value={f.due_date} onChange={e => setF(p => ({ ...p, due_date: e.target.value }))} />
                  </div>
                </div>
              </>
            ) : (
              <div className="text-sm space-y-1">
                <p className="font-medium text-ink">{inv.customer_name}</p>
                {inv.customer_email && <p className="text-muted-fg break-words">{inv.customer_email}</p>}
                <p className="text-muted-fg">Dated {formatDate(inv.issue_date)}{inv.due_date ? `, due ${formatDate(inv.due_date)}` : ', due on receipt'}</p>
              </div>
            )}
            {link && status !== 'void' && (
              <Button variant="outline" onClick={() => { navigator.clipboard?.writeText(link).then(() => notice('Link copied.', { tone: 'success' }), () => notice(link, { title: 'Copy this link' })) }}>
                <Copy className="h-4 w-4" /> Copy invoice link
              </Button>
            )}
          </div>

          {!draft && (
            <div className={card}>
              <p className="px-4 pt-4 text-sm font-semibold text-ink">Payments</p>
              {payments.length ? (
                <ul className="divide-y divide-line-soft">
                  {payments.map(p => (
                    <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium text-ink">{usd(p.amount)} <span className="font-normal text-muted-fg">{p.method ?? ''}</span></p>
                        <p className="text-xs text-muted-fg">{formatDate(p.paid_date)}{p.reference ? ` - ref ${p.reference}` : ''}{p.qbo_id ? ' - in QuickBooks' : ''}</p>
                      </div>
                      {canDelete && (
                        <button type="button" aria-label="Remove this payment" title="Remove this payment" disabled={busy !== ''}
                          onClick={() => guard(() => { act('unpay', `/api/service-invoices/${invoiceId}/payments/${p.id}`, { method: 'DELETE' }) }, { label: 'this payment', protected: true })}
                          className="h-11 w-11 lg:h-9 lg:w-9 shrink-0 flex items-center justify-center rounded-md text-faint hover:bg-surface hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              ) : <p className="px-4 py-3 text-sm text-muted-fg">Nothing recorded yet.</p>}
            </div>
          )}

          {canDelete && status !== 'void' && (
            <Button variant="outline" className="w-full text-danger" disabled={busy !== ''}
              onClick={() => guard(async () => {
                await act('void', `/api/service-invoices/${invoiceId}/void`, { method: 'POST' }, json => {
                  if (json.deleted && callId) router.push(`/service-calls/${callId}`)
                })
              }, status === 'draft'
                ? { label: 'this draft invoice' }
                : { label: `invoice ${inv.invoice_number}`, title: `Void invoice ${inv.invoice_number}?`, body: 'It stays on record as void, the customer owes nothing on it, and it is voided in QuickBooks too. The call goes back to Done so it can be billed again.', confirmLabel: 'Void invoice' })}>
              {status === 'draft' ? 'Delete draft' : 'Void invoice'}
            </Button>
          )}
          {callId && <Link href={`/service-calls/${callId}`} className="block text-center text-sm text-muted-fg hover:text-ink">Back to the call</Link>}
        </div>
      </div>

      {paying && settlement && (
        <PaymentDialog balance={settlement.balance} onClose={() => setPaying(false)}
          check={p => paymentProblem(inv, payments, p)}
          onSave={async p => {
            const ok = await act('pay', `/api/service-invoices/${invoiceId}/payments`, { method: 'POST', body: JSON.stringify(p) })
            if (ok) setPaying(false)
          }}
          busy={busy === 'pay'} />
      )}
    </div>
  )
}

/** Record money received. Asked of `paymentProblem` first - the route's own rule. */
function PaymentDialog({ balance, onClose, onSave, check, busy }: {
  balance: number
  onClose: () => void
  onSave: (p: { amount: string; paid_date: string; method: string; reference: string }) => void
  check: (p: { amount: string; paid_date: string }) => string | null
  busy: boolean
}) {
  const [p, setP] = useState({ amount: balance.toFixed(2), paid_date: today(), method: 'Check', reference: '' })
  const [problem, setProblem] = useState('')
  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="bg-panel rounded-2xl border border-line w-full max-w-full sm:max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between gap-3">
          <h2 className="font-semibold text-ink">Record a payment</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink p-1"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">Amount ($) *</Label>
              <Input id="pay-amount" inputMode="decimal" value={p.amount} onChange={e => setP(x => ({ ...x, amount: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">Paid on *</Label>
              <Input id="pay-date" type="date" value={p.paid_date} onChange={e => setP(x => ({ ...x, paid_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">How *</Label>
            <select id="pay-method" value={p.method} onChange={e => setP(x => ({ ...x, method: e.target.value }))}
              className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-3 text-sm text-ink">
              {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-ref">Check or reference number (optional)</Label>
            <Input id="pay-ref" value={p.reference} onChange={e => setP(x => ({ ...x, reference: e.target.value }))} />
            <p className="text-xs text-muted-fg">It goes to QuickBooks as the reference number, the column you reconcile the bank with.</p>
          </div>
          {problem && <p className="text-sm text-danger">{problem}</p>}
        </div>
        <div className="px-6 py-4 border-t border-line-soft row-even lg:flex lg:justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={busy} onClick={() => {
            const why = check(p)
            if (why) { setProblem(why); return }
            onSave(p)
          }}>{busy ? 'Saving...' : 'Record payment'}</Button>
        </div>
      </div>
    </div>
  )
}

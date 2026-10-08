'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClientInvoices } from '@/components/projects/client-invoices'
import { PaymentRequests } from '@/components/projects/payment-requests'
import { PaymentAllocations, type PayableInvoice } from '@/components/projects/payment-allocations'
import { allocationProblem, cents, dollars, spreadPayment } from '@/lib/invoice-settlement'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import Link from 'next/link'
import { Plus, X, Wallet, TrendingDown, Banknote, Percent, Trash2, Pencil, Check, Landmark, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toAmountInput } from '@/lib/validate'
import { usePermissions } from '@/lib/use-permissions'

import { formatDate } from '@/lib/dates'
import { useNotice } from '@/components/ui/notice'
interface Payment {
  id: string; paid_date: string | null; amount: number; method: string | null
  memo: string | null; retainer: boolean; qb_entered: boolean
  /** The payer's own reference - what QuickBooks shows as Reference no. */
  reference: string | null
  /** Set by the real QuickBooks sync. When present, the chip is a fact, not a claim. */
  qbo_id: string | null
  /** Which invoices it paid and how much went to each - one cheque can pay several. */
  client_payment_allocations?: { client_invoice_id: string; amount: number | string; client_invoices: { invoice_number: string } | null }[]
  /** Holds what is not on an invoice as the client's credit. */
  on_account?: boolean
}
interface Summary {
  received: number; feeEarned: number; availableAfterFee: number
  vendorBilled: number; vendorPaid: number; escrowPaid: number; clientPaidDirect: number
  outstandingToVendors: number; escrowBalance: number
  projectedCost: number; invoicedAlready: number; projectedGoingForward: number
}
const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const blank = { paid_date: '', amount: '', method: 'Check', memo: '', reference: '', retainer: false, qb_entered: false, on_account: false }
const METHODS = ['Check', 'QuickPay', 'Wire', 'ACH', 'Cash', 'CC', 'Other']

export default function PaymentsPage({ params }: { params: { id: string } }) {
  const notify = useNotice()
  const supabase = createClient()
  const { can: canDo, loading: permLoading } = usePermissions()
  const canSeeMargin = !permLoading && canDo('margin', 'view')
  const guardDelete = useDeleteGuard()
  const [payments, setPayments] = useState<Payment[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [feePct, setFeePct] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...blank })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...blank })
  const [feeEditing, setFeeEditing] = useState(false)
  const [feeInput, setFeeInput] = useState('')
  // On an AIA job the client is billed through pay applications, so the
  // "raise an invoice" half of this page would be a second, competing way to
  // ask for the same money. Recording money RECEIVED still belongs here - this
  // is the only place in the app that writes a client payment at all.
  const [billingMode, setBillingMode] = useState<string | null>(null)
  const isAia = billingMode === 'aia'
  // Set when the payment dialog was opened by "Mark paid" on a deposit request,
  // so the payment it creates can settle that request. Cleared on cancel too -
  // a dialog dismissed must not settle anything.
  // What this payment is answering: a deposit request, or a client invoice.
  // Both used to be settled by a bare status flip that recorded no money at
  // all - the deposit half was fixed in #305, the invoice half was not.
  const [settling, setSettling] = useState<{ kind: 'request' | 'invoice'; id: string; label: string; amount: number } | null>(null)
  const [requestsKey, setRequestsKey] = useState(0)
  // The issued invoices still owing something - what a payment can be split
  // across. Read from the same route the invoice list uses, so the balance in
  // the picker is the balance on the list.
  const [payable, setPayable] = useState<PayableInvoice[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [shares, setShares] = useState<Record<string, string>>({})
  // Once somebody types a share by hand, changing the cheque amount must not
  // overwrite it - they told us which invoice they meant.
  const [sharesTouched, setSharesTouched] = useState(false)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/payments`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setPayments(d.payments ?? []); setSummary(d.summary ?? null); setFeePct(d.fee_pct ?? 0)
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  async function loadPayable() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/client-invoices`, { headers: { Authorization: `Bearer ${t}` } })
    if (!res.ok) return
    const d = await res.json()
    setPayable(((d.invoices ?? []) as any[])
      .filter(b => b.status === 'sent' && Number(b.settlement?.balance ?? 0) > 0)
      // Oldest first: the order a cheque is spread in, and how anybody applies one.
      .sort((a, b) => String(a.issue_date ?? '').localeCompare(String(b.issue_date ?? '')))
      .map(b => ({ id: b.id, invoice_number: b.invoice_number, balance: Number(b.settlement.balance), total: Number(b.settlement.total) })))
  }
  useEffect(() => { loadPayable() }, [params.id, requestsKey])

  /** Spread the payment across what is ticked, unless somebody already set the shares by hand. */
  function respread(amount: string, ids: string[], force = false) {
    if (sharesTouched && !force) return
    const chosen = payable.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, invoice_number: p.invoice_number, status: 'sent', balanceCents: cents(p.balance) }))
    const spread = spreadPayment(cents(amount), chosen)
    setShares(Object.fromEntries(ids.map(id => [id, spread[id] ? String(dollars(spread[id])) : ''])))
  }

  function toggleInvoice(id: string) {
    const next = picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]
    // Ticking with no amount typed yet: the payment is what the ticked
    // invoices owe, which is the commonest case and saves typing it twice.
    let amount = form.amount
    if (!cents(amount) || !sharesTouched) {
      const owed = payable.filter(p => next.includes(p.id)).reduce((s, p) => s + cents(p.balance), 0)
      if (!cents(amount) || cents(amount) === picked.reduce((s, x) => s + cents(payable.find(p => p.id === x)?.balance), 0)) {
        amount = owed ? String(dollars(owed)) : form.amount
        setForm(f => ({ ...f, amount }))
      }
    }
    setPicked(next)
    setSharesTouched(false)
    respread(amount, next, true)
  }

  // Which way this job bills its client. Same endpoint the tabs use, so the
  // page and the tab bar can never disagree about what this job is.
  useEffect(() => {
    let active = true
    ;(async () => {
      const t = await token()
      const res = await fetch(`/api/projects/${params.id}/viewer-context`, { headers: { Authorization: `Bearer ${t}` } })
      if (!res.ok || !active) return
      const d = await res.json()
      // Default to 'simple' rather than leaving it null: an unreadable answer
      // must not silently withhold the billing section on an ordinary job.
      setBillingMode(d.billingMode ?? 'simple')
    })()
    return () => { active = false }
  }, [params.id])

  /**
   * Open the payment dialog to settle a deposit request.
   *
   * Prefilled from the request, but every field stays editable: a client who
   * was asked for $5,000 and sent $4,800 must be recorded as having sent
   * $4,800. The request is settled by whatever is actually entered.
   */
  function settleRequest(r: { id: string; label: string; amount: number }) {
    setSettling({ kind: 'request', ...r })
    setForm({
      ...blank,
      paid_date: new Date().toISOString().split('T')[0],
      amount: toAmountInput(r.amount),
      memo: r.label,
      // A deposit is a retainer by definition - it is money held against work
      // not yet done, which is exactly what this flag means.
      retainer: true,
    })
    setAdding(true)
  }

  /**
   * "Mark paid" on a client invoice.
   *
   * It used to set status='paid' and nothing else: no money in the ledger, no
   * date, no method, nothing in Funds Received - and in QuickBooks the invoice
   * stayed OPEN, so receivables kept counting money that had arrived. The
   * payment this records is what settles the QuickBooks invoice too, through
   * the applied-payment path.
   *
   * NOT a retainer: an invoice is work already billed, not money held against
   * work not yet done.
   */
  function settleInvoice(b: { id: string; label: string; amount: number }) {
    setSettling({ kind: 'invoice', ...b })
    // `amount` is what the invoice still OWES, not its total - a second payment
    // on a partly paid invoice starts from the balance.
    setForm({
      ...blank,
      paid_date: new Date().toISOString().split('T')[0],
      amount: toAmountInput(b.amount),
      memo: b.label,
      retainer: false,
    })
    setPicked([b.id])
    setShares({ [b.id]: toAmountInput(b.amount) })
    setSharesTouched(false)
    setAdding(true)
  }

  function closePaymentForm() {
    setAdding(false)
    setForm({ ...blank })
    setSettling(null)
    setPicked([])
    setShares({})
    setSharesTouched(false)
  }

  async function addPayment() {
    // A deposit request is settled by its own link, not by invoices.
    const allocations = settling?.kind === 'request'
      ? []
      : picked.map(id => ({ client_invoice_id: id, amount: Number(shares[id] || 0) }))
    // The same check the route makes, asked here first so the problem is on
    // the screen before anything is sent.
    const problem = allocationProblem(form.amount, allocations, payable.map(p => ({
      id: p.id, invoice_number: p.invoice_number, status: 'sent', balanceCents: cents(p.balance),
    })), { onAccount: form.on_account })
    if (problem) { notify(problem); return }
    setSaving(true)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
        // Which invoices this money pays, and how much of it went to each.
        // The server marks an invoice paid once its payments cover it - this
        // page no longer says "paid" itself, which is how $5,000 against a
        // $10,000 invoice used to read Paid.
        allocations,
      }),
    })
    if (!res.ok) {
      setSaving(false)
      notify((await res.json().catch(() => ({}))).error ?? 'Could not add')
      return
    }

    // Settle the deposit request this payment answers, and point it at the
    // payment. Only after the payment is safely written: marking a request
    // paid against money that failed to save is the lie this flow exists to
    // avoid.
    if (settling?.kind === 'request') {
      const created = await res.json().catch(() => ({} as any))
      await fetch(`/api/projects/${params.id}/payment-requests/${settling.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ status: 'paid', client_payment_id: created?.payment?.id ?? null }),
      }).catch(() => {})
    }
    setRequestsKey(k => k + 1)

    setSaving(false)
    closePaymentForm()
    load()
  }

  async function saveEdit(id: string) {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/payments/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ ...editForm, amount: Number(editForm.amount) }),
    })
    // A refusal is an answer - "this payment is split across two invoices" -
    // and closing the row over it looked exactly like the edit had saved.
    if (!res.ok) {
      notify((await res.json().catch(() => ({}))).error ?? 'Could not save the change')
      return
    }
    setEditingId(null); load(); setRequestsKey(k => k + 1)
  }

  // One-click "entered in QuickBooks" toggle straight from the ledger row -
  // no need to open the edit form just to check it off another day.
  async function toggleQb(p: Payment) {
    setPayments(prev => prev.map(x => x.id === p.id ? { ...x, qb_entered: !x.qb_entered } : x))  // optimistic
    const t = await token()
    await fetch(`/api/projects/${params.id}/payments/${p.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ qb_entered: !p.qb_entered }),
    })
  }

  function remove(p: Payment) {
    guardDelete(async () => {
      const t = await token()
      await fetch(`/api/projects/${params.id}/payments/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
      // The invoices it paid go back to owing it, so their list has to reload too.
      load(); setRequestsKey(k => k + 1)
    }, { label: `the ${money(p.amount)} client payment`, protected: true })
  }

  async function saveFee() {
    const pct = Math.max(0, Math.min(Number(feeInput) || 0, 100)) / 100
    const t = await token()
    await fetch(`/api/projects/${params.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ fee_pct: pct }),
    })
    setFeeEditing(false); load()
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>
  const s = summary

  const cards = [
    { label: 'Funds Received', value: s?.received ?? 0, icon: Banknote, color: 'text-success', bg: 'bg-success-tint' },
    { label: `Contractor Fee (${(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}%)`, value: s?.feeEarned ?? 0, icon: Percent, color: 'text-info', bg: 'bg-info-tint' },
    { label: 'Paid to Vendors', value: s?.vendorPaid ?? 0, icon: TrendingDown, color: 'text-ink', bg: 'bg-panel' },
    {
      label: 'Escrow Balance', value: s?.escrowBalance ?? 0, icon: Landmark,
      color: (s?.escrowBalance ?? 0) < 0 ? 'text-danger' : 'text-accent-fg',
      bg: (s?.escrowBalance ?? 0) < 0 ? 'bg-danger-tint' : 'bg-accent-tint/50',
    },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Billing the client</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            Money <span className="font-medium text-ink-soft">in</span> from the client - deposits and draws you have
            received - your fee, and what is left to pay vendors.
          </p>
          <p className="text-xs text-faint mt-1">
            Bills your subs sent <span className="font-medium">you</span> go on{' '}
            <a href={`/projects/${params.id}/invoices`} className="text-accent-fg hover:underline">Bills from subs</a>. Raise
            what the client owes below, then record their payments against it here.
          </p>
        </div>
        <Button onClick={() => setAdding(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> Record Payment</Button>
      </div>

      {/* Escrow summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => { const Icon = c.icon; return (
          <div key={c.label} className={cn('rounded-xl border border-line p-4', c.bg)}>
            <div className="flex items-center gap-2 mb-2"><Icon className={cn('h-4 w-4', c.color)} /><p className="text-xs font-medium text-muted-fg">{c.label}</p></div>
            <p className={cn('text-2xl font-bold', c.color)}>{money(c.value)}</p>
          </div>
        )})}
      </div>

      {/* Pay-vendors recommendation.
          `available` is clamped once and used for BOTH halves of the sentence
          below. It used to say "only $0 is available" (clamped) and then
          "you're short $35,000" (unclamped) in the same breath - subtracting a
          NEGATIVE escrow balance added the $10,000 already paid back on top of
          the $25,000 owed. Two figures for one fact, a comma apart. */}
      {s && s.outstandingToVendors > 0 && (
        (() => {
          const available = Math.max(s.escrowBalance, 0)
          return available >= s.outstandingToVendors ? (
          <div className="rounded-xl border border-success/30 bg-success-tint px-4 py-3 flex flex-wrap items-center gap-3">
            <Banknote className="h-5 w-5 text-success shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">You have enough to pay your vendors.</p>
              <p className="text-sm text-muted-fg">
                {money(s.escrowBalance)} in escrow covers the {money(s.outstandingToVendors)} still owed. Go ahead and release payment.
              </p>
            </div>
            <a href={`/projects/${params.id}/invoices`} className="shrink-0 rounded-lg bg-success-solid text-white text-sm font-semibold px-3.5 py-2 hover:opacity-90">
              Pay vendors →
            </a>
          </div>
        ) : (
          <div className="rounded-xl border border-warn/30 bg-warn-tint px-4 py-3 flex flex-wrap items-center gap-3">
            <TrendingDown className="h-5 w-5 text-warn shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">Hold off - not enough in escrow yet.</p>
              <p className="text-sm text-muted-fg">
                {money(s.outstandingToVendors)} is owed to vendors but only {money(available)} is available. You&apos;re short {money(s.outstandingToVendors - available)} - collect from the client first.
              </p>
            </div>
          </div>
        )
        })()
      )}

      {/* Secondary stats + fee setting */}
      <div className="bg-panel rounded-xl border border-line p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Stat label="Paid from escrow" value={money(s?.escrowPaid ?? 0)} />
        <Stat label="Client paid direct" value={money(s?.clientPaidDirect ?? 0)} />
        <Stat label="Vendor billed" value={money(s?.vendorBilled ?? 0)} />
        <Stat label="Outstanding to vendors" value={money(s?.outstandingToVendors ?? 0)} cls={(s?.outstandingToVendors ?? 0) > 0 ? 'text-warn' : ''} />
        {/* The markup, under another name - same permission as the Budget
            tab's margin panel, or a project manager loses it on one screen and
            reads it off the other. */}
        {canSeeMargin && <div>
          <p className="text-xs text-faint mb-0.5">Contractor fee rate</p>
          {feeEditing ? (
            <div className="flex items-center gap-1">
              <Input className="w-20 h-8" value={feeInput} onChange={e => setFeeInput(e.target.value)} placeholder="15" />
              <span className="text-sm text-muted-fg">%</span>
              <button onClick={saveFee} className="p-1 text-success"><Check className="h-4 w-4" /></button>
              <button onClick={() => setFeeEditing(false)} className="p-1 text-faint"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <button onClick={() => { setFeeInput(toAmountInput(feePct * 100)); setFeeEditing(true) }} className="inline-flex items-center gap-1.5 font-semibold text-ink-soft hover:text-accent-fg">
              {(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}% <Pencil className="h-3 w-3 text-faint" />
            </button>
          )}
        </div>}
      </div>

      {/* Billing the client. This is the half that was missing: Payments only
          ever recorded money that had already arrived.

          Not shown on AIA jobs - there the claim goes out as a pay application,
          and two ways to bill the same client for the same work is how the
          numbers stop agreeing. */}
      {/* Asking for money that has no costs behind it yet. Above the invoice
          section because it comes first in the job: the deposit is what you ask
          for before there is anything to bill. Shown on BOTH billing modes -
          a pay application bills work in place, and a deposit is not work in
          place. */}
      <PaymentRequests projectId={params.id} onSettle={settleRequest} reloadKey={requestsKey} />

      {billingMode !== null && (isAia ? (
        <div className="bg-panel rounded-xl border border-line p-4">
          <p className="font-semibold text-ink">Billing your client</p>
          <p className="mt-1 text-sm text-muted-fg">
            This is an AIA job, so what the client owes for work done is raised as a pay application
            rather than an invoice from here. Deposits and stage payments are asked for above, and the
            money they send you is recorded above too.
          </p>
          <Link
            href={`/projects/${params.id}/pay-apps`}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:underline"
          >
            Go to Pay Apps <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <ClientInvoices projectId={params.id} onSettle={settleInvoice} reloadKey={requestsKey} onChanged={() => { load(); setRequestsKey(k => k + 1) }} />
      ))}

      {/* Projections */}
      <div className="bg-panel rounded-xl border border-line p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-3">Projections</p>
        {/* Three money figures with labels this long do not fit a phone -
            "$1,240,000" under "Projected going forward" in a 110px column
            wraps into an unreadable stack. Two up, then three. */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Projected job cost" value={money(s?.projectedCost ?? 0)} />
          <Stat label="Invoiced already" value={money(s?.invoicedAlready ?? 0)} />
          <Stat label="Projected going forward" value={money(s?.projectedGoingForward ?? 0)} cls="text-accent-fg" />
        </div>
        <p className="text-xs text-faint mt-2">Projected cost = Budget × (1 + {(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}% fee). Set budget lines on the Budget tab.</p>
      </div>

      {/* Add form - modal so it's front-and-center, not buried at the bottom */}
      {adding && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !saving && closePaymentForm()}>
        <div className="bg-panel rounded-xl border border-accent/40 shadow-xl w-full max-w-lg p-4 sm:p-5 space-y-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-soft">Record a client payment</p>
              {/* Say what is prefilled and why, or the numbers already in the
                  form look like they came from nowhere. */}
              {settling && (
                <p className="text-xs text-muted-fg">
                  Settling <span className="font-medium text-ink-soft">{settling.label}</span>.
                  Change anything below if they sent something different - a part payment is recorded as part paid.
                </p>
              )}
            </div>
            <button onClick={closePaymentForm} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1"><Label>Date</Label><Input type="date" value={form.paid_date} onChange={e => setForm({ ...form, paid_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Amount</Label><Input type="number" value={form.amount} onChange={e => { setForm({ ...form, amount: e.target.value }); respread(e.target.value, picked) }} placeholder="0" /></div>
            <div className="space-y-1"><Label>Method</Label>
              <select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })} className="w-full rounded-md border border-muted2 bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {/* Two fields, because QuickBooks has two. This was one box called
                "Memo / check #", so a check number went across as the MEMO and
                QuickBooks' Reference no. - the column a bookkeeper matches
                against a bank statement - got our internal tracking id. */}
            <div className="space-y-1"><Label>Reference / check #</Label><Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="e.g. 1043" /></div>
            <div className="space-y-1 col-span-2 sm:col-span-3"><Label>Memo</Label><Input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} placeholder="Anything worth remembering about this payment" /></div>
          </div>
          {settling?.kind !== 'request' && (
            <PaymentAllocations
              invoices={payable}
              picked={picked}
              shares={shares}
              paymentAmount={form.amount}
              onToggle={toggleInvoice}
              onShare={(id, v) => { setSharesTouched(true); setShares(sh => ({ ...sh, [id]: v })) }}
              onAccount={form.on_account}
              onOnAccount={v => setForm(f => ({ ...f, on_account: v }))}
            />
          )}
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-[#C9F24A]" checked={form.retainer} onChange={e => setForm({ ...form, retainer: e.target.checked })} /> Retainer / deposit</label>
            <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="accent-[#C9F24A]" checked={form.qb_entered} onChange={e => setForm({ ...form, qb_entered: e.target.checked })} /> Already in QuickBooks - don&apos;t sync</label>
            <div className="row-even ml-auto lg:flex gap-2">
              <Button variant="secondary" onClick={closePaymentForm}>Cancel</Button>
              <Button onClick={addPayment} disabled={saving || !form.amount}>{saving ? 'Saving…' : 'Add'}</Button>
            </div>
          </div>
        </div>
        </div>
      )}

      {/* Ledger */}
      {payments.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center"><Wallet className="h-8 w-8 text-faint mx-auto mb-3" /><p className="text-sm text-muted-fg">No client payments recorded yet.</p></div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
            <span>Date</span><span>Reference / memo</span><span>Method</span><span className="text-right">Amount</span><span>QB</span><span />
          </div>
          <div className="divide-y divide-line-soft">
            {payments.map(p => editingId === p.id ? (
              <div key={p.id} className="px-4 py-3 grid grid-cols-2 sm:grid-cols-6 gap-2 bg-accent-tint/30 items-center">
                <Input type="date" value={editForm.paid_date} onChange={e => setEditForm({ ...editForm, paid_date: e.target.value })} />
                <Input value={editForm.reference} onChange={e => setEditForm({ ...editForm, reference: e.target.value })} placeholder="Reference / check #" />
                <Input value={editForm.memo} onChange={e => setEditForm({ ...editForm, memo: e.target.value })} placeholder="Memo" />
                <select value={editForm.method} onChange={e => setEditForm({ ...editForm, method: e.target.value })} className="rounded-md border border-line bg-panel px-2 py-2 text-sm">
                  {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <Input type="number" value={editForm.amount} onChange={e => setEditForm({ ...editForm, amount: e.target.value })} />
                <div className="flex gap-1 justify-end">
                  <button onClick={() => saveEdit(p.id)} className="p-1.5 rounded-lg text-accent-ink bg-accent"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="p-1.5 rounded-lg text-faint hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ) : (
              <div key={p.id} className="group md:grid md:grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] md:gap-2 md:items-center px-4 py-3 hover:bg-surface">
                <span className="text-sm text-ink-soft">{p.paid_date ? formatDate(p.paid_date) : '-'}</span>
                <span className="text-sm text-ink-soft truncate">
                  {p.reference && <span className="font-medium text-ink">{p.reference}</span>}
                  {p.reference && p.memo ? ' · ' : ''}
                  {p.memo || (p.reference ? '' : '-')}
                  {p.retainer && <span className="ml-2 text-[10px] rounded-full bg-info-tint text-info px-1.5 py-0.5">retainer</span>}
                  {p.on_account && (() => {
                    const credit = cents(p.amount) - (p.client_payment_allocations ?? []).reduce((t, a) => t + cents(a.amount), 0)
                    return credit > 0
                      ? <span className="ml-2 whitespace-nowrap text-[10px] rounded-full bg-success-tint text-success px-1.5 py-0.5">{money(dollars(credit))} credit</span>
                      : null
                  })()}
                  {(p.client_payment_allocations ?? []).length > 0 && (
                    <span className="block text-xs text-faint truncate">
                      Pays {(p.client_payment_allocations ?? []).map(a =>
                        `${a.client_invoices?.invoice_number ?? 'invoice'}${(p.client_payment_allocations ?? []).length > 1 ? ` (${money(Number(a.amount))})` : ''}`).join(', ')}
                    </span>
                  )}
                </span>
                <span className="text-sm text-muted-fg">{p.method || '-'}</span>
                <span className="text-sm font-semibold text-success md:text-right block">{money(p.amount)}</span>
                {/* Two different truths, shown differently. qbo_id means the
                    sync actually pushed it - a fact, so not clickable. The
                    hand-tick stays for people who type into QuickBooks
                    themselves, and stays a toggle because it is their claim. */}
                {p.qbo_id ? (
                  <span title={`In QuickBooks - search for ${p.reference || 'SN-' + p.id.slice(0, 8)} or the memo`}
                    className="whitespace-nowrap text-xs inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-tint px-2 py-0.5 text-success">
                    <Check className="h-3 w-3" /> QB ✓
                  </span>
                ) : (
                  <button onClick={() => toggleQb(p)} title="Mark as entered in QuickBooks by hand"
                    className={cn('whitespace-nowrap text-xs inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
                      p.qb_entered ? 'border-success/40 bg-success-tint text-success' : 'border-line text-faint hover:border-muted2 hover:text-muted-fg')}>
                    {p.qb_entered ? <><Check className="h-3 w-3" /> QB</> : 'QB?'}
                  </button>
                )}
                <div className="flex justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(p.id); setEditForm({ paid_date: p.paid_date ?? '', amount: toAmountInput(p.amount), method: p.method ?? 'Check', memo: p.memo ?? '', reference: p.reference ?? '', retainer: p.retainer, qb_entered: p.qb_entered, on_account: !!p.on_account }) }} className="p-1.5 rounded-lg text-faint hover:bg-muted"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(p)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_5rem_3rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span><span /><span /><span className="text-right text-success">{money(s?.received ?? 0)}</span><span /><span />
          </div>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return <div><p className="text-xs text-faint mb-0.5">{label}</p><p className={cn('font-semibold text-ink-soft', cls)}>{value}</p></div>
}

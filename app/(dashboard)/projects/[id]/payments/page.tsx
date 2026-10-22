'use client'

import { useEffect, useState, Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ClientInvoices } from '@/components/projects/client-invoices'
import { PaymentRequests } from '@/components/projects/payment-requests'
import { PaymentAllocations, type PayableInvoice } from '@/components/projects/payment-allocations'
import { allocationProblem, cents, dollars, spreadPayment } from '@/lib/invoice-settlement'
import { Button, buttonClasses } from '@/components/ui/button'
import { DetailRows, DetailSection } from '@/components/bills/detail-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import Link from 'next/link'
import { Plus, X, Wallet, Trash2, Pencil, Check, ArrowRight, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toAmountInput } from '@/lib/validate'
import { usePermissions } from '@/lib/use-permissions'
import { useOpenRecord } from '@/lib/use-open-record'

import { formatDate, todayDateInput } from '@/lib/dates'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { qbShortReason } from '@/lib/qbo-short-reason'
import { QboExternalFlag } from '@/components/quickbooks/external-flag'
interface Payment {
  id: string; paid_date: string | null; amount: number; method: string | null
  memo: string | null; retainer: boolean; qb_entered: boolean
  /** The payer's own reference - what QuickBooks shows as Reference no. */
  reference: string | null
  /** Set by the real QuickBooks sync. When present, the chip is a fact, not a claim. */
  qbo_id: string | null
  /** QuickBooks refused the latest push of this payment, and why (from the sync log). */
  qb_error?: string | null
  /** 'quickbooks' when the payment was recorded in QuickBooks and brought back. */
  origin?: string | null
  /** What QuickBooks says about it since (voided / deleted / changed there). */
  qbo_external_state?: string | null
  qbo_external_note?: string | null
  /**
   * A share of one check split across a development's houses. Changed or
   * deleted with the whole check, on the development - the route refuses it here.
   */
  payment_group_id?: string | null
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
// The sign goes BEFORE the dollar: an overdrawn escrow read "$-30".
const money = (n: number) => `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n || 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const blank = { paid_date: '', amount: '', method: 'Check', memo: '', reference: '', retainer: false, qb_entered: false, on_account: false }
const METHODS = ['Check', 'QuickPay', 'Wire', 'ACH', 'Cash', 'CC', 'Other']

// useOpenRecord reads `?open=` through useSearchParams, which needs a Suspense
// boundary at the route level - the same shape as the Change Orders page.
export default function PaymentsPage({ params }: { params: { id: string } }) {
  return <Suspense fallback={null}><PaymentsPageInner params={params} /></Suspense>
}

function PaymentsPageInner({ params }: { params: { id: string } }) {
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
  /** A payment on its way to the server (and QuickBooks), shown on the page while the dialog is already closed. */
  const [pendingPayment, setPendingPayment] = useState<string | null>(null)
  const [retrying, setRetrying] = useState('')
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
  // A client invoice open as a screen of its own - in the URL, so Back returns
  // to this page rather than leaving the job.
  const { id: openInvoice, open: openClientInvoice, close: closeClientInvoice } = useOpenRecord()

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
      paid_date: todayDateInput(),
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
    // Re-read what is payable as the form opens: the invoice being settled may
    // have been issued since the page loaded, and the form's check (and the
    // route's) asks this list.
    loadPayable()
    // `amount` is what the invoice still OWES, not its total - a second payment
    // on a partly paid invoice starts from the balance.
    setForm({
      ...blank,
      paid_date: todayDateInput(),
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

    // THE DIALOG DOES NOT WAIT FOR QUICKBOOKS. Saving pushes to QuickBooks in
    // the same request (up to 8s), and the pilot sat behind a "Saving..."
    // dialog for all of it. It closes now; the page shows the payment as
    // saving and stays scrollable. A refusal reopens the form with exactly
    // what was typed - the snapshot - so nothing has to be entered twice.
    const snap = { form, settling, picked, shares, sharesTouched }
    const label = `$${Number(form.amount).toLocaleString('en-US', { maximumFractionDigits: 2 })}`
    closePaymentForm()
    setPendingPayment(label)
    let created: any = null
    try {
      const t = await token()
      const res = await fetch(`/api/projects/${params.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({
          ...snap.form,
          amount: Number(snap.form.amount),
          // Which invoices this money pays, and how much of it went to each.
          // The server marks an invoice paid once its payments cover it - this
          // page no longer says "paid" itself, which is how $5,000 against a
          // $10,000 invoice used to read Paid.
          allocations,
        }),
      })
      if (!res.ok) {
        notify((await res.json().catch(() => ({}))).error ?? 'Could not add the payment.')
        setForm(snap.form); setSettling(snap.settling); setPicked(snap.picked)
        setShares(snap.shares); setSharesTouched(snap.sharesTouched); setAdding(true)
        return
      }
      created = await res.json().catch(() => ({} as any))

      // Settle the deposit request this payment answers, and point it at the
      // payment. Only after the payment is safely written: marking a request
      // paid against money that failed to save is the lie this flow exists to
      // avoid.
      if (snap.settling?.kind === 'request') {
        await fetch(`/api/projects/${params.id}/payment-requests/${snap.settling.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({ status: 'paid', client_payment_id: created?.payment?.id ?? null }),
        }).catch(() => {})
      }
    } catch (e) {
      // The request did not come back: it may or may not have saved, so the
      // form is NOT reopened (that is how a payment gets entered twice).
      notify(fetchProblem(e, 'saving the payment'))
    } finally {
      setPendingPayment(null)
      setRequestsKey(k => k + 1)
      load()
    }
    // Saved here, refused by QuickBooks: said now, to the person who pressed
    // Add, not left for somebody to find under Settings.
    if (created?.quickbooks && created.quickbooks.pushed === false) {
      notify(`Payment saved. QuickBooks did not take it${created.quickbooks.detail ? `: ${created.quickbooks.detail}` : ''}. Fix that in QuickBooks, then press Retry QB on the payment.`)
    }
  }

  async function retryQb(p: Payment) {
    if (retrying) return
    setRetrying(p.id)
    const t = await token()
    try {
      const res = await fetch('/api/quickbooks/sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ entity: 'payments', ids: [p.id] }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) notify(d?.error ?? 'Could not retry. An admin can retry it from Settings -> Integrations.')
    } catch {
      notify('Could not reach the server. Reload to see whether it went through before retrying.')
    } finally {
      await load()
      setRetrying('')
    }
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
      const res = await fetch(`/api/projects/${params.id}/payments/${p.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
      const j = await res.json().catch(() => ({}))
      // The answer was thrown away, so a refusal - the split-cheque one, or
      // QuickBooks refusing the void - looked exactly like a delete that worked.
      if (!res.ok) notify(j.error ?? 'Could not delete that payment')
      else if (j.quickbooks && !j.quickbooks.voided) {
        notify(`Deleted here, but not in QuickBooks${j.quickbooks.detail ? `: ${j.quickbooks.detail}` : ''}.`)
      }
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

  // Add form - modal so it's front-and-center, not buried at the bottom. A
  // variable, because an open invoice's screen records payments through it too.
  const paymentDialog = adding && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={closePaymentForm}>
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
              <Button onClick={addPayment}>Add</Button>
            </div>
          </div>
        </div>
        </div>
      )

  const invoices = (
    <ClientInvoices projectId={params.id} onSettle={settleInvoice} reloadKey={requestsKey}
      onChanged={() => { load(); setRequestsKey(k => k + 1) }}
      openId={isAia ? null : openInvoice} onOpen={openClientInvoice} onClose={closeClientInvoice} />
  )

  // One invoice open: its screen and nothing else. The summary cards above it
  // are about the whole job, and would push the invoice a screen down a phone.
  if (openInvoice && billingMode !== null && !isAia) {
    return (
      <div className="lg:p-6">
        {invoices}
        {paymentDialog}
      </div>
    )
  }

  const feeLabel = `${(feePct * 100).toFixed(feePct * 100 % 1 ? 1 : 0)}%`
  const escrow = s?.escrowBalance ?? 0
  const owedVendors = s?.outstandingToVendors ?? 0
  // `available` is clamped once and used for BOTH halves of the sentence. It
  // used to say "only $0 is available" (clamped) and then "you're short
  // $35,000" (unclamped) in the same breath - subtracting a NEGATIVE escrow
  // balance added the $10,000 already paid back on top of the $25,000 owed.
  const available = Math.max(escrow, 0)
  const enough = owedVendors > 0 && available >= owedVendors

  return (
    <div className="flex flex-col gap-4 lg:gap-5 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">Billing the client</h1>
          <p className="mt-1 text-sm text-muted-fg">
            Money <span className="font-medium text-ink-soft">in</span> from the client, your fee, and what is left to
            pay vendors. Bills your subs sent <span className="font-medium text-ink-soft">you</span> are on{' '}
            <a href={`/projects/${params.id}/invoices`} className="font-medium text-accent-fg hover:underline">Bills from subs</a>.
          </p>
        </div>
        <Button size="lg" onClick={() => setAdding(v => !v)} className="h-11 shrink-0 rounded-[10px] px-5">
          <Plus className="h-4 w-4" /> Record payment
        </Button>
      </div>

      {/* THE ONE NUMBER, AND WHAT IT MEANS. Four tiles in four colours said
          four things at equal volume; the question this page is opened to
          answer is "can I pay my subs?", so escrow is the headline and the
          answer sits under it. Colour only where it means something. */}
      <section className="flex flex-col gap-5 rounded-2xl border border-line bg-panel p-5 lg:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-fg lg:text-[13px]">Escrow balance</div>
            <div className={cn('text-[32px] font-bold leading-tight tracking-tight tabular-nums lg:text-4xl lg:leading-none',
              escrow < 0 ? 'text-danger' : 'text-ink')}>{money(escrow)}</div>
            <p className="mt-2 text-sm text-muted-fg">
              {/* A NEGATIVE ESCROW IS A FACT OF ITS OWN: vendors have been paid
                  more than the client has paid in. Said, not left as a red
                  number for somebody to work out. */}
              {escrow < 0 && (
                <><span className="font-semibold text-danger">Escrow is overdrawn.</span>{' '}
                  Vendors have been paid {money(-escrow)} more than the client has paid you.{' '}</>
              )}
              {owedVendors <= 0 ? (
                <>Nothing is owed to vendors right now.</>
              ) : enough ? (
                <><span className="font-semibold text-success">You have enough to pay your vendors.</span>{' '}
                  {money(escrow)} in escrow covers the {money(owedVendors)} still owed. Go ahead and release payment.</>
              ) : (
                <><span className="font-semibold text-warn">Hold off - not enough in escrow yet.</span>{' '}
                  {money(owedVendors)} is owed to vendors but only {money(available)} is available. You&apos;re short {money(owedVendors - available)} - collect from the client first.</>
              )}
            </p>
          </div>
          {enough && (
            <Link href={`/projects/${params.id}/invoices`} className={cn(buttonClasses('outline', 'lg'), 'h-11 shrink-0 rounded-[10px] px-4')}>
              Pay vendors <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-4 border-t border-line-soft pt-4 lg:grid-cols-4">
          <Figure label="Funds received" value={money(s?.received ?? 0)} />
          <Figure label={`Contractor fee (${feeLabel})`} value={money(s?.feeEarned ?? 0)} />
          <Figure label="Paid to vendors" value={money(s?.vendorPaid ?? 0)} />
          <Figure label="Still owed to vendors" value={money(owedVendors)} cls={owedVendors > 0 ? 'text-warn' : undefined} />
        </div>
      </section>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
        <div className="flex min-w-0 flex-col gap-4 lg:flex-1 lg:gap-5">
          {/* Asking for money that has no costs behind it yet. Above the
              invoices because it comes first in the job: the deposit is what you
              ask for before there is anything to bill. Shown on BOTH billing
              modes - a pay application bills work in place, and a deposit is
              not work in place. */}
          <PaymentRequests projectId={params.id} onSettle={settleRequest} reloadKey={requestsKey} />

          {/* Billing the client. Not shown on AIA jobs - there the claim goes
              out as a pay application, and two ways to bill the same client for
              the same work is how the numbers stop agreeing. */}
          {billingMode !== null && (isAia ? (
            <section className="flex flex-col gap-2 rounded-2xl border border-line bg-panel p-5 lg:p-6">
              <h2 className="text-base font-semibold text-ink lg:text-[17px]">Billing your client</h2>
              <p className="text-sm text-muted-fg">
                This is an AIA job, so what the client owes for work done is raised as a pay application
                rather than an invoice from here. Deposits and stage payments are asked for above, and the
                money they send you is recorded here too.
              </p>
              <Link
                href={`/projects/${params.id}/pay-apps`}
                className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-semibold text-accent-fg hover:underline lg:min-h-0"
              >
                Go to Pay Apps <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </section>
          ) : (
            invoices
          ))}
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:w-[340px] lg:shrink-0 lg:gap-5">
          <DetailSection title="Escrow">
            <DetailRows rows={[
              { label: 'Paid from escrow', value: money(s?.escrowPaid ?? 0) },
              { label: 'Client paid vendors direct', value: money(s?.clientPaidDirect ?? 0) },
              { label: 'Vendors have billed', value: money(s?.vendorBilled ?? 0) },
              { label: 'Still owed to vendors', value: <span className={owedVendors > 0 ? 'font-semibold text-warn' : undefined}>{money(owedVendors)}</span> },
              // The markup, under another name - same permission as the Budget
              // tab's margin panel, or a project manager loses it on one screen
              // and reads it off the other.
              ...(canSeeMargin ? [{
                label: 'Contractor fee rate',
                value: feeEditing ? (
                  <span className="inline-flex items-center gap-1">
                    <Input className="h-9 w-20" inputMode="decimal" aria-label="Contractor fee rate" value={feeInput} onChange={e => setFeeInput(e.target.value)} placeholder="15" />
                    <span className="text-sm text-muted-fg">%</span>
                    <button type="button" onClick={saveFee} aria-label="Save the fee rate" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-success hover:bg-surface"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => setFeeEditing(false)} aria-label="Cancel" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
                  </span>
                ) : (
                  <button type="button" onClick={() => { setFeeInput(toAmountInput(feePct * 100)); setFeeEditing(true) }}
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-ink hover:text-accent-fg lg:min-h-0">
                    {feeLabel} <Pencil className="h-3.5 w-3.5 text-faint" />
                  </button>
                ),
              }] : []),
            ]} />
          </DetailSection>

          <DetailSection title="Projections">
            <DetailRows rows={[
              { label: 'Projected job cost', value: money(s?.projectedCost ?? 0) },
              { label: 'Invoiced already', value: money(s?.invoicedAlready ?? 0) },
              { label: 'Still to invoice', value: <span className="font-semibold text-accent-fg">{money(s?.projectedGoingForward ?? 0)}</span> },
            ]} />
            <p className="text-xs text-muted-fg">Projected cost = Budget × (1 + {feeLabel} fee). Set budget lines on the Budget tab.</p>
          </DetailSection>
        </div>
      </div>

      {paymentDialog}

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-5 lg:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-ink lg:text-[17px]">Payments received</h2>
        {payments.length > 0 && <span className="text-sm text-muted-fg"><span className="font-semibold tabular-nums text-ink">{money(s?.received ?? 0)}</span> in total</span>}
      </div>
      {pendingPayment && (
        <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-sm text-ink-soft" role="status">
          <Loader2 className="h-4 w-4 animate-spin text-muted-fg" /> Saving the {pendingPayment} payment and sending it to QuickBooks - you can keep working.
        </div>
      )}

      {/* Ledger */}
      {payments.length === 0 && !pendingPayment ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-muted2 px-6 py-8 text-center">
          <Wallet className="h-7 w-7 text-faint" />
          <p className="text-sm text-muted-fg">No client payments recorded yet. Record payment, above, logs a deposit or a check the moment it arrives.</p>
        </div>
      ) : (
        <div className="-mx-5 border-t border-line-soft lg:-mx-6">
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_7.5rem_3rem] gap-2 px-5 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide lg:px-6">
            <span>Date</span><span>Reference / memo</span><span>Method</span><span className="text-right">Amount</span><span>QB</span><span />
          </div>
          <div className="divide-y divide-line-soft">
            {payments.map(p => editingId === p.id ? (
              <div key={p.id} className="px-5 py-3 grid grid-cols-2 sm:grid-cols-6 gap-2 bg-accent-tint/30 items-center lg:px-6">
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
              <div key={p.id} className="group flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 hover:bg-surface md:grid md:grid-cols-[7rem_1fr_8rem_1fr_7.5rem_3rem] md:gap-2 lg:px-6">
                <span className="basis-full text-xs text-muted-fg md:basis-auto md:text-sm md:text-ink-soft">{p.paid_date ? formatDate(p.paid_date) : '-'}</span>
                <span className="min-w-0 basis-full text-sm text-ink-soft md:basis-auto md:truncate">
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
                  {/* The reason, on the row - a tooltip is not there on a phone. */}
                  {p.qb_error && !p.qbo_id && (
                    <span className="block text-xs text-danger">QuickBooks: {qbShortReason(p.qb_error)}</span>
                  )}
                  {p.origin === 'quickbooks' && <span className="block text-xs text-faint">Recorded in QuickBooks</span>}
                  <QboExternalFlag state={p.qbo_external_state} note={p.qbo_external_note} table="client_payments" id={p.id} onCleared={load} />
                </span>
                <span className="hidden text-sm text-muted-fg md:block">{p.method || '-'}</span>
                <span className="mr-auto shrink-0 text-sm font-semibold tabular-nums text-ink md:mr-0 md:block md:text-right">{money(p.amount)}</span>
                {/* Two different truths, shown differently. qbo_id means the
                    sync actually pushed it - a fact, so not clickable. The
                    hand-tick stays for people who type into QuickBooks
                    themselves, and stays a toggle because it is their claim. */}
                {p.qbo_id ? (
                  <span title={`In QuickBooks - search for ${p.reference || 'SN-' + p.id.slice(0, 8)} or the memo`}
                    className="w-fit justify-self-start whitespace-nowrap text-xs inline-flex items-center gap-1 rounded-full border border-success/40 bg-success-tint px-2 py-0.5 text-success">
                    <Check className="h-3 w-3" /> QB ✓
                  </span>
                ) : p.payment_group_id ? (
                  <span className="text-xs text-faint">-</span>
                ) : p.qb_error ? (
                  // A BUTTON THAT LOOKS LIKE ONE: an outline, an icon and a hover,
                  // not a pill - beside the "retainer" tag it read as a label.
                  <button onClick={() => retryQb(p)} disabled={retrying === p.id}
                    title={`QuickBooks refused it: ${p.qb_error} - fix that, then press to retry`}
                    className="w-fit justify-self-start whitespace-nowrap text-xs font-semibold inline-flex items-center gap-1 rounded-md border border-danger bg-panel px-2 py-1 text-danger shadow-sm hover:bg-danger-tint cursor-pointer disabled:opacity-60">
                    {retrying === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Retry QB
                  </button>
                ) : (
                  <button onClick={() => toggleQb(p)} title="Mark as entered in QuickBooks by hand"
                    className={cn('w-fit justify-self-start whitespace-nowrap text-xs inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-colors',
                      p.qb_entered ? 'border-success/40 bg-success-tint text-success' : 'border-line text-faint hover:border-muted2 hover:text-muted-fg')}>
                    {p.qb_entered ? <><Check className="h-3 w-3" /> QB</> : 'QB?'}
                  </button>
                )}
                {p.payment_group_id ? (
                  <span className="text-right text-[11px] leading-tight text-faint" title="Part of one check split across houses - change or delete it from the development">Split check</span>
                ) : (
                <div className="flex justify-end gap-1 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                  <button onClick={() => { setEditingId(p.id); setEditForm({ paid_date: p.paid_date ?? '', amount: toAmountInput(p.amount), method: p.method ?? 'Check', memo: p.memo ?? '', reference: p.reference ?? '', retainer: p.retainer, qb_entered: p.qb_entered, on_account: !!p.on_account }) }} aria-label="Edit this payment" title="Edit this payment" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-muted md:h-8 md:w-8"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(p)} aria-label="Delete this payment" title="Delete this payment" className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-danger-tint hover:text-danger md:h-8 md:w-8"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                )}
              </div>
            ))}
          </div>
          <div className="hidden md:grid grid-cols-[7rem_1fr_8rem_1fr_7.5rem_3rem] gap-2 px-5 py-3 border-t border-line text-sm font-bold text-ink lg:px-6">
            <span>Total</span><span /><span /><span className="text-right tabular-nums">{money(s?.received ?? 0)}</span><span /><span />
          </div>
        </div>
      )}
      </section>
    </div>
  )
}

function Figure({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-muted-fg lg:text-[13px]">{label}</div>
      <div className={cn('truncate text-lg font-bold tabular-nums text-ink lg:text-[22px]', cls)}>{value}</div>
    </div>
  )
}

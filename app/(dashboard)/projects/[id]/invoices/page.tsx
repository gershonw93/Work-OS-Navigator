'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, Receipt, CheckCircle2, Clock, Send, DollarSign, ChevronDown, ChevronUp, Printer, Upload, AlertTriangle, Pencil, Trash2, FileText, ScanLine, Loader2, Wallet } from 'lucide-react'
import Link from 'next/link'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { BudgetDestinationBox } from '@/components/projects/budget-destination'
import { ACTUAL_STATUSES, type BudgetDestination } from '@/lib/invoice-budget'
import type { QuoteCheck } from '@/lib/invoice-check'
import { markUp, markupLabel, markupTotals } from '@/lib/markup'
import {
  reconcile, reconciliationNote, lineAmount, linesTotal,
  type InvoiceLine as InvoiceLineItem,
} from '@/lib/invoice-lines'
import { HARD_COST_CATEGORIES } from '@/lib/budget-categories'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-warn-tint border-warn/30 text-warn' },
  approved: { label: 'Approved', color: 'bg-info-tint border-info/30 text-info' },
  // The sub sent this invoice TO you - it is a bill you owe, not something you
  // send them. This step is releasing it to be paid (handed to bookkeeping, put
  // in the next payment run), which is what "sent" always meant here.
  sent: { label: 'Sent for Payment', color: 'bg-special-tint border-special/30 text-special' },
  paid: { label: 'Paid', color: 'bg-success-tint border-success/30 text-success' },
}

interface Subcontract { id: string; trade: string; contract_amount: number; company_id: string; companies?: { name: string } }
interface PaymentItem { id: string; subcontract_id: string; label: string; amount: number | null; percentage: number | null; status: string }
interface Invoice {
  id: string; invoice_number: string; company_name: string; company_id: string
  amount: number; description: string | null; status: string
  client_paid?: number; escrow_paid?: number
  approved_by_name: string | null; approved_at: string | null; sent_at: string | null
  due_date: string | null; created_at: string; subcontract_id: string | null
  payment_schedule_item_id: string | null; subcontracts?: { trade: string; contract_amount: number }
  lien_waiver_url: string | null; lien_waiver_type: string | null; lien_waiver_uploaded_at: string | null
  document_url?: string | null; document_name?: string | null
  /** The budget line this lands on, resolved through the subcontract. */
  budget_line?: BudgetDestination | null
  line_items?: InvoiceLineItem[] | null
  subtotal?: number | null
  tax?: number | null
  retainage?: number | null
  quote_check?: (QuoteCheck & { summary?: string }) | null
  /** Set once this has been pushed to QuickBooks as a Bill. */
  qbo_id?: string | null
  /** Cost-plus: own rate as a percent, null follows the project rate. */
  markup_pct?: number | null
  markup_excluded?: boolean | null
  /** Already passed on to the client on a client invoice. */
  client_billed?: boolean
}

export default function InvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  // Budget line per subcontract, so the form can show where the money is going
  // the moment a sub is picked - before anything is saved.
  const [destinations, setDestinations] = useState<Record<string, BudgetDestination>>({})
  const [creatingLineFor, setCreatingLineFor] = useState<string | null>(null)
  const [billingMode, setBillingMode] = useState('simple')
  /** The project's markup rate as a percent. 0 means cost-plus is not in use. */
  const [projectMarkup, setProjectMarkup] = useState(0)
  /** Cost-plus jobs always get the per-invoice markup controls. */
  const [contractType, setContractType] = useState<string | null>(null)
  // On a cost-plus job the markup controls belong on every invoice regardless
  // of the default rate - otherwise a job billed line-by-line, with no project
  // rate set, had nowhere to mark up its first invoice at all.
  const costPlus = contractType === 'cost_plus'
  const [savingMarkup, setSavingMarkup] = useState<string | null>(null)
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [uploadingWaiver, setUploadingWaiver] = useState<string | null>(null)
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null)
  const [editInvoiceNumber, setEditInvoiceNumber] = useState('')
  const [editAmount, setEditAmount] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [editClientPaid, setEditClientPaid] = useState('')
  const [editEscrowPaid, setEditEscrowPaid] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const conditionalInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const unconditionalInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const invoiceDocRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)

  // Form
  const [subId, setSubId] = useState('')
  const [scheduleItemId, setScheduleItemId] = useState('')
  const [billMode, setBillMode] = useState<'schedule' | 'percent' | 'fixed'>('fixed')
  const [percent, setPercent] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [createError, setCreateError] = useState('')
  // The breakdown. Filled by a scan, or typed - an invoice entered by hand
  // deserves the same detail as one that was read off a PDF.
  const [lineItems, setLineItems] = useState<InvoiceLineItem[]>([])

  // Scanned invoice: the document is already stored, so it rides along with the
  // create and gets attached without a second upload.
  const [scanning, setScanning] = useState(false)
  const [scanDrag, setScanDrag] = useState(false)
  const [scanned, setScanned] = useState<null | {
    document_url: string | null; document_name: string
    confidence: string | null; read_error: string | null
    matched: string | null; certain: boolean; note: string | null
    quoteCheck: QuoteCheck & { summary: string } | null
    lineItems: InvoiceLineItem[]; subtotal: number | null; tax: number | null; retainage: number | null
  }>(null)
  const scanRef = useRef<HTMLInputElement>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    const token = await getToken()
    const [invRes, finRes] = await Promise.all([
      fetch(`/api/projects/${params.id}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/projects/${params.id}/financials`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (invRes.ok) {
      const d = await invRes.json()
      setInvoices(d.invoices)
      setDestinations(d.destinations ?? {})
      setBillingMode(d.billing_mode ?? 'simple')
      setProjectMarkup(Number(d.markup_pct) || 0)
      setContractType(d.contract_type ?? null)
    }
    if (finRes.ok) {
      const d = await finRes.json()
      setSubcontracts((d.subcontracts ?? []).map((s: any) => ({
        id: s.id, trade: s.trade, contract_amount: Number(s.contract_amount) || 0,
        company_id: s.companies?.id ?? s.company_id, companies: s.companies,
      })))
      setPaymentItems(d.payment_schedule_items ?? [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [params.id])

  // When sub is selected, pre-fill amount from payment schedule item if selected
  useEffect(() => {
    if (scheduleItemId) {
      const item = paymentItems.find(p => p.id === scheduleItemId)
      if (item?.amount) setAmount(item.amount.toString())
      if (item?.label) setDescription(item.label)
    }
  }, [scheduleItemId])

  // Amount actually billed, based on the chosen mode
  const billedAmount = (() => {
    const sub = subcontracts.find(s => s.id === subId)
    if (billMode === 'percent') return sub ? Math.round((Number(percent) || 0) / 100 * sub.contract_amount * 100) / 100 : 0
    return parseFloat(amount) || 0
  })()

  // What's still owed on the selected sub's contract: contract minus everything
  // already invoiced (any non-rejected invoice counts against the balance so
  // you can't stack drafts past the contract).
  const selectedSub = subcontracts.find(s => s.id === subId)
  const alreadyInvoiced = selectedSub
    ? invoices
        .filter(i => i.subcontract_id === selectedSub.id && i.status !== 'rejected')
        .reduce((sum, i) => sum + Number(i.amount || 0), 0)
    : 0
  const remaining = selectedSub ? Math.max(selectedSub.contract_amount - alreadyInvoiced, 0) : 0
  const overBilled = !!selectedSub && billedAmount > remaining + 0.005

  /**
   * Give a subcontract a budget line so its invoices have somewhere to land.
   *
   * Same one-click assignment the Budget tab offers, brought here because this
   * is where you find out it's missing - at the moment you're about to approve
   * money against a contract the budget can't see.
   */
  async function createBudgetLine(sub: Subcontract) {
    setCreatingLineFor(sub.id)
    try {
      const token = await getToken()
      const name = (sub.companies as any)?.name ?? sub.trade
      const trade = (sub.trade ?? '').trim()
      const category = HARD_COST_CATEGORIES.find(c => c.toLowerCase() === trade.toLowerCase()) || 'General'
      const res = await fetch(`/api/projects/${params.id}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          category,
          description: [name, trade].filter(Boolean).join(' · '),
          // The contract is the best guess at the budget; it's editable on the
          // Budget tab if the estimate was meant to be something else.
          budgeted_amount: sub.contract_amount,
          subcontract_id: sub.id,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setCreateError(j.error ?? 'Could not add the budget line')
        return
      }
      await fetchData()
    } finally {
      setCreatingLineFor(null)
    }
  }

  /**
   * Read an emailed invoice and fill the form in.
   *
   * Everything lands as a draft the user confirms - the file is attached either
   * way, so even a failed read leaves them better off than starting from blank.
   */
  async function scanInvoice(file: File) {
    setScanning(true); setCreateError(''); setScanned(null)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/projects/${params.id}/invoices/scan`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const raw = await res.text()
      let d: any = {}
      try { d = JSON.parse(raw) } catch { d = { error: raw.slice(0, 200) } }
      if (!res.ok) { setCreateError(d.error ?? 'Could not read that file'); return }

      const draft = d.draft ?? {}
      if (d.match?.subcontract_id) {
        setSubId(d.match.subcontract_id)
        setScheduleItemId(d.schedule_item?.id ?? '')
        setBillMode(d.schedule_item?.id ? 'schedule' : 'fixed')
      } else {
        setSubId(''); setScheduleItemId(''); setBillMode('fixed')
      }
      if (draft.amount != null) setAmount(String(draft.amount))
      if (draft.description) setDescription(draft.description)
      if (draft.due_date) setDueDate(draft.due_date)
      setLineItems(Array.isArray(draft.line_items) ? draft.line_items : [])

      setScanned({
        document_url: d.document_url ?? null,
        document_name: d.document_name ?? file.name,
        confidence: draft.confidence ?? null,
        read_error: d.read_error ?? null,
        matched: d.match?.company_name ?? null,
        certain: !!d.match?.certain,
        note: d.schedule_item?.note ?? null,
        quoteCheck: d.quote_check ?? null,
        lineItems: [],
        subtotal: draft.subtotal ?? null,
        tax: draft.tax ?? null,
        retainage: draft.retainage ?? null,
      })
      setShowForm(true)
    } catch (e: any) {
      setCreateError(e?.message ?? 'Could not read that file')
    } finally {
      setScanning(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateError('')
    const sub = subcontracts.find(s => s.id === subId)
    if (!sub) { setCreateError('Select a subcontractor'); return }
    if (!(billedAmount > 0)) { setCreateError('Enter an amount or percent'); return }
    if (billedAmount > remaining + 0.005) {
      setCreateError(`That's more than the $${remaining.toLocaleString()} still owed on this contract.`)
      return
    }
    setSubmitting(true)
    const token = await getToken()
    try {
      const res = await fetch(`/api/projects/${params.id}/invoices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subcontract_id: subId || null,
          payment_schedule_item_id: billMode === 'schedule' ? (scheduleItemId || null) : null,
          company_id: sub?.company_id,
          company_name: (sub?.companies as any)?.name ?? sub?.trade,
          amount: billedAmount,
          description: description || (billMode === 'percent' ? `${percent}% of contract` : null),
          due_date: dueDate || null,
          ...(scanned?.document_url
            ? { document_url: scanned.document_url, document_name: scanned.document_name }
            : {}),
          // The breakdown travels with the invoice rather than being read once
          // and thrown away.
          line_items: lineItems,
          subtotal: scanned?.subtotal ?? null,
          tax: scanned?.tax ?? null,
          retainage: scanned?.retainage ?? null,
          quote_check: scanned?.quoteCheck ?? null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setCreateError(j.error || `Could not create invoice (${res.status}). If this persists, run the invoices migration (023).`)
        setSubmitting(false)
        return
      }
      setSubId(''); setScheduleItemId(''); setAmount(''); setPercent(''); setDescription(''); setDueDate('')
      setLineItems([])
      setScanned(null)
      setShowForm(false); setSubmitting(false); fetchData()
    } catch (err: any) {
      setCreateError(err?.message ? `Failed: ${err.message}` : 'Failed - check your connection.')
      setSubmitting(false)
    }
  }

  /** Change the markup on one invoice: exclude it, or give it its own rate. */
  async function saveMarkup(invoice: Invoice, patch: { markup_pct?: number | null; markup_excluded?: boolean }) {
    setSavingMarkup(invoice.id)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    })
    setSavingMarkup(null); fetchData()
  }

  async function updateStatus(invoice: Invoice, newStatus: string) {
    setUpdating(invoice.id)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: newStatus }),
    })
    setUpdating(null); fetchData()
  }

  function openEditInvoice(invoice: Invoice) {
    setEditInvoice(invoice)
    setEditInvoiceNumber(invoice.invoice_number)
    setEditAmount(String(invoice.amount))
    setEditNotes(invoice.description ?? '')
    setEditClientPaid(invoice.client_paid ? String(invoice.client_paid) : '')
    setEditEscrowPaid(invoice.escrow_paid ? String(invoice.escrow_paid) : '')
  }

  async function handleEditInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!editInvoice) return
    setEditSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/invoices/${editInvoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        invoice_number: editInvoiceNumber,
        amount: parseFloat(editAmount),
        description: editNotes || null,
        client_paid: parseFloat(editClientPaid) || 0,
        escrow_paid: parseFloat(editEscrowPaid) || 0,
      }),
    })
    setEditSaving(false)
    setEditInvoice(null)
    fetchData()
  }

  function handleDeleteInvoice(invoice: Invoice) {
    const amount = `$${Number(invoice.amount).toLocaleString()}`
    const who = invoice.company_name ? ` to ${invoice.company_name}` : ''
    // An accepted invoice is already counted on the budget, so deleting it
    // moves money. Say which line and how much rather than asking "are you
    // sure?" about an amount the reader has to go and look up.
    const counted = ACTUAL_STATUSES.has(invoice.status)
    const line = invoice.budget_line?.category ? ` from ${invoice.budget_line.category}` : ''
    // Deleting here does not reach into QuickBooks - the Bill stays there and
    // has to be voided on that side. Better said before than discovered at
    // month end.
    // The confirm reads "Are you sure you want to delete <label>?", so this
    // stays a noun phrase with no closing punctuation.
    const qb = invoice.qbo_id ? ', and the bill already pushed to QuickBooks stays there and has to be voided on that side' : ''
    const label = counted
      ? `this ${STATUS_CONFIG[invoice.status]?.label.toLowerCase() ?? ''} invoice (${amount}${who}) - it takes ${amount} back off the budget${line}${qb}`
      : `this invoice (${amount}${who})${qb}`
    guardDelete(async () => {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        alert(j.error ?? 'Could not delete that invoice')
      }
      fetchData()
    }, { label, protected: true })
  }

  async function handleInvoiceDocUpload(invoice: Invoice, file: File) {
    setUploadingDoc(invoice.id)
    const token = await getToken()
    const fd = new FormData()
    fd.append('file', file)
    await fetch(`/api/projects/${params.id}/invoices/${invoice.id}/document`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
    })
    setUploadingDoc(null)
    fetchData()
  }

  async function handleLienWaiverUpload(invoice: Invoice, waiverType: 'conditional' | 'unconditional', file: File) {
    setUploadingWaiver(invoice.id)
    const token = await getToken()
    const fd = new FormData()
    fd.append('file', file)
    fd.append('waiver_type', waiverType)
    await fetch(`/api/projects/${params.id}/invoices/${invoice.id}/lien-waiver`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    })
    setUploadingWaiver(null)
    fetchData()
  }

  const subPaymentItems = paymentItems.filter(p => p.subcontract_id === subId && p.status !== 'paid')

  const pending = invoices.filter(i => i.status === 'pending_approval')
  const active = invoices.filter(i => i.status === 'approved' || i.status === 'sent')
  const paid = invoices.filter(i => i.status === 'paid')

  function InvoiceCard({ invoice }: { invoice: Invoice }) {
    const isExpanded = expanded === invoice.id
    const cfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.pending_approval
    return (
      <div className={cn('rounded-xl border bg-panel overflow-hidden', invoice.status === 'pending_approval' ? 'border-warn/30' : 'border-line')}>
        <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : invoice.id)}>
          <Receipt className="h-5 w-5 text-faint shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-muted-fg">{invoice.invoice_number}</span>
              <span className="font-semibold text-ink break-words">{invoice.company_name}</span>
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
              {/* Which line it hits, readable without expanding the card. */}
              {invoice.budget_line ? (
                <span className="inline-flex items-center gap-1 text-xs text-faint min-w-0">
                  <Wallet className="h-3 w-3 shrink-0" />
                  <span className="truncate">{invoice.budget_line.category}</span>
                </span>
              ) : invoice.subcontract_id ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium rounded-full border border-warn/30 bg-warn-tint text-warn px-2 py-0.5">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> Not on the budget
                </span>
              ) : null}
            </div>
            <p className="text-xs text-faint mt-0.5 break-words">
              ${Number(invoice.amount).toLocaleString()}
              {invoice.description && ` · ${invoice.description}`}
              {invoice.due_date && ` · Due ${new Date(invoice.due_date).toLocaleDateString()}`}
            </p>
          </div>
          <div className="hidden sm:block text-sm font-bold text-ink shrink-0">${Number(invoice.amount).toLocaleString()}</div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-faint shrink-0" /> : <ChevronDown className="h-4 w-4 text-faint shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-line-soft px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-faint">Invoice #</p><p className="font-mono font-medium text-ink-soft">{invoice.invoice_number}</p></div>
              <div><p className="text-xs text-faint">Amount</p><p className="font-bold text-ink">${Number(invoice.amount).toLocaleString()}</p></div>
              {invoice.due_date && <div><p className="text-xs text-faint">Due Date</p><p className="font-medium text-ink-soft">{new Date(invoice.due_date).toLocaleDateString()}</p></div>}
              <div><p className="text-xs text-faint">Created</p><p className="font-medium text-ink-soft">{new Date(invoice.created_at).toLocaleDateString()}</p></div>
              {invoice.approved_by_name && <div><p className="text-xs text-faint">Approved By</p><p className="font-medium text-ink-soft">{invoice.approved_by_name}</p></div>}
              {invoice.approved_at && <div><p className="text-xs text-faint">Approved</p><p className="font-medium text-ink-soft">{new Date(invoice.approved_at).toLocaleDateString()}</p></div>}
              {invoice.sent_at && <div><p className="text-xs text-faint">Sent for payment</p><p className="font-medium text-ink-soft">{new Date(invoice.sent_at).toLocaleDateString()}</p></div>}
            </div>
            {invoice.description && <p className="text-sm text-muted-fg break-words">{invoice.description}</p>}

            {/* Cost-plus: what to bill the client for this one. The electrician
                invoices $35,000, your 15% goes on, the client owes $40,250.
                Always on a cost-plus job; otherwise only once a rate is in use,
                so a fixed-price job never sees it. */}
            {(costPlus || projectMarkup > 0 || invoice.markup_pct != null || invoice.markup_excluded) && (() => {
              const m = markUp(invoice.amount, invoice, projectMarkup)
              return (
                <div className="rounded-lg border border-accent/30 bg-accent-tint/30 px-4 py-3 space-y-2">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
                    <span className="text-muted-fg">Cost</span>
                    <span className="font-semibold text-ink-soft tabular-nums">${Number(m.cost).toLocaleString()}</span>
                    <span className="text-faint">+</span>
                    <span className="text-muted-fg">{m.excluded ? 'no markup' : `${m.pct}%`}</span>
                    <span className="font-semibold text-ink-soft tabular-nums">${m.markup.toLocaleString()}</span>
                    <span className="text-faint">=</span>
                    <span className="text-muted-fg">bill the client</span>
                    <span className="text-lg font-bold text-accent-fg tabular-nums">${m.clientPrice.toLocaleString()}</span>
                    <span className="ml-auto text-[11px] text-faint">{markupLabel(m)}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer text-muted-fg">
                      <input type="checkbox" className="accent-[#C9F24A]"
                        checked={!!invoice.markup_excluded}
                        disabled={savingMarkup === invoice.id}
                        onChange={e => saveMarkup(invoice, { markup_excluded: e.target.checked })} />
                      Bill this at cost - no markup
                    </label>
                    {!invoice.markup_excluded && (
                      <span className="inline-flex items-center gap-1.5 text-muted-fg">
                        Markup on this one
                        <input
                          type="number" min="0" step="0.5"
                          defaultValue={invoice.markup_pct ?? ''}
                          placeholder={String(projectMarkup)}
                          disabled={savingMarkup === invoice.id}
                          onBlur={e => {
                            const raw = e.target.value.trim()
                            const next = raw === '' ? null : Number(raw)
                            if (next !== (invoice.markup_pct ?? null)) saveMarkup(invoice, { markup_pct: next })
                          }}
                          className="w-16 rounded-md border border-muted2 bg-panel px-2 py-1 text-xs text-ink tabular-nums focus:border-accent focus:outline-none"
                        />
                        %
                        {/* Empty is not zero. Empty follows the project rate, so
                            changing that rate still moves this invoice. */}
                        <span className="text-faint">
                          {projectMarkup > 0
                            ? <>leave blank to follow the project&apos;s {projectMarkup}%</>
                            : <>no project rate set - give this one its own</>}
                        </span>
                      </span>
                    )}
                    {savingMarkup === invoice.id && <span className="text-faint">saving…</span>}
                  </div>
                  {/* The step that kept getting dropped: a sub's bill is
                      approved, and then nobody passes it on. Offer it here,
                      where the cost is, instead of expecting someone to go and
                      find it again in a list of billable costs. */}
                  {billingMode !== 'aia' && ACTUAL_STATUSES.has(invoice.status) && (
                    <div className="border-t border-accent/20 pt-2 text-xs">
                      {invoice.client_billed ? (
                        <span className="inline-flex items-center gap-1.5 text-success">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Already billed to the client
                        </span>
                      ) : (
                        <a href={`/projects/${params.id}/payments?bill=${invoice.id}`}
                          className="inline-flex items-center gap-1.5 font-semibold text-accent-fg hover:underline">
                          Bill the client for this
                          <span className="font-normal text-muted-fg">
                            - ${m.clientPrice.toLocaleString()} on a new client invoice
                          </span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* The breakdown, on every invoice that has one. */}
            {(() => {
              const lines = Array.isArray(invoice.line_items) ? invoice.line_items : []
              const rec = reconcile({
                lines, tax: invoice.tax, retainage: invoice.retainage, amount: invoice.amount,
              })
              const note = reconciliationNote(rec)
              if (rec.noBreakdown) {
                return (
                  <div className="rounded-lg border border-line bg-surface px-4 py-3">
                    <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Breakdown</p>
                    <p className="text-xs text-faint mt-1">
                      No breakdown on this one - just the total. Scanning the vendor&apos;s PDF reads the
                      lines off it, or you can add them with Edit.
                    </p>
                  </div>
                )
              }
              return (
                <div className="rounded-lg border border-line bg-surface overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-line-soft">
                    <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Breakdown</p>
                    <span className={cn('text-xs font-medium', rec.balanced ? 'text-success' : 'text-warn')}>
                      {rec.balanced ? 'Adds up to the total' : 'Does not add up'}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody className="divide-y divide-line-soft">
                        {lines.map((li, i) => {
                          const amt = lineAmount(li)
                          // A line the quote check flagged, matched by its text.
                          const flag = invoice.quote_check?.findings?.find(f => f.description === li.description)
                          return (
                            <tr key={i} className={flag ? 'bg-warn-tint/40' : undefined}>
                              <td className="px-4 py-2 text-ink-soft">
                                <span className="break-words">{li.description || '—'}</span>
                                {flag && (
                                  <span className="block text-[11px] text-warn mt-0.5">
                                    {flag.kind === 'over_quoted_line'
                                      ? `Quoted $${Number(flag.quoted).toLocaleString()} — $${Math.round(flag.over ?? 0).toLocaleString()} more`
                                      : 'Not on their quote'}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-right text-xs text-faint whitespace-nowrap tabular-nums">
                                {li.qty != null && li.unit_price != null
                                  ? `${li.qty}${li.unit ? ` ${li.unit}` : ''} × $${Number(li.unit_price).toLocaleString()}`
                                  : ''}
                              </td>
                              <td className="px-4 py-2 text-right text-ink whitespace-nowrap tabular-nums">
                                {amt != null ? `$${amt.toLocaleString()}` : <span className="text-faint">—</span>}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className="border-t border-line text-xs">
                        <tr>
                          <td className="px-4 py-1.5 text-muted-fg" colSpan={2}>Lines</td>
                          <td className="px-4 py-1.5 text-right text-ink-soft tabular-nums">${rec.linesTotal.toLocaleString()}</td>
                        </tr>
                        {invoice.tax != null && Number(invoice.tax) !== 0 && (
                          <tr>
                            <td className="px-4 py-1.5 text-muted-fg" colSpan={2}>Tax</td>
                            <td className="px-4 py-1.5 text-right text-ink-soft tabular-nums">${Number(invoice.tax).toLocaleString()}</td>
                          </tr>
                        )}
                        {invoice.retainage != null && Number(invoice.retainage) !== 0 && (
                          <tr>
                            <td className="px-4 py-1.5 text-muted-fg" colSpan={2}>Retainage withheld</td>
                            <td className="px-4 py-1.5 text-right text-ink-soft tabular-nums">−${Number(invoice.retainage).toLocaleString()}</td>
                          </tr>
                        )}
                        <tr className="font-semibold">
                          <td className="px-4 py-2 text-ink" colSpan={2}>Invoice total</td>
                          <td className={cn('px-4 py-2 text-right tabular-nums', rec.balanced ? 'text-ink' : 'text-warn')}>
                            ${Number(invoice.amount).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  {note && <p className="px-4 py-2 text-xs text-warn border-t border-line-soft">{note}</p>}
                </div>
              )
            })()}

            {/* The budget line this invoice moves, and what's left on it. */}
            {invoice.subcontract_id && (() => {
              const sub = subcontracts.find(s => s.id === invoice.subcontract_id)
              return (
                <BudgetDestinationBox
                  destination={invoice.budget_line}
                  subName={invoice.company_name}
                  onCreateLine={sub ? () => createBudgetLine(sub) : undefined}
                  creating={creatingLineFor === invoice.subcontract_id}
                />
              )
            })()}

            {/* Vendor's invoice file - the sub has no account, so the GC attaches it here */}
            <div className="rounded-lg border border-line bg-surface px-4 py-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Vendor Invoice File</p>
                {invoice.document_url
                  ? <a href={invoice.document_url} target="_blank" rel="noopener noreferrer" className="text-sm text-accent-fg hover:underline inline-flex items-center gap-1 mt-1"><FileText className="h-3.5 w-3.5" /> {invoice.document_name || 'View file'}</a>
                  : <p className="text-xs text-faint mt-1">No file attached. Upload the invoice the sub emailed or handed you.</p>}
              </div>
              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" className="hidden"
                ref={el => { invoiceDocRefs.current[invoice.id] = el }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleInvoiceDocUpload(invoice, f); e.target.value = '' }} />
              <button type="button" disabled={uploadingDoc === invoice.id} onClick={() => invoiceDocRefs.current[invoice.id]?.click()}
                className="flex items-center gap-2 rounded-md border border-muted2 bg-panel px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface hover:border-accent transition-colors disabled:opacity-50">
                <Upload className="h-4 w-4 text-faint" />
                {uploadingDoc === invoice.id ? 'Uploading…' : invoice.document_url ? 'Replace' : 'Upload invoice'}
              </button>
            </div>

            {/* Lien Waiver Section */}
            <div className="rounded-lg border border-line bg-surface px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-muted-fg uppercase tracking-wide">Lien Waiver</p>

              {invoice.status === 'paid' && !invoice.lien_waiver_url && (
                <div className="flex items-start gap-2 rounded-md border border-warn/30 bg-warn-tint px-3 py-2 text-sm text-warn">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Payment released - unconditional lien waiver required</span>
                </div>
              )}

              {invoice.lien_waiver_url ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-tint border border-success/30 text-success text-xs font-medium px-3 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {invoice.lien_waiver_type === 'conditional' ? 'Conditional' : 'Unconditional'} Lien Waiver
                  </span>
                  {invoice.lien_waiver_uploaded_at && (
                    <span className="text-xs text-faint">
                      Uploaded {new Date(invoice.lien_waiver_uploaded_at).toLocaleDateString()}
                    </span>
                  )}
                  <a
                    href={invoice.lien_waiver_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-accent-fg hover:text-accent-fg underline underline-offset-2"
                  >
                    View Document
                  </a>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Hidden file inputs */}
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                    ref={el => { conditionalInputRefs.current[invoice.id] = el }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLienWaiverUpload(invoice, 'conditional', file)
                      e.target.value = ''
                    }}
                  />
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                    className="hidden"
                    ref={el => { unconditionalInputRefs.current[invoice.id] = el }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) handleLienWaiverUpload(invoice, 'unconditional', file)
                      e.target.value = ''
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingWaiver === invoice.id}
                    onClick={() => conditionalInputRefs.current[invoice.id]?.click()}
                    className="flex items-center justify-center gap-2 rounded-md border border-muted2 bg-panel px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface hover:border-accent transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 text-faint" />
                    {uploadingWaiver === invoice.id ? 'Uploading...' : 'Upload Conditional Waiver'}
                  </button>
                  <button
                    type="button"
                    disabled={uploadingWaiver === invoice.id}
                    onClick={() => unconditionalInputRefs.current[invoice.id]?.click()}
                    className="flex items-center justify-center gap-2 rounded-md border border-muted2 bg-panel px-3 py-2 text-sm font-medium text-ink-soft hover:bg-surface hover:border-accent transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 text-faint" />
                    {uploadingWaiver === invoice.id ? 'Uploading...' : 'Upload Unconditional Waiver'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Link href={`/projects/${params.id}/invoices/${invoice.id}/print`} target="_blank">
                <Button size="sm" variant="outline"><Printer className="h-3.5 w-3.5" /> View / Print</Button>
              </Link>
              {invoice.status === 'pending_approval' && (
                <Button size="sm" disabled={updating === invoice.id} onClick={() => updateStatus(invoice, 'approved')}>
                  <CheckCircle2 className="h-3.5 w-3.5" />{updating === invoice.id ? '...' : 'Approve'}
                </Button>
              )}
              {invoice.status === 'approved' && (
                <Button size="sm" variant="outline" disabled={updating === invoice.id} onClick={() => updateStatus(invoice, 'sent')}
                  title="Released to be paid - handed to bookkeeping or queued in the next payment run">
                  <Send className="h-3.5 w-3.5" />{updating === invoice.id ? '...' : 'Mark Sent for Payment'}
                </Button>
              )}
              {/* Paying straight from Approved is normal - plenty of shops
                  approve a bill and cut the check the same day, and forcing a
                  middle step just to record that made the status a lie. */}
              {(invoice.status === 'approved' || invoice.status === 'sent') && (
                <Button size="sm" disabled={updating === invoice.id} onClick={() => updateStatus(invoice, 'paid')}>
                  <DollarSign className="h-3.5 w-3.5" />{updating === invoice.id ? '...' : 'Mark Paid'}
                </Button>
              )}
              <button onClick={() => openEditInvoice(invoice)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-fg hover:text-ink hover:bg-surface transition-colors">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              {/* Deletable at every status. A duplicate you already marked paid
                  is exactly the one you need to remove, and hiding the button
                  there just meant the wrong number stayed on the budget. The
                  confirm says what it will do to the budget. */}
              <button onClick={() => handleDeleteInvoice(invoice)}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-muted-fg hover:text-danger hover:bg-danger-tint transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {editInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Edit Invoice</h2>
              <button onClick={() => setEditInvoice(null)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleEditInvoice}>
              <div className="px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Invoice Number</label>
                  <input value={editInvoiceNumber} onChange={e => setEditInvoiceNumber(e.target.value)}
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Amount</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                    <input type="number" step="0.01" required value={editAmount} onChange={e => setEditAmount(e.target.value)}
                      className="w-full rounded-md border border-muted2 pl-8 pr-3 py-2 text-sm focus:border-accent focus:outline-none" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink-soft">Notes</label>
                  <input value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Description or notes..."
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                </div>
                <div className="rounded-lg border border-line-soft bg-surface/60 p-3 space-y-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">How was it paid?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-ink-soft">Paid from escrow</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                        <input type="number" step="0.01" value={editEscrowPaid} onChange={e => setEditEscrowPaid(e.target.value)} placeholder="0.00"
                          className="w-full rounded-md border border-muted2 pl-8 pr-3 py-2 text-sm focus:border-accent focus:outline-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-ink-soft">Client paid vendor directly</label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                        <input type="number" step="0.01" value={editClientPaid} onChange={e => setEditClientPaid(e.target.value)} placeholder="0.00"
                          className="w-full rounded-md border border-muted2 pl-8 pr-3 py-2 text-sm focus:border-accent focus:outline-none" />
                      </div>
                    </div>
                  </div>
                  {(() => {
                    const amt = parseFloat(editAmount) || 0
                    const out = amt - (parseFloat(editEscrowPaid) || 0) - (parseFloat(editClientPaid) || 0)
                    return <p className="text-xs text-muted-fg">Outstanding to vendor: <span className={out > 0 ? 'font-semibold text-warn' : 'font-semibold text-success'}>${Math.max(out, 0).toLocaleString()}</span></p>
                  })()}
                </div>
              </div>
              <div className="px-6 py-4 border-t border-line-soft flex gap-2 justify-end">
                <button type="button" onClick={() => setEditInvoice(null)}
                  className="px-4 py-2 text-sm rounded-md border border-muted2 text-muted-fg hover:bg-surface">Cancel</button>
                <button type="submit" disabled={editSaving}
                  className="px-4 py-2 text-sm rounded-md bg-accent hover:bg-accent disabled:opacity-50 text-accent-ink font-medium">
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">{scanned ? 'Check this invoice' : 'Create Invoice'}</h2>
              <button onClick={() => setShowForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                {/* What the read produced, and how much to trust it. Filling the
                    form in silently would be worse than not filling it at all -
                    the one number nobody checks is the one that is wrong. */}
                {scanned && (
                  <div className="rounded-lg border border-line bg-surface p-3 space-y-1.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <FileText className="h-3.5 w-3.5 text-faint" />
                      {scanned.document_name}
                      <span className="font-normal text-faint">· attached</span>
                    </p>
                    {scanned.read_error ? (
                      <p className="text-xs text-warn">{scanned.read_error}</p>
                    ) : (
                      <p className="text-xs text-muted-fg">
                        Filled in from the document. Check the amount before you save.
                        {scanned.confidence === 'low' && ' The scan was unsure about this one.'}
                      </p>
                    )}
                    {scanned.matched && (
                      <p className={cn('text-xs', scanned.certain ? 'text-success' : 'text-warn')}>
                        {scanned.certain
                          ? `Matched to ${scanned.matched}.`
                          : `Best guess: ${scanned.matched}. Worth confirming that is the right sub.`}
                      </p>
                    )}
                    {scanned.note && <p className="text-xs text-danger font-medium">{scanned.note}</p>}
                  </div>
                )}

                {/* Against what they quoted. The contract total is the check
                    everyone already does; a rate nobody agreed to, or a line
                    that was never quoted, is the one that gets paid by
                    accident. */}
                {scanned?.quoteCheck && scanned.quoteCheck.verdict !== 'no_quote' && (
                  <div className={cn('rounded-lg border p-3 space-y-1.5',
                    scanned.quoteCheck.verdict === 'matches'
                      ? 'border-success/30 bg-success-tint'
                      : 'border-warn/30 bg-warn-tint')}>
                    <p className={cn('flex items-center gap-1.5 text-xs font-semibold',
                      scanned.quoteCheck.verdict === 'matches' ? 'text-success' : 'text-warn')}>
                      {scanned.quoteCheck.verdict === 'matches'
                        ? <><CheckCircle2 className="h-3.5 w-3.5" /> Matches their quote</>
                        : <><AlertTriangle className="h-3.5 w-3.5" /> Worth checking against their quote</>}
                    </p>
                    {scanned.quoteCheck.findings.map((f, i) => (
                      <p key={i} className="text-xs text-warn/90">
                        {f.kind === 'over_quoted_line' ? (
                          <>
                            <span className="font-medium">{f.description}</span> — billed ${Number(f.invoiced).toLocaleString()},
                            quoted ${Number(f.quoted).toLocaleString()} (${Math.round(f.over ?? 0).toLocaleString()} more)
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{f.description}</span> — ${Number(f.invoiced).toLocaleString()},
                            not on their quote
                          </>
                        )}
                      </p>
                    ))}
                    {scanned.quoteCheck.over_contract != null && (
                      <p className="text-xs font-medium text-danger">
                        This takes the total ${Math.round(scanned.quoteCheck.over_contract).toLocaleString()} past
                        their ${Number(scanned.quoteCheck.contract_amount).toLocaleString()} contract.
                      </p>
                    )}
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label>Subcontractor</Label>
                  <SearchableSelect value={subId} onChange={e => { setSubId(e.target.value); setScheduleItemId('') }} required
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">Select subcontractor...</option>
                    {subcontracts.map(s => (
                      <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} - {s.trade}</option>
                    ))}
                  </SearchableSelect>
                </div>

                {/* Where this money ends up. Shown before the amount is even
                    typed, because "which line does this hit?" is the question
                    you had to leave the page to answer. */}
                {selectedSub && (
                  <BudgetDestinationBox
                    destination={destinations[selectedSub.id]}
                    subName={(selectedSub.companies as any)?.name ?? selectedSub.trade}
                    amount={billedAmount > 0 ? billedAmount : undefined}
                    onCreateLine={() => createBudgetLine(selectedSub)}
                    creating={creatingLineFor === selectedSub.id}
                  />
                )}

                {/* Bill by */}
                <div className="space-y-1.5">
                  <Label>Bill by</Label>
                  <div className="inline-flex rounded-lg border border-line p-0.5">
                    {([['fixed', 'Fixed amount'], ['percent', '% of contract'], ['schedule', 'Scheduled item']] as const).map(([m, label]) => (
                      <button key={m} type="button" onClick={() => setBillMode(m)}
                        className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                          billMode === m ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:text-ink')}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {billMode === 'schedule' && (
                  <div className="space-y-1.5">
                    <Label>Payment Schedule Item</Label>
                    {subPaymentItems.length === 0
                      ? <p className="text-xs text-faint">No payment schedule for this sub. Use Fixed or %.</p>
                      : <SearchableSelect value={scheduleItemId} onChange={e => setScheduleItemId(e.target.value)}
                          className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                          <option value="">Select milestone...</option>
                          {subPaymentItems.map(p => (
                            <option key={p.id} value={p.id}>{p.label}{p.amount ? ` - $${Number(p.amount).toLocaleString()}` : p.percentage ? ` - ${p.percentage}%` : ''}</option>
                          ))}
                        </SearchableSelect>}
                  </div>
                )}

                {billMode === 'percent' ? (
                  <div className="space-y-1.5">
                    <Label>Percent of contract</Label>
                    <div className="relative">
                      <Input type="number" step="0.01" placeholder="e.g. 40" value={percent} onChange={e => setPercent(e.target.value)} className="pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-faint text-sm">%</span>
                    </div>
                    {selectedSub
                      ? (overBilled
                          ? <p className="text-xs text-danger">= ${billedAmount.toLocaleString()}, over the ${remaining.toLocaleString()} still owed.</p>
                          : <p className="text-xs text-muted-fg">= <span className="font-semibold text-ink-soft">${billedAmount.toLocaleString()}</span> of ${selectedSub.contract_amount.toLocaleString()} contract · ${remaining.toLocaleString()} still owed</p>)
                      : <p className="text-xs text-faint">Select a subcontractor to compute the amount.</p>}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Amount</Label>
                      {selectedSub && remaining > 0 && (
                        <button type="button" onClick={() => setAmount(String(remaining))}
                          className="text-xs font-medium text-accent-fg hover:underline">
                          Bill full remaining (${remaining.toLocaleString()})
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
                      <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                        className={cn('pl-8', overBilled && 'border-danger focus:border-danger')} />
                    </div>
                    {selectedSub && (
                      overBilled
                        ? <p className="text-xs text-danger">Over the ${remaining.toLocaleString()} still owed on this ${selectedSub.contract_amount.toLocaleString()} contract.</p>
                        : <p className="text-xs text-muted-fg">${remaining.toLocaleString()} still owed of ${selectedSub.contract_amount.toLocaleString()} contract{alreadyInvoiced > 0 ? ` (${'$'}${alreadyInvoiced.toLocaleString()} invoiced)` : ''}.</p>
                    )}
                  </div>
                )}

                {/* The breakdown. Scanned invoices arrive with it filled in;
                    typed ones can have it too, because "what am I paying for?"
                    is the same question either way. */}
                {(() => {
                  const rec = reconcile({
                    lines: lineItems, tax: scanned?.tax, retainage: scanned?.retainage, amount: billedAmount,
                  })
                  const note = reconciliationNote(rec)
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label>What is being charged for</Label>
                        <button type="button"
                          onClick={() => setLineItems(l => [...l, { description: '', amount: null }])}
                          className="text-xs font-medium text-accent-fg hover:underline">
                          + Add a line
                        </button>
                      </div>
                      {lineItems.length === 0 ? (
                        <p className="text-xs text-faint">
                          No breakdown. Add lines to record what the charges are - or leave it and the
                          invoice keeps just its total.
                        </p>
                      ) : (
                        <div className="rounded-lg border border-line divide-y divide-line-soft">
                          {lineItems.map((li, idx) => (
                            <div key={idx} className="flex items-center gap-2 px-2 py-1.5">
                              <input
                                value={li.description ?? ''}
                                onChange={e => setLineItems(l => l.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))}
                                placeholder="What it is"
                                className="flex-1 min-w-0 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
                              />
                              {li.qty != null && li.unit_price != null && (
                                <span className="text-[11px] text-faint shrink-0 tabular-nums">
                                  {li.qty}{li.unit ? ` ${li.unit}` : ''} × ${li.unit_price}
                                </span>
                              )}
                              <input
                                type="number" step="0.01"
                                value={li.amount ?? ''}
                                onChange={e => setLineItems(l => l.map((x, i) => i === idx ? { ...x, amount: e.target.value === '' ? null : Number(e.target.value) } : x))}
                                placeholder="0.00"
                                className="w-24 shrink-0 bg-transparent text-sm text-ink text-right outline-none tabular-nums placeholder:text-faint"
                              />
                              <button type="button" onClick={() => setLineItems(l => l.filter((_, i) => i !== idx))}
                                className="shrink-0 p-1 text-faint hover:text-danger" title="Remove this line">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                          <div className="flex items-center justify-between px-2 py-1.5 bg-surface text-xs">
                            <span className="text-muted-fg">
                              {lineItems.length} line{lineItems.length !== 1 ? 's' : ''}
                              {scanned?.tax ? ` + $${Number(scanned.tax).toLocaleString()} tax` : ''}
                              {scanned?.retainage ? ` − $${Number(scanned.retainage).toLocaleString()} retainage` : ''}
                            </span>
                            <span className={cn('font-semibold tabular-nums', rec.balanced ? 'text-success' : 'text-ink')}>
                              ${linesTotal(lineItems).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                      {note && <p className="text-xs text-warn">{note}</p>}
                      {rec.balanced && <p className="text-xs text-success">The breakdown adds up to the total.</p>}
                    </div>
                  )
                })()}

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input placeholder="e.g. Rough electrical complete - 40%" value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Due Date <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-line-soft space-y-2">
                {createError && <p className="text-sm text-danger">{createError}</p>}
                <div className="flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting || overBilled}>{submitting ? 'Creating...' : 'Create Invoice'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Bills from subs</h1>
          {/* Says whose bills these are and what to do with them. "Send" used
              to be in here, which read as if you invoiced the sub. */}
          <p className="text-sm text-muted-fg mt-0.5">
            Bills your subs and suppliers sent <span className="font-medium text-ink-soft">you</span> - upload one they
            emailed, or enter it yourself, then approve and pay.
          </p>
          {/* Cost-plus roll-up: cost, your fee, what the client owes. Only when
              a markup is actually in use. */}
          {(costPlus || projectMarkup > 0) && invoices.length > 0 && (() => {
            const t = markupTotals(
              invoices.filter(i => ACTUAL_STATUSES.has(i.status)).map(i => ({ ...i, cost: i.amount })),
              projectMarkup,
            )
            if (t.cost === 0) return null
            return (
              <p className="text-xs text-muted-fg mt-1.5">
                Approved so far: <span className="font-semibold text-ink-soft">${t.cost.toLocaleString()}</span> cost
                {' + '}<span className="font-semibold text-ink-soft">${t.markup.toLocaleString()}</span> your markup
                {' = '}<span className="font-semibold text-accent-fg">${t.clientPrice.toLocaleString()}</span> to bill the client
                {t.excludedCount > 0 && (
                  <span className="text-faint"> · {t.excludedCount} at cost (${t.excludedCost.toLocaleString()})</span>
                )}
                {t.customCount > 0 && <span className="text-faint"> · {t.customCount} on a different rate</span>}
              </p>
            )
          })()}
          <p className="text-xs text-faint mt-1">
            Billing your client is separate - that lives on{' '}
            <Link href={`/projects/${params.id}/${billingMode === 'aia' ? 'pay-apps' : 'payments'}`}
              className="text-accent-fg hover:underline">
              {billingMode === 'aia' ? 'Pay Apps' : 'Payments'}
            </Link>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pending.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-warn font-medium">
              <Clock className="h-4 w-4" />{pending.length} pending approval
            </span>
          )}
          {/* Drop the PDF the sub emailed. Reading it beats retyping it. */}
          <label
            onDragOver={e => { e.preventDefault(); setScanDrag(true) }}
            onDragLeave={() => setScanDrag(false)}
            onDrop={e => {
              e.preventDefault(); setScanDrag(false)
              const f = e.dataTransfer.files?.[0]
              if (f) scanInvoice(f)
            }}
            title="Drop a PDF, photo or screenshot of an invoice"
            className={cn('inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium cursor-pointer transition-colors',
              scanDrag ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:bg-surface',
              scanning && 'opacity-60 pointer-events-none')}>
            <input ref={scanRef} type="file" accept="application/pdf,image/*" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) scanInvoice(f); e.target.value = '' }} />
            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><ScanLine className="h-4 w-4" /> Scan an invoice</>}
          </label>
          <Button onClick={() => { setScanned(null); setShowForm(true) }}><Plus className="h-4 w-4" /> Create Invoice</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-12 px-6 text-center">
          <Receipt className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-ink">No invoices yet</p>
          <p className="text-sm text-muted-fg mt-1 max-w-md mx-auto">
            When a sub or supplier bills you, record it here. There are two ways in.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 max-w-xl mx-auto text-left">
            <label
              onDragOver={e => { e.preventDefault(); setScanDrag(true) }}
              onDragLeave={() => setScanDrag(false)}
              onDrop={e => {
                e.preventDefault(); setScanDrag(false)
                const f = e.dataTransfer.files?.[0]
                if (f) scanInvoice(f)
              }}
              className={cn('rounded-lg border p-4 cursor-pointer transition-colors',
                scanDrag ? 'border-accent bg-accent-tint' : 'border-line hover:bg-surface',
                scanning && 'opacity-60 pointer-events-none')}>
              <input type="file" accept="application/pdf,image/*" className="sr-only"
                onChange={e => { const f = e.target.files?.[0]; if (f) scanInvoice(f); e.target.value = '' }} />
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <ScanLine className="h-4 w-4 text-faint" /> Upload one they sent
              </p>
              <p className="text-xs text-muted-fg mt-1">
                Drop the PDF the sub emailed - a photo or screenshot works too - and it reads the
                document and fills the form in for you.
              </p>
            </label>
            <button type="button" onClick={() => { setScanned(null); setShowForm(true) }}
              className="rounded-lg border border-line p-4 text-left hover:bg-surface transition-colors">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Plus className="h-4 w-4 text-faint" /> Enter one yourself
              </p>
              <p className="text-xs text-muted-fg mt-1">
                Pick the sub and bill a flat amount, a percent of their contract, or a milestone off
                their payment schedule.
              </p>
            </button>
          </div>
          <p className="text-xs text-faint mt-5">
            Either way it lands on a budget line, and nothing is saved until you confirm it.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Pending Approval ({pending.length})</p>
              {pending.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Active ({active.length})</p>
              {active.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
          {paid.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Paid ({paid.length})</p>
              {paid.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

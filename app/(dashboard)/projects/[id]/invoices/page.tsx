'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, Receipt, CheckCircle2, Clock, DollarSign, ChevronRight, AlertTriangle, FileText, ScanLine, Loader2, Wallet, HelpCircle } from 'lucide-react'
import Link from 'next/link'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import type { SplitLineOption, AllocationRow } from '@/components/projects/invoice-split'
import { BudgetDestinationBox } from '@/components/projects/budget-destination'
import { ACTUAL_STATUSES, type BudgetDestination } from '@/lib/invoice-budget'
import type { QuoteCheck } from '@/lib/invoice-check'
import { markupTotals } from '@/lib/markup'
import type { InvoiceLine as InvoiceLineItem } from '@/lib/invoice-lines'
import { HARD_COST_CATEGORIES } from '@/lib/budget-categories'
import { contractAmount, contractAmountLabel, isUnpriced } from '@/lib/contract-amount'
import { formatDate } from '@/lib/dates'
import { toAmountInput } from '@/lib/validate'

import { LineEditor } from '@/components/invoices/line-editor'
import { SubBillDetail } from '@/components/invoices/sub-bill-detail'
import { CountdownText, Pill, type PillTone } from '@/components/bills/detail-parts'
import { dueCountdown } from '@/lib/bill-view'
import { useOpenRecord } from '@/lib/use-open-record'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
const STATUS_CONFIG: Record<string, { label: string; color: string; tone: PillTone }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-warn-tint border-warn/30 text-warn', tone: 'warn' },
  approved: { label: 'Approved', color: 'bg-info-tint border-info/30 text-info', tone: 'info' },
  // The sub sent this invoice TO you - it is a bill you owe, not something you
  // send them. "Sent for Payment" read as though it went somewhere, and the
  // first question everyone asked was "sent to who?". Nothing is sent: the
  // bill has been handed to bookkeeping or put in the next payment run, and
  // the money has not moved yet. The db value stays 'sent' - ACTUAL_STATUSES
  // depends on it, and renaming a column for a label is rewriting history.
  sent: { label: 'Queued for payment', color: 'bg-special-tint border-special/30 text-special', tone: 'special' },
  paid: { label: 'Paid', color: 'bg-success-tint border-success/30 text-success', tone: 'success' },
}

interface Subcontract { id: string; trade: string; contract_amount: number | null; company_id: string; companies?: { name: string } }
interface PaymentItem { id: string; subcontract_id: string; label: string; amount: number | null; percentage: number | null; status: string }
interface Invoice {
  id: string; invoice_number: string; company_name: string; company_id: string
  amount: number; description: string | null; status: string
  client_paid?: number; escrow_paid?: number
  approved_by_name: string | null; approved_at: string | null; sent_at: string | null
  due_date: string | null; created_at: string; subcontract_id: string | null
  payment_schedule_item_id: string | null; subcontracts?: { trade: string; contract_amount: number | null }
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
  /** How this bill divides across budget lines, when it does. */
  allocations?: { id: string; budget_line_item_id: string; amount: number; note: string | null }[]
}

// useOpenRecord reads `?open=` through useSearchParams, which needs a Suspense
// boundary at the route level - the same shape as the Change Orders page.
export default function InvoicesPage({ params }: { params: { id: string } }) {
  return <Suspense fallback={null}><InvoicesPageInner params={params} /></Suspense>
}

function InvoicesPageInner({ params }: { params: { id: string } }) {
  const notify = useNotice()
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
  const [budgetLines, setBudgetLines] = useState<SplitLineOption[]>([])
  /** Draft split per invoice, keyed by invoice id. */
  const [splits, setSplits] = useState<Record<string, AllocationRow[]>>({})
  const [savingSplit, setSavingSplit] = useState<string | null>(null)
  // On a cost-plus job the markup controls belong on every invoice regardless
  // of the default rate - otherwise a job billed line-by-line, with no project
  // rate set, had nowhere to mark up its first invoice at all.
  const costPlus = contractType === 'cost_plus'
  const [savingMarkup, setSavingMarkup] = useState<string | null>(null)
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  /**
   * ONE ROUTE, ONE FACT.
   *
   * This page used to load from two: `/invoices` for the list and
   * `/financials` for the subcontracts its create form picks from. Both were
   * `if (res.ok) { ... }` with no else, so a failed financials fetch left
   * `subcontracts` at `[]` and the picker held nothing but "Select
   * subcontractor..." with nothing saying why. #453 made that failure speak -
   * and what it said was the real bug: `/financials` is gated on the
   * `financials` resource, which a Project Manager is DELIBERATELY denied (the
   * same split that took `margin` out of `budget`). A PM has `invoices`, so
   * they are meant to be on this screen; half of it was asking a permission
   * their being here does not imply. The scan matched the sub correctly and
   * `setSubId` fired; the picker simply had no option with that id in it.
   *
   * The subs and the payment schedule now come from `/invoices`, which is
   * gated on what this page IS. One request, one failure, one reason.
   */
  const [loadError, setLoadError] = useState('')
  // The bill open as a screen of its own. It used to unfold inside the list;
  // in the URL now, so Back and a refresh both land where they should.
  const { id: openId, open: openBill, close: closeBill } = useOpenRecord()
  // "How this works", reopened by hand. See showExplainer below.
  const [explainerOpen, setExplainerOpen] = useState(false)
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
  // Tax as an editable string, because it is now a field somebody types into
  // rather than a value only the scanner could write.
  const [taxInput, setTaxInput] = useState('')
  const [editLines, setEditLines] = useState<InvoiceLineItem[]>([])
  const [editTax, setEditTax] = useState('')

  // Subs in the company Directory who are NOT yet on this project. The picker
  // offered project subcontracts only, so a sub you already have on file was
  // invisible mid-bill and the only way forward was to leave the form.
  const [directorySubs, setDirectorySubs] = useState<{ id: string; name: string; trade: string | null }[]>([])
  const [attaching, setAttaching] = useState(false)

  /**
   * Put a directory sub on this project and return the new subcontract id.
   *
   * The route already knew how to do this - it has taken `existing_company_id`
   * since it was written. It was simply gated on `team: edit` while this form
   * needs `invoices: edit`, so a bookkeeper entering a bill hit a wall the
   * moment a sub was not yet attached. The gate now depends on which branch is
   * being used: attaching someone you already have is part of entering a bill;
   * creating a new company in the Directory is not.
   *
   * The subcontract is created with NO agreed amount, which migration 082 made
   * possible on purpose - "not agreed yet, never write 0".
   */
  async function attachDirectorySub(companyId: string): Promise<string | null> {
    const c = directorySubs.find(x => x.id === companyId)
    setAttaching(true)
    try {
      const token = await getToken()
      const fd = new FormData()
      fd.append('existing_company_id', companyId)
      fd.append('trade', c?.trade || 'General')
      fd.append('scope', 'Added while entering a bill')
      const res = await fetch(`/api/projects/${params.id}/subcontracts`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd,
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCreateError(d?.error ?? `Could not add ${c?.name ?? 'that sub'} to this job.`)
        return null
      }
      await fetchData()
      return d?.subcontract?.id ?? null
    } catch {
      setCreateError('Could not reach the server - the sub was not added.')
      return null
    } finally {
      setAttaching(false)
    }
  }

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

  async function fetchDirectory() {
    try {
      const token = await getToken()
      const res = await fetch('/api/directory', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const d = await res.json()
      setDirectorySubs((d.companies ?? [])
        .filter((c: any) => c.type === 'subcontractor')
        .map((c: any) => ({ id: c.id, name: c.name, trade: c.trade ?? null })))
    } catch {
      // A directory we cannot read just means no extra options, not a broken form.
    }
  }

  /** The route's own reason, or a sentence naming the status. Never a shrug. */
  async function whyFailed(res: Response, what: string) {
    const d = await res.json().catch(() => null)
    const why = d?.error ?? `${what} could not be loaded (${res.status}).`
    // Read in the UI AND logged - otherwise the reason exists nowhere a person
    // looking into it afterwards can find.
    console.error(`[invoices] ${what}: ${why}`)
    return why
  }

  async function fetchData() {
    setLoadError('')
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/invoices`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { setLoadError(await whyFailed(res, 'This job\u2019s bills and subcontractors')); return }

      const d = await res.json()
      setInvoices(d.invoices)
      setDestinations(d.destinations ?? {})
      setBillingMode(d.billing_mode ?? 'simple')
      setProjectMarkup(Number(d.markup_pct) || 0)
      setContractType(d.contract_type ?? null)
      setBudgetLines(d.budget_lines ?? [])
      // Seed each editor from what is saved, so opening one shows the real
      // split rather than an empty form over the top of it.
      setSplits(Object.fromEntries((d.invoices ?? []).map((i: any) => [
        i.id, (i.allocations ?? []).map((a: any) => ({
          budget_line_item_id: a.budget_line_item_id, amount: toAmountInput(a.amount),
        })),
      ])))
      setSubcontracts((d.subcontracts ?? []).map((s: any) => ({
        id: s.id, trade: s.trade, contract_amount: Number(s.contract_amount) || 0,
        company_id: s.companies?.id ?? s.company_id, companies: s.companies,
      })))
      setPaymentItems(d.payment_schedule_items ?? [])
    } catch (e: any) {
      // A THROWN fetch never reached the `if`, so `setLoading(false)` as the
      // last statement was never reached either - the page said "Loading..."
      // for ever. finally, always.
      const why = e?.message ? `Could not reach SyteNav: ${e.message}` : 'Could not reach SyteNav.'
      console.error(`[invoices] load failed: ${why}`)
      setLoadError(why)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [params.id])

  // When sub is selected, pre-fill amount from payment schedule item if selected
  useEffect(() => {
    if (scheduleItemId) {
      const item = paymentItems.find(p => p.id === scheduleItemId)
      if (item?.amount) setAmount(toAmountInput(item.amount))
      if (item?.label) setDescription(item.label)
    }
  }, [scheduleItemId])

  // Directory subs minus anyone already on this job, so the same company is
  // never offered twice.
  const onJob = new Set(subcontracts.map(s => String((s as any).company_id ?? '')))
  const directoryOptions = directorySubs.filter(c => !onJob.has(c.id))

  /** Choosing a directory sub attaches them first, then selects the real id. */
  async function chooseSub(value: string) {
    if (!value.startsWith('dir:')) { setSubId(value); setScheduleItemId(''); return }
    setCreateError('')
    const id = await attachDirectorySub(value.slice(4))
    if (id) { setSubId(id); setScheduleItemId('') }
  }

  // Amount actually billed, based on the chosen mode
  const billedAmount = (() => {
    const sub = subcontracts.find(s => s.id === subId)
    // A percentage of an unpriced contract is not a number. contractAmount()
    // returns 0 for unknown, so this comes out 0 rather than NaN, and the UI
    // below hides percent billing for an unpriced sub entirely.
    if (billMode === 'percent') return sub ? Math.round((Number(percent) || 0) / 100 * contractAmount(sub.contract_amount) * 100) / 100 : 0
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
  // No agreed contract sum means no ceiling to bill against - see below.
  const subUnpriced = !!selectedSub && isUnpriced(selectedSub.contract_amount)
  const remaining = selectedSub ? Math.max(contractAmount(selectedSub.contract_amount) - alreadyInvoiced, 0) : 0
  // Nothing can be "over" a contract nobody has agreed yet. Without this guard
  // every invoice against an unpriced sub would be flagged as over-billing,
  // because remaining is 0.
  const overBilled = !!selectedSub && !subUnpriced && billedAmount > remaining + 0.005

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
      if (draft.amount != null) setAmount(toAmountInput(draft.amount))
      if (draft.description) setDescription(draft.description)
      if (draft.due_date) setDueDate(draft.due_date)
      setLineItems(Array.isArray(draft.line_items) ? draft.line_items : [])

      setTaxInput(draft.tax != null ? String(draft.tax) : '')
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
    // Name the ACTUAL fault. This said "Enter an amount or percent" for a
    // negative number, which sends somebody to check a field that is filled in
    // correctly. A message that describes the wrong problem is worse than no
    // message, because it costs time before it costs nothing.
    if (billedAmount < 0) { setCreateError('That is a negative amount. Enter a positive number.'); return }
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
          tax: taxInput === '' ? null : Number(taxInput),
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

  /** Save how one bill divides across budget lines. */
  async function saveSplit(invoice: Invoice) {
    setSavingSplit(invoice.id)
    try {
      const token = await getToken()
      const rows = (splits[invoice.id] ?? [])
        .filter(r => r.budget_line_item_id)
        .map(r => ({ budget_line_item_id: r.budget_line_item_id, amount: Number(r.amount) || 0 }))
      const res = await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ allocations: rows }),
      })
      if (!res.ok) {
        notify((await res.json().catch(() => ({}))).error ?? 'Could not save the split.')
        return
      }
      await fetchData()
    } finally {
      setSavingSplit(null)
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
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      })
      // The answer used to be thrown away: a refused change, or a QuickBooks
      // push or void that did not land, read exactly like success.
      const j = await res.json().catch(() => ({} as any))
      if (!res.ok) notify(j?.error ?? 'Could not change the bill.')
      else if (j?.quickbooks?.voided === false) {
        notify(`Marked unpaid here, but QuickBooks did not void the bill payment${j.quickbooks.detail ? `: ${j.quickbooks.detail}` : ''}. Settings -> Integrations -> Retry voids finishes it.`)
      }
    } catch (e) {
      notify(fetchProblem(e, 'changing the bill'))
    } finally {
      setUpdating(null); fetchData()
    }
  }

  function unpayBill(invoice: Invoice) {
    guardDelete(() => updateStatus(invoice, 'approved'), {
      title: 'Mark this bill unpaid?',
      body: 'It goes back to approved and owing. If it is in QuickBooks, the bill payment there is voided, so the bill shows open again.',
      confirmLabel: 'Mark unpaid',
    })
  }

  function openEditInvoice(invoice: Invoice) {
    setEditInvoice(invoice)
    setEditInvoiceNumber(invoice.invoice_number)
    setEditAmount(toAmountInput(invoice.amount))
    setEditNotes(invoice.description ?? '')
    setEditClientPaid(invoice.client_paid ? String(invoice.client_paid) : '')
    setEditEscrowPaid(invoice.escrow_paid ? String(invoice.escrow_paid) : '')
    setEditLines(Array.isArray(invoice.line_items) ? invoice.line_items : [])
    setEditTax(invoice.tax != null ? String(invoice.tax) : '')
  }

  async function handleEditInvoice(e: React.FormEvent) {
    e.preventDefault()
    if (!editInvoice) return
    setEditSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/invoices/${editInvoice.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        invoice_number: editInvoiceNumber,
        amount: parseFloat(editAmount),
        description: editNotes || null,
        client_paid: parseFloat(editClientPaid) || 0,
        escrow_paid: parseFloat(editEscrowPaid) || 0,
        // The PATCH route has accepted these since migration 072; only the
        // form never sent them, which is why fixing one wrong line meant
        // deleting the bill and re-scanning the document.
        line_items: editLines,
        tax: editTax === '' ? null : Number(editTax),
      }),
    })
    const j = await res.json().catch(() => ({}))
    setEditSaving(false)
    setEditInvoice(null)
    // Changing an amount on a bill already in QuickBooks usually follows
    // through. When it cannot - it is paid over there, or a bookkeeper re-split
    // it - the edit still saved here, and the two now disagree. That is exactly
    // the thing worth saying out loud rather than leaving to be found later.
    if (j.quickbooks && !j.quickbooks.updated && j.quickbooks.detail) {
      notify(`Saved here, but QuickBooks still shows the old amount. ${j.quickbooks.detail}`)
    }
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
    // Deleting DOES reach into QuickBooks now - the bill is voided there, and
    // the payment first if one was recorded. Say so: voiding somebody's books
    // is not a surprise anyone should get afterwards.
    // The confirm reads "Are you sure you want to delete <label>?", so this
    // stays a noun phrase with no closing punctuation.
    const qb = invoice.qbo_id ? ' - the bill (and any payment against it) comes out of QuickBooks with it' : ''
    const label = counted
      ? `this ${STATUS_CONFIG[invoice.status]?.label.toLowerCase() ?? ''} invoice (${amount}${who}) - it takes ${amount} back off the budget${line}${qb}`
      : `this invoice (${amount}${who})${qb}`
    guardDelete(async () => {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const j = await res.json().catch(() => ({}))
      if (res.ok && openId === invoice.id) closeBill()
      if (!res.ok) {
        notify(j.error ?? 'Could not delete that invoice')
      } else if (j.quickbooks && !j.quickbooks.voided) {
        // The bill is gone here either way. If QuickBooks did not follow, the
        // payable is still standing over there and only a person can clear it.
        notify(`Deleted here, but QuickBooks could not be updated${j.quickbooks.detail ? `: ${j.quickbooks.detail}` : ''}. The bill is still open in QuickBooks and has to be voided there.`)
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
  // The explainer shows on a job with no bills yet (the first visit), and
  // whenever somebody asks for it. While loading it shows nothing rather than
  // flashing open and then folding when the bills land.
  const showExplainer = explainerOpen || (!loading && !loadError && invoices.length === 0)
  const active = invoices.filter(i => i.status === 'approved' || i.status === 'sent')
  const paid = invoices.filter(i => i.status === 'paid')

  // A group of bills is ONE card of divided rows on the phone; on a desktop
  // the wrapper vanishes and each bill keeps its own card.
  // The open bill, once the list has it. An id the list does not hold (a
  // deleted bill, a stale link) shows the list rather than a blank screen.
  const shownBill = openId ? invoices.find(i => i.id === openId) ?? null : null
  const shownSub = shownBill?.subcontract_id ? subcontracts.find(s => s.id === shownBill.subcontract_id) : undefined

  // A group of bills is ONE card of divided rows, phone and desktop alike -
  // the same list as Invoices to your client. (No row carries a menu, so the
  // clip that rounds the corners cannot cut one off.)
  const GROUP = 'divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-panel'

  return (
    <div className="p-0 lg:p-6 space-y-5">
      {editInvoice && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg overflow-y-auto">
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
                <LineEditor
                  lines={editLines}
                  onLines={setEditLines}
                  tax={editTax}
                  onTax={setEditTax}
                  retainage={editInvoice.retainage ?? null}
                  amount={parseFloat(editAmount) || null}
                />
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
                    return <p className="text-xs text-muted-fg">Left to pay on this bill: <span className={out > 0 ? 'font-semibold text-warn' : 'font-semibold text-success'}>${Math.max(out, 0).toLocaleString()}</span></p>
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
        <div className="overlay items-center justify-center bg-black/50" data-overlay>
          <div className="bg-panel rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg overflow-y-auto">
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
                            <span className="font-medium">{f.description}</span> - billed ${Number(f.invoiced).toLocaleString()},
                            quoted ${Number(f.quoted).toLocaleString()} (${Math.round(f.over ?? 0).toLocaleString()} more)
                          </>
                        ) : (
                          <>
                            <span className="font-medium">{f.description}</span> - ${Number(f.invoiced).toLocaleString()},
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
                  {/* The page banner is above the fold and this form opens over
                      it, so the one place you find out has to be the field
                      itself - an empty picker with no explanation is
                      indistinguishable from a job with no subs on it. */}
                  {loadError && (
                    <p className="text-xs text-danger">
                      The subcontractors on this job did not load, so this list is empty.{' '}
                      <button type="button" onClick={() => fetchData()} className="font-semibold underline underline-offset-2">
                        Try again
                      </button>
                    </p>
                  )}
                  <SearchableSelect value={subId} onChange={e => { chooseSub(e.target.value) }} required
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">Select subcontractor...</option>
                    {subcontracts.map(s => (
                      <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} - {s.trade}</option>
                    ))}
                    {/* Subs you already have on file who are not on this job
                        yet. Choosing one attaches them, so entering a bill
                        never dead-ends on "that sub exists, but not here". */}
                    {directoryOptions.length > 0 && (
                      <optgroup label="From your directory - not on this job yet">
                        {directoryOptions.map(c => (
                          <option key={c.id} value={`dir:${c.id}`}>
                            {c.name}{c.trade ? ` - ${c.trade}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </SearchableSelect>
                  {attaching && <p className="text-xs text-muted-fg">Adding them to this job…</p>}
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
                    {!selectedSub
                      ? <p className="text-xs text-faint">Select a subcontractor to compute the amount.</p>
                      : subUnpriced
                        ? <p className="text-xs text-warn">This subcontract has no agreed amount yet, so a percentage of it has nothing to work from. Set a Contract Amount on the Team tab, or switch to a flat amount.</p>
                        : overBilled
                          ? <p className="text-xs text-danger">= ${billedAmount.toLocaleString()}, over the ${remaining.toLocaleString()} still owed.</p>
                          : <p className="text-xs text-muted-fg">= <span className="font-semibold text-ink-soft">${billedAmount.toLocaleString()}</span> of {contractAmountLabel(selectedSub.contract_amount)} contract · ${remaining.toLocaleString()} still owed</p>}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label>Amount</Label>
                      {selectedSub && remaining > 0 && (
                        <button type="button" onClick={() => setAmount(toAmountInput(remaining))}
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
                      subUnpriced
                        ? <p className="text-xs text-muted-fg">No agreed contract amount on this subcontract yet, so there is no balance to check this against.{alreadyInvoiced > 0 ? ` $${alreadyInvoiced.toLocaleString()} invoiced so far.` : ''}</p>
                        : overBilled
                          ? <p className="text-xs text-danger">Over the ${remaining.toLocaleString()} still owed on this {contractAmountLabel(selectedSub.contract_amount)} contract.</p>
                          : <p className="text-xs text-muted-fg">${remaining.toLocaleString()} still owed of {contractAmountLabel(selectedSub.contract_amount)} contract{alreadyInvoiced > 0 ? ` (${'$'}${alreadyInvoiced.toLocaleString()} invoiced)` : ''}.</p>
                    )}
                  </div>
                )}

                {/* The breakdown. Scanned invoices arrive with it filled in;
                    typed ones can have it too, because "what am I paying for?"
                    is the same question either way. */}
                <LineEditor
                  lines={lineItems}
                  onLines={setLineItems}
                  tax={taxInput}
                  onTax={setTaxInput}
                  retainage={scanned?.retainage ?? null}
                  amount={billedAmount}
                />

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
                <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                  <Button type="submit" disabled={submitting || overBilled}>{submitting ? 'Creating...' : 'Create Invoice'}</Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {shownBill ? (
        <SubBillDetail
          projectId={params.id}
          invoice={shownBill}
          status={STATUS_CONFIG[shownBill.status] ?? STATUS_CONFIG.pending_approval}
          // Cost-plus always gets the markup controls; otherwise only once a
          // rate is in use, so a fixed-price job never sees them.
          showMarkup={costPlus || projectMarkup > 0 || shownBill.markup_pct != null || !!shownBill.markup_excluded}
          projectMarkup={projectMarkup}
          canBillClient={billingMode !== 'aia' && ACTUAL_STATUSES.has(shownBill.status)}
          busy={updating === shownBill.id}
          onStatus={next => updateStatus(shownBill, next)}
          savingMarkup={savingMarkup === shownBill.id}
          onMarkup={patch => saveMarkup(shownBill, patch)}
          onCreateLine={shownSub ? () => createBudgetLine(shownSub) : undefined}
          creatingLine={creatingLineFor === shownBill.subcontract_id}
          budgetLines={budgetLines}
          split={splits[shownBill.id] ?? []}
          onSplit={rows => setSplits(prev => ({ ...prev, [shownBill.id]: rows }))}
          onSaveSplit={() => saveSplit(shownBill)}
          savingSplit={savingSplit === shownBill.id}
          uploadingDoc={uploadingDoc === shownBill.id}
          onUploadDoc={f => handleInvoiceDocUpload(shownBill, f)}
          uploadingWaiver={uploadingWaiver === shownBill.id}
          onUploadWaiver={(type, f) => handleLienWaiverUpload(shownBill, type, f)}
          onEdit={() => openEditInvoice(shownBill)}
          onUnpay={() => unpayBill(shownBill)}
          onDelete={() => handleDeleteInvoice(shownBill)}
          onBack={closeBill}
        />
      ) : (
      <>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">Bills from subs</h1>
          {/* THE EXPLAINER IS FOR THE FIRST VISIT. Once this job has a bill,
              whoever is here has used the page, and four lines of "what this
              is" above the buttons every time after that pushes the bills
              themselves down a screen on a phone. It folds to one quiet
              "How this works" link - derived from the bills, not remembered
              in the browser, so it is the same answer on every device. */}
          {showExplainer ? (
          <>
          {/* Says whose bills these are and what to do with them. "Send" used
              to be in here, which read as if you invoiced the sub. */}
          <p className="text-sm text-muted-fg mt-0.5">
            Bills your subs and suppliers sent <span className="font-medium text-ink-soft">you</span> - upload one they
            emailed, or enter it yourself, then approve and pay.
          </p>
          <p className="text-xs text-faint mt-1">
            Billing your client is separate - that lives on{' '}
            <Link href={`/projects/${params.id}/${billingMode === 'aia' ? 'pay-apps' : 'payments'}`}
              className="text-accent-fg hover:underline">
              {billingMode === 'aia' ? 'Pay Apps' : 'Billing the client'}
            </Link>.
          </p>
          {explainerOpen && (
            <button type="button" onClick={() => setExplainerOpen(false)}
              className="mt-1 inline-flex min-h-11 items-center text-xs font-medium text-accent-fg hover:underline lg:min-h-0">
              Hide
            </button>
          )}
          </>
          ) : !loading && (
            <button type="button" onClick={() => setExplainerOpen(true)}
              className="mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-accent-fg hover:underline lg:min-h-0">
              <HelpCircle className="h-4 w-4" /> How this works
            </button>
          )}
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
            className={cn('inline-flex h-11 items-center gap-2 rounded-[10px] border px-4 text-sm font-medium cursor-pointer transition-colors',
              scanDrag ? 'border-accent bg-accent-tint text-accent-fg' : 'border-muted2 bg-panel text-ink-soft hover:bg-surface',
              scanning && 'opacity-60 pointer-events-none')}>
            <input ref={scanRef} type="file" accept="application/pdf,image/*" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) scanInvoice(f); e.target.value = '' }} />
            {scanning ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><ScanLine className="h-4 w-4" /> Scan an invoice</>}
          </label>
          <Button size="lg" className="h-11 rounded-[10px] px-5" onClick={() => { setScanned(null); setShowForm(true) }}><Plus className="h-4 w-4" /> Create Invoice</Button>
        </div>
      </div>

      {/* Said once, at the top. A page that renders its empty state over a
          failed load is asserting something it does not know. */}
      {loadError && (
        <div className="rounded-lg border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 space-y-1">
              <p>{loadError}</p>
              <button type="button" onClick={() => { setLoading(true); fetchData() }}
                className="font-semibold underline underline-offset-2">Try again</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : invoices.length === 0 && loadError ? (
        /* NOT the empty state. "No invoices yet" over a failed fetch is the app
           telling somebody their job has no bills on it, which it does not
           know. Nothing here - the banner above has already said what happened.
           Ordered this way round on purpose: a refresh that fails AFTER a good
           load still shows the invoices already on screen, because taking them
           away would be a second wrong answer on top of the first. */
        null
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
              <div className={GROUP}>{pending.map(i => <BillRow key={i.id} invoice={i} onOpen={() => openBill(i.id)} />)}</div>
            </div>
          )}
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Active ({active.length})</p>
              <div className={GROUP}>{active.map(i => <BillRow key={i.id} invoice={i} onOpen={() => openBill(i.id)} />)}</div>
            </div>
          )}
          {paid.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-faint uppercase tracking-wide">Paid ({paid.length})</p>
              <div className={GROUP}>{paid.map(i => <BillRow key={i.id} invoice={i} onOpen={() => openBill(i.id)} />)}</div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  )
}

/**
 * One bill in the list. Opens the bill as a screen of its own.
 *
 * PHONE: a row in the group's one card - no icon column, no tint, the card
 * border lives on the group. DESKTOP (lg+): the bordered card it was.
 */
function BillRow({ invoice, onOpen }: { invoice: Invoice; onOpen: () => void }) {
  const cfg = STATUS_CONFIG[invoice.status] ?? STATUS_CONFIG.pending_approval
  // The same answer the bill's own screen gives - "in 7 days", "3 days
  // overdue" - so the list says what is urgent without opening anything.
  const countdown = invoice.status === 'paid' ? null : dueCountdown(invoice.due_date)
  return (
    <button type="button" onClick={onOpen}
      className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-surface lg:gap-4 lg:px-6 lg:py-4">
      <Receipt className="hidden h-5 w-5 text-faint shrink-0 lg:block" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="break-words text-[15px] font-semibold text-ink">{invoice.company_name}</span>
          <Pill tone={cfg.tone}>{cfg.label}</Pill>
          {/* Which line it hits, readable without opening the bill. */}
          {invoice.budget_line ? (
            <span className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-fg">
              <Wallet className="h-3 w-3 shrink-0" />
              <span className="truncate">{invoice.budget_line.category}</span>
            </span>
          ) : invoice.subcontract_id ? (
            <Pill tone="warn" icon={<AlertTriangle className="h-3 w-3" />}>Not on the budget</Pill>
          ) : null}
        </div>
        <p className="mt-0.5 break-words text-xs text-muted-fg tabular-nums">
          {invoice.invoice_number}
          {invoice.description && ` · ${invoice.description}`}
          {invoice.due_date && ` · Due ${formatDate(invoice.due_date)}`}
          {countdown && <> · <CountdownText countdown={countdown} /></>}
        </p>
      </div>
      <div className="shrink-0 text-[15px] font-bold tabular-nums text-ink">${Number(invoice.amount).toLocaleString()}</div>
      <ChevronRight className="h-4 w-4 shrink-0 text-faint" />
    </button>
  )
}

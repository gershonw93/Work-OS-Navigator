'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, Receipt, CheckCircle2, Clock, Send, DollarSign, ChevronDown, ChevronUp, Printer, Upload, AlertTriangle, Pencil, Trash2, FileText } from 'lucide-react'
import Link from 'next/link'
import { useDeleteGuard } from '@/components/ui/delete-guard'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-warn-tint border-warn/30 text-warn' },
  approved: { label: 'Approved', color: 'bg-info-tint border-info/30 text-info' },
  sent: { label: 'Sent to Sub', color: 'bg-special-tint border-special/30 text-special' },
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
}

export default function InvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const [invoices, setInvoices] = useState<Invoice[]>([])
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
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setCreateError(j.error || `Could not create invoice (${res.status}). If this persists, run the invoices migration (023).`)
        setSubmitting(false)
        return
      }
      setSubId(''); setScheduleItemId(''); setAmount(''); setPercent(''); setDescription(''); setDueDate('')
      setShowForm(false); setSubmitting(false); fetchData()
    } catch (err: any) {
      setCreateError(err?.message ? `Failed: ${err.message}` : 'Failed — check your connection.')
      setSubmitting(false)
    }
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
    guardDelete(async () => {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}/invoices/${invoice.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchData()
    }, { label: 'this invoice', protected: true })
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
              {invoice.sent_at && <div><p className="text-xs text-faint">Sent</p><p className="font-medium text-ink-soft">{new Date(invoice.sent_at).toLocaleDateString()}</p></div>}
            </div>
            {invoice.description && <p className="text-sm text-muted-fg break-words">{invoice.description}</p>}

            {/* Vendor's invoice file — the sub has no account, so the GC attaches it here */}
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
                  <span>Payment released — unconditional lien waiver required</span>
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
                <Button size="sm" disabled={updating === invoice.id} onClick={() => updateStatus(invoice, 'sent')}>
                  <Send className="h-3.5 w-3.5" />{updating === invoice.id ? '...' : 'Mark Sent to Sub'}
                </Button>
              )}
              {invoice.status === 'sent' && (
                <Button size="sm" variant="outline" disabled={updating === invoice.id} onClick={() => updateStatus(invoice, 'paid')}>
                  <DollarSign className="h-3.5 w-3.5" />{updating === invoice.id ? '...' : 'Mark Paid'}
                </Button>
              )}
              <button onClick={() => openEditInvoice(invoice)}
                className="p-1.5 text-faint hover:text-muted-fg rounded transition-colors" title="Edit invoice">
                <Pencil className="h-4 w-4" />
              </button>
              {(invoice.status === 'pending_approval' || invoice.status === 'approved') && (
                <button onClick={() => handleDeleteInvoice(invoice)}
                  className="p-1.5 text-faint hover:text-danger rounded transition-colors" title="Delete invoice">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
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
              <h2 className="font-semibold text-ink">Create Invoice</h2>
              <button onClick={() => setShowForm(false)} className="text-faint hover:text-muted-fg"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Subcontractor</Label>
                  <SearchableSelect value={subId} onChange={e => { setSubId(e.target.value); setScheduleItemId('') }} required
                    className="w-full rounded-md border border-muted2 px-3 py-2 text-sm bg-panel focus:border-accent focus:outline-none">
                    <option value="">Select subcontractor...</option>
                    {subcontracts.map(s => (
                      <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} — {s.trade}</option>
                    ))}
                  </SearchableSelect>
                </div>

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
                            <option key={p.id} value={p.id}>{p.label}{p.amount ? ` — $${Number(p.amount).toLocaleString()}` : p.percentage ? ` — ${p.percentage}%` : ''}</option>
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

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input placeholder="e.g. Rough electrical complete — 40%" value={description} onChange={e => setDescription(e.target.value)} />
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
          <h1 className="text-2xl font-bold text-ink">Invoices</h1>
          <p className="text-sm text-muted-fg mt-0.5">Subcontractor invoices — approve, send, and track payments.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pending.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-warn font-medium">
              <Clock className="h-4 w-4" />{pending.length} pending approval
            </span>
          )}
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Create Invoice</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-faint py-12 text-center">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-line py-16 text-center">
          <Receipt className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-fg">No invoices yet</p>
          <p className="text-xs text-faint mt-1">Create invoices from payment schedule milestones or manually.</p>
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

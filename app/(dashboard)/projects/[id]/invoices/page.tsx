'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Plus, X, Receipt, CheckCircle2, Clock, Send, DollarSign, ChevronDown, ChevronUp, Printer, Upload, AlertTriangle } from 'lucide-react'
import Link from 'next/link'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending_approval: { label: 'Pending Approval', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  approved: { label: 'Approved', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  sent: { label: 'Sent to Sub', color: 'bg-purple-50 border-purple-200 text-purple-700' },
  paid: { label: 'Paid', color: 'bg-green-50 border-green-200 text-green-700' },
}

interface Subcontract { id: string; trade: string; contract_amount: number; company_id: string; companies?: { name: string } }
interface PaymentItem { id: string; subcontract_id: string; label: string; amount: number | null; percentage: number | null; status: string }
interface Invoice {
  id: string; invoice_number: string; company_name: string; company_id: string
  amount: number; description: string | null; status: string
  approved_by_name: string | null; approved_at: string | null; sent_at: string | null
  due_date: string | null; created_at: string; subcontract_id: string | null
  payment_schedule_item_id: string | null; subcontracts?: { trade: string; contract_amount: number }
  lien_waiver_url: string | null; lien_waiver_type: string | null; lien_waiver_uploaded_at: string | null
}

export default function InvoicesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])
  const [paymentItems, setPaymentItems] = useState<PaymentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [updating, setUpdating] = useState<string | null>(null)
  const [uploadingWaiver, setUploadingWaiver] = useState<string | null>(null)
  const conditionalInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const unconditionalInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Form
  const [subId, setSubId] = useState('')
  const [scheduleItemId, setScheduleItemId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState('')

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    const token = await getToken()
    const [invRes, subRes] = await Promise.all([
      fetch(`/api/projects/${params.id}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/projects/${params.id}/tasks`, { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (invRes.ok) {
      const d = await invRes.json()
      setInvoices(d.invoices)
    }
    if (subRes.ok) {
      const d = await subRes.json()
      setSubcontracts(d.subcontracts ?? [])
      setPaymentItems(d.paymentItems ?? [])
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    const token = await getToken()
    const sub = subcontracts.find(s => s.id === subId)
    await fetch(`/api/projects/${params.id}/invoices`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        subcontract_id: subId || null,
        payment_schedule_item_id: scheduleItemId || null,
        company_id: sub?.company_id,
        company_name: (sub?.companies as any)?.name ?? sub?.trade,
        amount: parseFloat(amount),
        description: description || null,
        due_date: dueDate || null,
      }),
    })
    setSubId(''); setScheduleItemId(''); setAmount(''); setDescription(''); setDueDate('')
    setShowForm(false); setSubmitting(false); fetchData()
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
      <div className={cn('rounded-xl border bg-white overflow-hidden', invoice.status === 'pending_approval' ? 'border-amber-200' : 'border-slate-200')}>
        <button className="w-full flex items-center gap-4 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
          onClick={() => setExpanded(isExpanded ? null : invoice.id)}>
          <Receipt className="h-5 w-5 text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono text-slate-500">{invoice.invoice_number}</span>
              <span className="font-semibold text-slate-900 break-words">{invoice.company_name}</span>
              <span className={cn('text-xs font-medium rounded-full border px-2 py-0.5', cfg.color)}>{cfg.label}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 break-words">
              ${Number(invoice.amount).toLocaleString()}
              {invoice.description && ` · ${invoice.description}`}
              {invoice.due_date && ` · Due ${new Date(invoice.due_date).toLocaleDateString()}`}
            </p>
          </div>
          <div className="hidden sm:block text-sm font-bold text-slate-900 shrink-0">${Number(invoice.amount).toLocaleString()}</div>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />}
        </button>

        {isExpanded && (
          <div className="border-t border-slate-100 px-5 py-5 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><p className="text-xs text-slate-400">Invoice #</p><p className="font-mono font-medium text-slate-700">{invoice.invoice_number}</p></div>
              <div><p className="text-xs text-slate-400">Amount</p><p className="font-bold text-slate-900">${Number(invoice.amount).toLocaleString()}</p></div>
              {invoice.due_date && <div><p className="text-xs text-slate-400">Due Date</p><p className="font-medium text-slate-700">{new Date(invoice.due_date).toLocaleDateString()}</p></div>}
              <div><p className="text-xs text-slate-400">Created</p><p className="font-medium text-slate-700">{new Date(invoice.created_at).toLocaleDateString()}</p></div>
              {invoice.approved_by_name && <div><p className="text-xs text-slate-400">Approved By</p><p className="font-medium text-slate-700">{invoice.approved_by_name}</p></div>}
              {invoice.approved_at && <div><p className="text-xs text-slate-400">Approved</p><p className="font-medium text-slate-700">{new Date(invoice.approved_at).toLocaleDateString()}</p></div>}
              {invoice.sent_at && <div><p className="text-xs text-slate-400">Sent</p><p className="font-medium text-slate-700">{new Date(invoice.sent_at).toLocaleDateString()}</p></div>}
            </div>
            {invoice.description && <p className="text-sm text-slate-600 break-words">{invoice.description}</p>}

            {/* Lien Waiver Section */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Lien Waiver</p>

              {invoice.status === 'paid' && !invoice.lien_waiver_url && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Payment released — unconditional lien waiver required</span>
                </div>
              )}

              {invoice.lien_waiver_url ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-medium px-3 py-1">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {invoice.lien_waiver_type === 'conditional' ? 'Conditional' : 'Unconditional'} Lien Waiver
                  </span>
                  {invoice.lien_waiver_uploaded_at && (
                    <span className="text-xs text-slate-400">
                      Uploaded {new Date(invoice.lien_waiver_uploaded_at).toLocaleDateString()}
                    </span>
                  )}
                  <a
                    href={invoice.lien_waiver_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-medium text-orange-500 hover:text-orange-600 underline underline-offset-2"
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
                    className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-orange-400 transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 text-slate-400" />
                    {uploadingWaiver === invoice.id ? 'Uploading...' : 'Upload Conditional Waiver'}
                  </button>
                  <button
                    type="button"
                    disabled={uploadingWaiver === invoice.id}
                    onClick={() => unconditionalInputRefs.current[invoice.id]?.click()}
                    className="flex items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-orange-400 transition-colors disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4 text-slate-400" />
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
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full min-w-0 max-w-full sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Create Invoice</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="px-4 sm:px-6 py-5 pb-4 space-y-4">
                <div className="space-y-1.5">
                  <Label>Subcontractor</Label>
                  <select value={subId} onChange={e => { setSubId(e.target.value); setScheduleItemId('') }} required
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                    <option value="">Select subcontractor...</option>
                    {subcontracts.map(s => (
                      <option key={s.id} value={s.id}>{(s.companies as any)?.name ?? s.trade} — {s.trade}</option>
                    ))}
                  </select>
                </div>

                {subId && subPaymentItems.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Payment Schedule Item <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <select value={scheduleItemId} onChange={e => setScheduleItemId(e.target.value)}
                      className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm bg-white focus:border-orange-500 focus:outline-none">
                      <option value="">Select milestone...</option>
                      {subPaymentItems.map(p => (
                        <option key={p.id} value={p.id}>{p.label}{p.amount ? ` — $${Number(p.amount).toLocaleString()}` : p.percentage ? ` — ${p.percentage}%` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Amount</Label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input type="number" step="0.01" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} required className="pl-8" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Input placeholder="e.g. Rough electrical complete — 40%" value={description} onChange={e => setDescription(e.target.value)} />
                </div>

                <div className="space-y-1.5">
                  <Label>Due Date <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting}>{submitting ? 'Creating...' : 'Create Invoice'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invoices</h1>
          <p className="text-sm text-slate-500 mt-0.5">Subcontractor invoices — approve, send, and track payments.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {pending.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm text-amber-600 font-medium">
              <Clock className="h-4 w-4" />{pending.length} pending approval
            </span>
          )}
          <Button onClick={() => setShowForm(true)}><Plus className="h-4 w-4" /> Create Invoice</Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : invoices.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-slate-200 py-16 text-center">
          <Receipt className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No invoices yet</p>
          <p className="text-xs text-slate-400 mt-1">Create invoices from payment schedule milestones or manually.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pending.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Pending Approval ({pending.length})</p>
              {pending.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
          {active.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Active ({active.length})</p>
              {active.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
          {paid.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Paid ({paid.length})</p>
              {paid.map(i => <InvoiceCard key={i.id} invoice={i} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Printer, FileText, ShieldCheck, DollarSign } from 'lucide-react'

interface Invoice {
  id: string
  invoice_number: string | null
  amount: number
  status: string
  subcontractor_name: string | null
  company_name: string | null
  created_at: string
}

interface ComplianceDoc {
  id: string
  doc_type: string
  status: string
  expiry_date: string | null
  subcontractor_name: string | null
  company_name: string | null
}

interface Permit {
  id: string
  permit_type: string
  permit_number: string | null
  status: string
}

interface Inspection {
  id: string
  inspection_type: string
  status: string
}

interface Project {
  id: string
  name: string
  address: string | null
  status: string | null
  client_name: string | null
  contract_value: number | null
  updated_at: string | null
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-orange-500" />
      <h2 className="text-base font-semibold text-slate-800">{title}</h2>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    approved: 'bg-green-100 text-green-700',
    issued: 'bg-green-100 text-green-700',
    paid: 'bg-green-100 text-green-700',
    passed: 'bg-green-100 text-green-700',
    planning: 'bg-blue-100 text-blue-700',
    submitted: 'bg-blue-100 text-blue-700',
    scheduled: 'bg-blue-100 text-blue-700',
    pending: 'bg-yellow-100 text-yellow-700',
    on_hold: 'bg-yellow-100 text-yellow-700',
    expired: 'bg-red-100 text-red-600',
    rejected: 'bg-red-100 text-red-600',
    failed: 'bg-red-100 text-red-600',
    missing: 'bg-red-100 text-red-600',
    not_started: 'bg-slate-100 text-slate-500',
    draft: 'bg-slate-100 text-slate-500',
    closed: 'bg-slate-100 text-slate-500',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-600',
  }
  const cls = map[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function fmt(n: number) {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })
}

export default function ReportsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [project, setProject] = useState<Project | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [compliance, setCompliance] = useState<ComplianceDoc[]>([])
  const [permits, setPermits] = useState<Permit[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const headers = { Authorization: `Bearer ${token}` }

      const [projRes, invRes, compRes, permRes, inspRes] = await Promise.all([
        fetch(`/api/projects/${params.id}`, { headers }),
        fetch(`/api/projects/${params.id}/invoices`, { headers }),
        fetch(`/api/projects/${params.id}/compliance`, { headers }),
        fetch(`/api/projects/${params.id}/permits`, { headers }),
        fetch(`/api/projects/${params.id}/inspections`, { headers }),
      ])

      if (projRes.ok) {
        const d = await projRes.json()
        setProject(d.project ?? d)
      }
      if (invRes.ok) {
        const d = await invRes.json()
        setInvoices(d.invoices ?? [])
      }
      if (compRes.ok) {
        const d = await compRes.json()
        setCompliance(d.documents ?? d.compliance ?? [])
      }
      if (permRes.ok) {
        const d = await permRes.json()
        setPermits(d.permits ?? [])
      }
      if (inspRes.ok) {
        const d = await inspRes.json()
        setInspections(d.inspections ?? [])
      }

      setLoading(false)
    }
    load()
  }, [params.id])

  // Payment report grouping
  const invoicesBySub: Record<string, Invoice[]> = {}
  for (const inv of invoices) {
    const key = inv.subcontractor_name ?? inv.company_name ?? 'Unknown'
    if (!invoicesBySub[key]) invoicesBySub[key] = []
    invoicesBySub[key].push(inv)
  }

  // Compliance grouping
  const complianceBySub: Record<string, ComplianceDoc[]> = {}
  for (const doc of compliance) {
    const key = doc.subcontractor_name ?? doc.company_name ?? 'Unknown'
    if (!complianceBySub[key]) complianceBySub[key] = []
    complianceBySub[key].push(doc)
  }

  const permitIssued = permits.filter(p => p.status === 'issued').length
  const permitPending = permits.filter(p => !['issued', 'closed'].includes(p.status)).length
  const inspPassed = inspections.filter(i => i.status === 'passed').length
  const inspFailed = inspections.filter(i => i.status === 'failed').length

  const totalInvoiced = invoices.reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid

  const today = new Date()
  const hasExpiredOrMissing = (docs: ComplianceDoc[]) =>
    docs.some(d => d.status === 'expired' || d.status === 'missing' || (d.expiry_date && new Date(d.expiry_date) < today))

  return (
    <>
      <style>{`
        @media print {
          [data-sidebar], nav[aria-label="Sidebar"], aside,
          [data-topnav], header.top-nav,
          [data-project-tabs], [data-tabs],
          .no-print, button { display: none !important; }
          body { background: white !important; }
          .print-card { break-inside: avoid; }
        }
      `}</style>

      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
            <p className="text-sm text-slate-500 mt-0.5">Project summary, payments, and compliance.</p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-slate-400 py-16 text-center">Loading reports…</div>
        ) : (
          <div className="space-y-6">

            {/* Project Summary */}
            <div className="print-card bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <SectionHeader icon={FileText} title="Project Summary" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Project</p>
                  <p className="text-sm font-semibold text-slate-800">{project?.name ?? '—'}</p>
                  {project?.address && <p className="text-xs text-slate-500 mt-0.5">{project.address}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Client</p>
                  <p className="text-sm font-semibold text-slate-800">{project?.client_name ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Status</p>
                  {project?.status ? <StatusBadge status={project.status} /> : <span className="text-sm text-slate-400">—</span>}
                </div>
                {project?.contract_value != null && (
                  <div>
                    <p className="text-xs text-slate-400 uppercase tracking-wide mb-1">Contract Value</p>
                    <p className="text-sm font-semibold text-slate-800">{fmt(project.contract_value)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-slate-100 pt-4 mt-2">
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{permitIssued}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Permits Issued</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                  <p className="text-xl font-bold text-yellow-600">{permitPending}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Permits Pending</p>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 text-center">
                  <p className="text-xl font-bold text-green-600">{inspPassed}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Inspections Passed</p>
                </div>
                <div className={cn('rounded-lg border p-3 text-center', inspFailed > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100')}>
                  <p className={cn('text-xl font-bold', inspFailed > 0 ? 'text-red-600' : 'text-slate-400')}>{inspFailed}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Inspections Failed</p>
                </div>
              </div>

              <div className="flex justify-end mt-4 no-print">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print this section
                </button>
              </div>
            </div>

            {/* Payment Report */}
            <div className="print-card bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <SectionHeader icon={DollarSign} title="Payment Report" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                  <p className="text-xs text-slate-400 mb-1">Total Invoiced</p>
                  <p className="text-lg font-bold text-slate-800">{fmt(totalInvoiced)}</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-100 p-3">
                  <p className="text-xs text-slate-400 mb-1">Total Paid</p>
                  <p className="text-lg font-bold text-green-700">{fmt(totalPaid)}</p>
                </div>
                <div className={cn('rounded-lg border p-3', totalOutstanding > 0 ? 'bg-orange-50 border-orange-100' : 'bg-slate-50 border-slate-100')}>
                  <p className="text-xs text-slate-400 mb-1">Outstanding</p>
                  <p className={cn('text-lg font-bold', totalOutstanding > 0 ? 'text-orange-600' : 'text-slate-400')}>{fmt(totalOutstanding)}</p>
                </div>
              </div>

              {Object.keys(invoicesBySub).length === 0 ? (
                <p className="text-sm text-slate-400">No invoices on record.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(invoicesBySub).map(([sub, invs]) => {
                    const subTotal = invs.reduce((s, i) => s + (i.amount ?? 0), 0)
                    const subPaid = invs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
                    const subOut = subTotal - subPaid
                    return (
                      <div key={sub} className="border border-slate-100 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-700">{sub}</span>
                          <div className="flex gap-4 text-xs text-slate-500">
                            <span>Total: <span className="font-semibold text-slate-700">{fmt(subTotal)}</span></span>
                            <span>Paid: <span className="font-semibold text-green-700">{fmt(subPaid)}</span></span>
                            {subOut > 0 && <span>Outstanding: <span className="font-semibold text-orange-600">{fmt(subOut)}</span></span>}
                          </div>
                        </div>
                        <div className="divide-y divide-slate-50">
                          {invs.map(inv => (
                            <div key={inv.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm text-slate-600">
                                {inv.invoice_number ? `Invoice #${inv.invoice_number}` : 'Invoice'}
                                <span className="text-slate-400 ml-2 text-xs">
                                  {new Date(inv.created_at).toLocaleDateString()}
                                </span>
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-slate-700">{fmt(inv.amount ?? 0)}</span>
                                <StatusBadge status={inv.status} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Compliance Report */}
            <div className="print-card bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
              <SectionHeader icon={ShieldCheck} title="Compliance Report" />

              {Object.keys(complianceBySub).length === 0 ? (
                <p className="text-sm text-slate-400">No compliance documents on record.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(complianceBySub).map(([sub, docs]) => {
                    const hasIssue = hasExpiredOrMissing(docs)
                    return (
                      <div key={sub} className={cn('border rounded-lg overflow-hidden', hasIssue ? 'border-red-200' : 'border-slate-100')}>
                        <div className={cn('px-4 py-2.5 flex flex-wrap items-center justify-between gap-2', hasIssue ? 'bg-red-50' : 'bg-slate-50')}>
                          <span className="text-sm font-semibold text-slate-700">{sub}</span>
                          {hasIssue && (
                            <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">Action required</span>
                          )}
                        </div>
                        <div className="divide-y divide-slate-50">
                          {docs.map(doc => {
                            const isExpired = doc.status === 'expired' || (doc.expiry_date && new Date(doc.expiry_date) < today)
                            const isMissing = doc.status === 'missing'
                            const rowBad = isExpired || isMissing
                            return (
                              <div key={doc.id} className={cn('px-4 py-2.5 flex flex-wrap items-center justify-between gap-2', rowBad ? 'bg-red-50/50' : '')}>
                                <div>
                                  <span className={cn('text-sm font-medium capitalize', rowBad ? 'text-red-700' : 'text-slate-700')}>
                                    {doc.doc_type.replace(/_/g, ' ')}
                                  </span>
                                  {doc.expiry_date && (
                                    <span className={cn('ml-2 text-xs', rowBad ? 'text-red-500' : 'text-slate-400')}>
                                      Expires {new Date(doc.expiry_date + 'T00:00:00').toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                <StatusBadge status={doc.status} />
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  )
}

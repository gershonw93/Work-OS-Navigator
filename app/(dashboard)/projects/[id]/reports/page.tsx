'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Printer, FileText, ShieldCheck, DollarSign } from 'lucide-react'
import { clientLabel } from '@/lib/project-access'

import { formatDate } from '@/lib/dates'
import { complianceReport, type ReportGroup } from '@/lib/compliance-report'
interface Invoice {
  id: string
  invoice_number: string | null
  amount: number
  status: string
  subcontractor_name: string | null
  company_name: string | null
  created_at: string
}

// The shape this used to declare - `doc_type`, `subcontractor_name`,
// `company_name` - described no table in the database. A compliance_documents
// row carries `type` and `company_id`; the NAME lives on the subcontracts array
// the same response sends. lib/compliance-report.ts puts the two together.

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

/**
 * The REAL columns, which is not what this used to say.
 *
 * It declared `client_name` and `contract_value`. Neither exists: the table
 * has `client` (free text) and `sellout_amount`, and the client's proper name
 * lives on the joined customer. Both read back undefined and rendered "-",
 * and TypeScript was satisfied throughout - an interface that lies about a row
 * shape turns the compiler into an alibi rather than a check. Exactly the
 * `data: null` trap CLAUDE.md warns about, one level up.
 */
interface Project {
  id: string
  name: string
  address: string | null
  status: string | null
  /** Free-text client on the project. The linked customer's name wins. */
  client: string | null
  customers?: { name: string | null } | null
  sellout_amount: number | null
  updated_at: string | null
}

function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className="h-5 w-5 text-accent-fg" />
      <h2 className="text-base font-semibold text-ink-soft">{title}</h2>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-success-tint text-success',
    approved: 'bg-success-tint text-success',
    issued: 'bg-success-tint text-success',
    paid: 'bg-success-tint text-success',
    passed: 'bg-success-tint text-success',
    planning: 'bg-info-tint text-info',
    submitted: 'bg-info-tint text-info',
    scheduled: 'bg-info-tint text-info',
    pending: 'bg-warn-tint text-warn',
    on_hold: 'bg-warn-tint text-warn',
    // The compliance tab's own colour for it. Missing from this map, it fell
    // through to grey - the one state that means "renew this now" printed as
    // quietly as "draft".
    expiring_soon: 'bg-accent-tint text-accent-fg',
    expired: 'bg-danger-tint text-danger',
    rejected: 'bg-danger-tint text-danger',
    failed: 'bg-danger-tint text-danger',
    missing: 'bg-danger-tint text-danger',
    not_started: 'bg-muted text-muted-fg',
    draft: 'bg-muted text-muted-fg',
    closed: 'bg-muted text-muted-fg',
    completed: 'bg-muted text-muted-fg',
    cancelled: 'bg-danger-tint text-danger',
  }
  const cls = map[status] ?? 'bg-muted text-muted-fg'
  return (
    <span className={cn('whitespace-nowrap inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>
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
  const [complianceGroups, setComplianceGroups] = useState<ReportGroup[]>([])
  const [permits, setPermits] = useState<Permit[]>([])
  const [inspections, setInspections] = useState<Inspection[]>([])
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const headers = { Authorization: `Bearer ${token}` }

      // Company logo for the printed header (best-effort, never blocks the page)
      supabase.from('projects').select('companies(logo_url)').eq('id', params.id).single()
        .then(({ data }) => setLogoUrl((data as any)?.companies?.logo_url ?? null))

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
        // THE BUG. This read `d.documents ?? d.compliance ?? []`, and the route
        // answers neither - it sends `{ subcontracts, docs, requirements }`. So
        // both were `undefined`, the `??` fell through to the empty array, and
        // "No compliance documents on record" printed on EVERY job for ever.
        // On an owner's or a lender's copy that is not a blank section, it is
        // an assertion that a sub is uninsured.
        const d = await compRes.json()
        setComplianceGroups(complianceReport({
          subcontracts: d.subcontracts, docs: d.docs, requirements: d.requirements,
          projectId: params.id,
        }))
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

  const permitIssued = permits.filter(p => p.status === 'issued').length
  const permitPending = permits.filter(p => !['issued', 'closed'].includes(p.status)).length
  const inspPassed = inspections.filter(i => i.status === 'passed').length
  const inspFailed = inspections.filter(i => i.status === 'failed').length

  const totalInvoiced = invoices.reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalOutstanding = totalInvoiced - totalPaid

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
          <div className="flex items-center gap-4">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="Company logo" className="h-12 w-auto max-w-[140px] object-contain" />
            )}
            <div>
              <h1 className="text-2xl font-bold text-ink">Reports</h1>
              <p className="text-sm text-muted-fg mt-0.5">Project summary, payments, and compliance.</p>
            </div>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink hover:bg-accent transition-colors"
          >
            <Printer className="h-4 w-4" />
            Print / Save PDF
          </button>
        </div>

        {loading ? (
          <div className="text-sm text-faint py-16 text-center">Loading reports…</div>
        ) : (
          <div className="space-y-6">

            {/* Project Summary */}
            <div className="print-card bg-panel rounded-xl border border-line p-6">
              <SectionHeader icon={FileText} title="Project Summary" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-xs text-faint uppercase tracking-wide mb-1">Project</p>
                  <p className="text-sm font-semibold text-ink-soft">{project?.name ?? '-'}</p>
                  {project?.address && <p className="text-xs text-muted-fg mt-0.5">{project.address}</p>}
                </div>
                <div>
                  <p className="text-xs text-faint uppercase tracking-wide mb-1">Client</p>
                  <p className="text-sm font-semibold text-ink-soft">{clientLabel(project?.customers?.name, project?.client) ?? '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-faint uppercase tracking-wide mb-1">Status</p>
                  {project?.status ? <StatusBadge status={project.status} /> : <span className="text-sm text-faint">-</span>}
                </div>
                {project?.sellout_amount != null && (
                  <div>
                    <p className="text-xs text-faint uppercase tracking-wide mb-1">Contract Value</p>
                    <p className="text-sm font-semibold text-ink-soft">{fmt(project.sellout_amount)}</p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-line-soft pt-4 mt-2">
                <div className="rounded-lg bg-surface border border-line-soft p-3 text-center">
                  <p className="text-xl font-bold text-success">{permitIssued}</p>
                  <p className="text-xs text-muted-fg mt-0.5">Permits Issued</p>
                </div>
                <div className="rounded-lg bg-surface border border-line-soft p-3 text-center">
                  <p className="text-xl font-bold text-yellow-600">{permitPending}</p>
                  <p className="text-xs text-muted-fg mt-0.5">Permits Pending</p>
                </div>
                <div className="rounded-lg bg-surface border border-line-soft p-3 text-center">
                  <p className="text-xl font-bold text-success">{inspPassed}</p>
                  <p className="text-xs text-muted-fg mt-0.5">Inspections Passed</p>
                </div>
                <div className={cn('rounded-lg border p-3 text-center', inspFailed > 0 ? 'bg-danger-tint border-red-100' : 'bg-surface border-line-soft')}>
                  <p className={cn('text-xl font-bold', inspFailed > 0 ? 'text-danger' : 'text-faint')}>{inspFailed}</p>
                  <p className="text-xs text-muted-fg mt-0.5">Inspections Failed</p>
                </div>
              </div>

              <div className="flex justify-end mt-4 no-print">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-fg hover:text-ink-soft transition-colors"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print this section
                </button>
              </div>
            </div>

            {/* Payment Report */}
            <div className="print-card bg-panel rounded-xl border border-line p-6">
              <SectionHeader icon={DollarSign} title="Payment Report" />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                <div className="rounded-lg bg-surface border border-line-soft p-3">
                  <p className="text-xs text-faint mb-1">Total Invoiced</p>
                  <p className="text-lg font-bold text-ink-soft">{fmt(totalInvoiced)}</p>
                </div>
                <div className="rounded-lg bg-success-tint border border-green-100 p-3">
                  <p className="text-xs text-faint mb-1">Total Paid</p>
                  <p className="text-lg font-bold text-success">{fmt(totalPaid)}</p>
                </div>
                <div className={cn('rounded-lg border p-3', totalOutstanding > 0 ? 'bg-accent-tint border-accent/20' : 'bg-surface border-line-soft')}>
                  <p className="text-xs text-faint mb-1">Outstanding</p>
                  <p className={cn('text-lg font-bold', totalOutstanding > 0 ? 'text-accent-fg' : 'text-faint')}>{fmt(totalOutstanding)}</p>
                </div>
              </div>

              {Object.keys(invoicesBySub).length === 0 ? (
                <p className="text-sm text-faint">No invoices on record.</p>
              ) : (
                <div className="space-y-4">
                  {Object.entries(invoicesBySub).map(([sub, invs]) => {
                    const subTotal = invs.reduce((s, i) => s + (i.amount ?? 0), 0)
                    const subPaid = invs.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
                    const subOut = subTotal - subPaid
                    return (
                      <div key={sub} className="border border-line-soft rounded-lg overflow-hidden">
                        <div className="bg-surface px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-ink-soft">{sub}</span>
                          <div className="flex gap-4 text-xs text-muted-fg">
                            <span>Total: <span className="font-semibold text-ink-soft">{fmt(subTotal)}</span></span>
                            <span>Paid: <span className="font-semibold text-success">{fmt(subPaid)}</span></span>
                            {subOut > 0 && <span>Outstanding: <span className="font-semibold text-accent-fg">{fmt(subOut)}</span></span>}
                          </div>
                        </div>
                        <div className="divide-y divide-line-soft">
                          {invs.map(inv => (
                            <div key={inv.id} className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                              <span className="text-sm text-muted-fg">
                                {inv.invoice_number ? `Invoice #${inv.invoice_number}` : 'Invoice'}
                                <span className="text-faint ml-2 text-xs">
                                  {formatDate(inv.created_at)}
                                </span>
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-medium text-ink-soft">{fmt(inv.amount ?? 0)}</span>
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
            <div className="print-card bg-panel rounded-xl border border-line p-6">
              <SectionHeader icon={ShieldCheck} title="Compliance Report" />

              {complianceGroups.length === 0 ? (
                <p className="text-sm text-faint">No subcontractors on this job yet.</p>
              ) : (
                <div className="space-y-4">
                  {complianceGroups.map(group => (
                    <div key={group.companyId} className={cn('border rounded-lg overflow-hidden', group.actionRequired ? 'border-danger/30' : 'border-line-soft')}>
                      <div className={cn('px-4 py-2.5 flex flex-wrap items-center justify-between gap-2', group.actionRequired ? 'bg-danger-tint' : 'bg-surface')}>
                        <span className="text-sm font-semibold text-ink-soft">{group.name}</span>
                        {group.actionRequired && (
                          <span className="whitespace-nowrap text-xs font-medium text-danger bg-danger-tint px-2 py-0.5 rounded-full">Action required</span>
                        )}
                      </div>
                      <div className="divide-y divide-line-soft">
                        {group.docs.map(doc => {
                          const bad = doc.status === 'expired' || doc.status === 'missing'
                          return (
                            <div key={doc.id} className={cn('px-4 py-2.5 flex flex-wrap items-center justify-between gap-2', bad ? 'bg-danger-tint/50' : '')}>
                              <div>
                                <span className={cn('text-sm font-medium', bad ? 'text-danger' : 'text-ink-soft')}>
                                  {doc.label}
                                </span>
                                {doc.expiry_date ? (
                                  <span className={cn('ml-2 text-xs', bad ? 'text-danger' : 'text-faint')}>
                                    Expires {formatDate(doc.expiry_date)}
                                  </span>
                                ) : !doc.onFile ? (
                                  <span className="ml-2 text-xs text-danger">Nothing on file</span>
                                ) : null}
                              </div>
                              <StatusBadge status={doc.status} />
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}
      </div>
    </>
  )
}

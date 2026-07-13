'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer } from 'lucide-react'

export default function InvoicePrintPage({ params }: { params: { id: string; invoiceId: string } }) {
  const supabase = createClient()
  const [invoice, setInvoice] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const [invRes, projRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/invoices`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projects/${params.id}/bids`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (invRes.ok) {
        const d = await invRes.json()
        const inv = d.invoices?.find((i: any) => i.id === params.invoiceId)
        setInvoice(inv ?? null)
      }
      if (projRes.ok) {
        const d = await projRes.json()
        // get project info from packages
      }
      // Fetch project directly
      const { data: proj } = await supabase.from('projects').select('*, companies(name, address, phone, email, logo_url)').eq('id', params.id).single()
      setProject(proj)
      setCompany((proj as any)?.companies)
      setLoading(false)
    }
    load()
  }, [params.id, params.invoiceId])

  if (loading) return <div className="p-8 text-sm text-faint">Loading invoice...</div>
  if (!invoice) return <div className="p-8 text-sm text-danger">Invoice not found.</div>

  return (
    <>
      {/* Print button - hidden when printing */}
      <div className="no-print fixed top-4 right-4 z-50">
        <button onClick={() => window.print()}
          className="flex items-center gap-2 bg-accent text-accent-ink rounded-lg px-4 py-2 text-sm font-medium hover:bg-accent shadow-lg">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div className="min-h-screen bg-panel p-10 max-w-3xl mx-auto print:p-0 print:max-w-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-10">
          <div>
            {company?.logo_url && (
              <img src={company.logo_url} alt="Logo" className="h-16 mb-3 object-contain" />
            )}
            <p className="text-xl font-bold text-ink">{company?.name ?? 'General Contractor'}</p>
            {company?.address && <p className="text-sm text-muted-fg mt-0.5">{company.address}</p>}
            {company?.phone && <p className="text-sm text-muted-fg">{company.phone}</p>}
            {company?.email && <p className="text-sm text-muted-fg">{company.email}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-ink">INVOICE</p>
            <p className="text-lg font-mono font-semibold text-accent-fg mt-1">{invoice.invoice_number}</p>
            <p className="text-sm text-muted-fg mt-2">Date: {new Date(invoice.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            {invoice.due_date && (
              <p className="text-sm text-muted-fg">Due: {new Date(invoice.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="border-t-2 border-accent mb-8" />

        {/* Bill To + Project */}
        <div className="grid grid-cols-2 gap-8 mb-10">
          <div>
            <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-2">Bill To</p>
            <p className="font-semibold text-ink text-lg">{invoice.company_name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-2">Project</p>
            <p className="font-semibold text-ink">{project?.name}</p>
            {project?.address && <p className="text-sm text-muted-fg">{project.address}</p>}
          </div>
        </div>

        {/* Line items table */}
        <table className="w-full mb-10">
          <thead>
            <tr className="bg-surface border-y border-line">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Description</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-line-soft">
              <td className="px-4 py-4 text-ink-soft">{invoice.description ?? `Payment - ${invoice.company_name}`}</td>
              <td className="px-4 py-4 text-right font-semibold text-ink">${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="px-4 py-4 text-right font-semibold text-ink-soft">Total Due</td>
              <td className="px-4 py-4 text-right text-2xl font-black text-ink">
                ${Number(invoice.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Status + approval */}
        <div className="rounded-lg border border-line px-5 py-4 mb-8">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-faint mb-0.5">Status</p>
              <p className="font-semibold text-ink-soft capitalize">{invoice.status.replace('_', ' ')}</p>
            </div>
            {invoice.approved_by_name && (
              <div>
                <p className="text-xs text-faint mb-0.5">Approved By</p>
                <p className="font-semibold text-ink-soft">{invoice.approved_by_name}</p>
              </div>
            )}
            {invoice.approved_at && (
              <div>
                <p className="text-xs text-faint mb-0.5">Approved On</p>
                <p className="font-semibold text-ink-soft">{new Date(invoice.approved_at).toLocaleDateString()}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-line pt-6 text-center text-xs text-faint">
          <p>Thank you for your work on this project.</p>
          {company?.email && <p className="mt-1">Questions? Contact us at {company.email}</p>}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; }
        }
      `}</style>
    </>
  )
}

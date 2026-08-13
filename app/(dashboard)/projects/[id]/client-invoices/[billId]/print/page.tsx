'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Printer } from 'lucide-react'

const money = (n: unknown) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Line {
  id: string
  description: string
  cost: number
  markup_pct: number
  markup: number
  amount: number
  sort_order: number
}

/**
 * The document the client actually receives.
 *
 * `show_markup` decides whether it is an open-book bill - cost, your
 * percentage, the total on every line - or a single amount per line. That is
 * the difference between a cost-plus contract, where the client is entitled to
 * see what things cost, and a job billed at your price, where printing your
 * margin would be handing it over.
 */
export default function ClientInvoicePrintPage({ params }: { params: { id: string; billId: string } }) {
  const supabase = createClient()
  const [bill, setBill] = useState<any>(null)
  const [project, setProject] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const [bRes, pRes] = await Promise.all([
        fetch(`/api/projects/${params.id}/client-invoices`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/projects/${params.id}`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (bRes.ok) {
        const d = await bRes.json()
        setBill((d.invoices ?? []).find((i: any) => i.id === params.billId) ?? null)
      }
      if (pRes.ok) {
        const d = await pRes.json()
        setProject(d.project ?? d)
        setCompany(d.project?.companies ?? d.companies ?? null)
      }
      setLoading(false)
    })()
  }, [params.id, params.billId, supabase])

  if (loading) return <div className="p-8 text-sm text-faint">Loading…</div>
  if (!bill) return <div className="p-8 text-sm text-danger">That invoice could not be found.</div>

  const lines: Line[] = [...(bill.client_invoice_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  const showMarkup = !!bill.show_markup
  const cost = lines.reduce((s, l) => s + Number(l.cost || 0), 0)
  const markup = lines.reduce((s, l) => s + Number(l.markup || 0), 0)
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0)

  return (
    <div className="p-4 sm:p-6 print:p-0">
      <div className="no-print sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <p className="text-sm text-muted-fg">
          {showMarkup
            ? 'Open book - the client sees cost and your markup on every line.'
            : 'Flat amounts - your markup is not on this document.'}
        </p>
        <button onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-line bg-panel p-8 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 pb-6 border-b border-line">
          <div>
            <h1 className="text-2xl font-bold text-ink">Invoice</h1>
            <p className="text-sm text-muted-fg mt-1">{bill.invoice_number}</p>
          </div>
          <div className="text-right text-sm">
            {company?.name && <p className="font-semibold text-ink">{company.name}</p>}
            <p className="text-muted-fg">
              Issued {new Date((bill.issue_date ?? '') + 'T00:00:00').toLocaleDateString()}
            </p>
            {bill.due_date && (
              <p className="text-muted-fg">
                Due {new Date(bill.due_date + 'T00:00:00').toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Bill to</p>
            <p className="mt-1 font-medium text-ink">{project?.client || 'Client'}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Project</p>
            <p className="mt-1 font-medium text-ink">{project?.name}</p>
            {project?.address && <p className="text-muted-fg">{project.address}</p>}
          </div>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface border-y border-line text-xs uppercase tracking-wide text-muted-fg">
              <th className="px-4 py-2.5 text-left font-medium">Description</th>
              {showMarkup && <th className="px-4 py-2.5 text-right font-medium">Cost</th>}
              {showMarkup && <th className="px-4 py-2.5 text-right font-medium">Markup</th>}
              <th className="px-4 py-2.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map(l => (
              <tr key={l.id} className="border-b border-line-soft">
                <td className="px-4 py-3 text-ink-soft">{l.description}</td>
                {showMarkup && (
                  <td className="px-4 py-3 text-right text-muted-fg tabular-nums">{money(l.cost)}</td>
                )}
                {showMarkup && (
                  <td className="px-4 py-3 text-right text-muted-fg tabular-nums">
                    {Number(l.markup) === 0
                      ? <span className="text-faint">at cost</span>
                      : <>{money(l.markup)} <span className="text-faint">({Number(l.markup_pct)}%)</span></>}
                  </td>
                )}
                <td className="px-4 py-3 text-right font-semibold text-ink tabular-nums">{money(l.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {showMarkup && (
              <>
                <tr>
                  <td className="px-4 py-2 text-muted-fg" colSpan={showMarkup ? 3 : 1}>Cost of work</td>
                  <td className="px-4 py-2 text-right text-ink-soft tabular-nums">{money(cost)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-muted-fg" colSpan={showMarkup ? 3 : 1}>
                    Contractor&apos;s fee
                  </td>
                  <td className="px-4 py-2 text-right text-ink-soft tabular-nums">{money(markup)}</td>
                </tr>
              </>
            )}
            <tr className="border-t-2 border-line">
              <td className={cn('px-4 py-3 text-base font-bold text-ink')} colSpan={showMarkup ? 3 : 1}>
                Amount due
              </td>
              <td className="px-4 py-3 text-right text-base font-bold text-ink tabular-nums">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {bill.notes && (
          <div className="mt-6 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Notes</p>
            <p className="mt-1 text-muted-fg whitespace-pre-line">{bill.notes}</p>
          </div>
        )}
        {bill.terms && (
          <div className="mt-4 text-xs text-faint whitespace-pre-line">{bill.terms}</div>
        )}
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  )
}

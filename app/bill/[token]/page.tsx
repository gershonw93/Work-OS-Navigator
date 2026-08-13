'use client'

import { useEffect, useState } from 'react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Printer, AlertTriangle } from 'lucide-react'

const money = (n: unknown) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

interface Line {
  id: string
  description: string
  amount: number
  cost?: number
  markup?: number
  markup_pct?: number
}

/**
 * What the client opens. No account, no sign-up - the same deal as the project
 * portal and a file share.
 *
 * Whether cost and markup appear at all is decided on the server, so an
 * invoice billed at a flat number does not carry the margin in its response
 * for anyone who thinks to look.
 */
export default function ClientBillPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const res = await fetch(`/api/bill/${params.token}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) setError(json.error ?? 'This link is not valid.')
      else setData(json)
      setLoading(false)
    })()
  }, [params.token])

  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-faint">Loading…</div>

  if (error) {
    return (
      <div className="min-h-screen grid place-items-center p-6">
        <div className="max-w-sm text-center">
          <AlertTriangle className="h-8 w-8 text-warn mx-auto mb-3" />
          <p className="text-sm font-medium text-ink">{error}</p>
          <p className="text-xs text-faint mt-1">Check with whoever sent it to you.</p>
        </div>
      </div>
    )
  }

  const show = !!data.show_markup
  const lines: Line[] = data.lines ?? []

  return (
    <div className="min-h-screen bg-surface">
      <header className="no-print border-b border-line bg-panel">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <SyteNavLogo className="h-6" />
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-muted-fg hover:bg-surface">
              <Printer className="h-4 w-4" /> Print / Save PDF
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl p-4 sm:p-6 print:p-0">
        <div className="rounded-2xl border border-line bg-panel p-6 sm:p-9 print:rounded-none print:border-0 print:p-0">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
            <div>
              <h1 className="text-2xl font-bold text-ink">Invoice</h1>
              <p className="mt-1 text-sm text-muted-fg">{data.invoice_number}</p>
              {data.status === 'paid' && (
                <span className="mt-2 inline-block rounded-full border border-success/30 bg-success-tint px-2.5 py-0.5 text-xs font-semibold text-success">
                  Paid - thank you
                </span>
              )}
            </div>
            <div className="text-right text-sm">
              {data.from?.name && <p className="font-semibold text-ink">{data.from.name}</p>}
              {data.from?.address && <p className="text-muted-fg">{data.from.address}</p>}
              {data.from?.phone && <p className="text-muted-fg">{data.from.phone}</p>}
              {data.from?.email && <p className="text-muted-fg">{data.from.email}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 py-6 text-sm sm:grid-cols-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Bill to</p>
              <p className="mt-1 font-medium text-ink">{data.project?.client || 'Client'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Project</p>
              <p className="mt-1 font-medium text-ink">{data.project?.name}</p>
              {data.project?.address && <p className="text-muted-fg">{data.project.address}</p>}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Dates</p>
              <p className="mt-1 text-muted-fg">
                Issued {new Date((data.issue_date ?? '') + 'T00:00:00').toLocaleDateString()}
              </p>
              {data.due_date && (
                <p className="font-medium text-ink">
                  Due {new Date(data.due_date + 'T00:00:00').toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y border-line bg-surface text-xs uppercase tracking-wide text-muted-fg">
                  <th className="px-3 py-2.5 text-left font-medium">Description</th>
                  {show && <th className="px-3 py-2.5 text-right font-medium">Cost</th>}
                  {show && <th className="px-3 py-2.5 text-right font-medium">Fee</th>}
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map(l => (
                  <tr key={l.id} className="border-b border-line-soft">
                    <td className="px-3 py-3 text-ink-soft">{l.description}</td>
                    {show && <td className="px-3 py-3 text-right tabular-nums text-muted-fg">{money(l.cost)}</td>}
                    {show && (
                      <td className="px-3 py-3 text-right tabular-nums text-muted-fg">
                        {Number(l.markup) === 0
                          ? <span className="text-faint">at cost</span>
                          : <>{money(l.markup)} <span className="text-faint">({l.markup_pct}%)</span></>}
                      </td>
                    )}
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-ink">{money(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                {show && (
                  <>
                    <tr>
                      <td className="px-3 py-2 text-muted-fg" colSpan={3}>Cost of work</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{money(data.cost_total)}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-2 text-muted-fg" colSpan={3}>Contractor&apos;s fee</td>
                      <td className="px-3 py-2 text-right tabular-nums text-ink-soft">{money(data.markup_total)}</td>
                    </tr>
                  </>
                )}
                <tr className="border-t-2 border-line">
                  <td className="px-3 py-3 text-base font-bold text-ink" colSpan={show ? 3 : 1}>Amount due</td>
                  <td className="px-3 py-3 text-right text-base font-bold text-ink tabular-nums">{money(data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {data.notes && (
            <div className="mt-6 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Notes</p>
              <p className="mt-1 whitespace-pre-line text-muted-fg">{data.notes}</p>
            </div>
          )}
          {data.terms && <p className="mt-4 whitespace-pre-line text-xs text-faint">{data.terms}</p>}
        </div>

        <p className="no-print mt-6 text-center text-xs text-faint">
          Sent securely through SyteNav. Only people with this link can see this invoice.
        </p>
      </main>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
        }
      `}</style>
    </div>
  )
}

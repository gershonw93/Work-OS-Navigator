'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { asContractType, usesMarkup } from '@/lib/contract-type'
import { Printer } from 'lucide-react'

type Detail = 'lump' | 'category' | 'line'

interface BudgetItem {
  id: string
  category: string
  /** Sub quotes group by section; GC budgets group by category. */
  section?: string | null
  description: string
  cost_code?: string | null
  quantity?: number | null
  unit_price?: number | null
  budgeted_amount: number
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Client-facing proposal built from the internal budget/estimate.
 *
 * It comes in TWO SHAPES, because a proposal is a promise and the two kinds of
 * job promise different things.
 *
 * FIXED PRICE / SPEC - the markup is applied to produce SELL prices and the raw
 * cost is never shown. The total is a price: "this job costs you $863,400."
 *
 * COST-PLUS - there is no such number, and printing one was the bug. What you
 * are actually agreeing is a METHOD: bill actual cost, plus a fee. So the
 * amounts shown ARE the estimated costs, the fee is broken out as its own line
 * at its own percentage, and the total is labelled an ESTIMATE rather than a
 * price - because a client who reads a bold total as a fixed quote will hold
 * you to it.
 *
 * Detail level is a live toggle; print to save as PDF.
 */
export default function ProposalPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [project, setProject] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [markup, setMarkup] = useState(0) // fraction, e.g. 0.15
  const [costPlus, setCostPlus] = useState(false)
  const [detail, setDetail] = useState<Detail>('category')
  const [loading, setLoading] = useState(true)

  // Force light theme on this page so the printed proposal is always clean
  // white with dark text, regardless of the user's app theme.
  useEffect(() => {
    const root = document.documentElement
    const prev = root.getAttribute('data-theme')
    root.setAttribute('data-theme', 'light')
    return () => { if (prev) root.setAttribute('data-theme', prev); else root.removeAttribute('data-theme') }
  }, [])

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token ?? ''
      const bRes = await fetch(`/api/projects/${params.id}/budget`, { headers: { Authorization: `Bearer ${token}` } })
      if (bRes.ok) {
        const d = await bRes.json()
        setItems((d.items ?? []).filter((i: BudgetItem) => Number(i.budgeted_amount) > 0))
      }
      const { data: proj } = await supabase
        .from('projects')
        .select('*, companies(name, address, phone, contact_email, logo_url, license_number)')
        .eq('id', params.id).single()
      setProject(proj)
      setCompany((proj as any)?.companies)
      setMarkup(Number((proj as any)?.contractor_fee_pct ?? 0))
      setCostPlus(usesMarkup(asContractType((proj as any)?.contract_type)))
      setLoading(false)
    }
    load()
  }, [params.id])

  // On cost-plus the figures ARE the costs - that is the basis of the deal, and
  // the fee sits on its own line rather than being folded invisibly into every
  // number. Everywhere else the markup is baked in and the cost never shown.
  const sell = (cost: number) =>
    costPlus ? Number(cost || 0) : Number(cost || 0) * (1 + markup)

  const byCategory = useMemo(() => {
    const map = new Map<string, BudgetItem[]>()
    for (const i of items) {
      const c = i.section || i.category || 'General'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(i)
    }
    return Array.from(map.entries()).map(([category, rows]) => ({
      category,
      rows,
      subtotal: rows.reduce((s, r) => s + sell(r.budgeted_amount), 0),
    }))
  }, [items, markup])

  // On cost-plus `subtotal` is the estimated cost of work and `fee` is charged
  // on top; elsewhere the fee is already inside subtotal and total equals it.
  const subtotal = items.reduce((s, i) => s + sell(i.budgeted_amount), 0)
  const fee = costPlus ? subtotal * markup : 0
  const total = subtotal + fee
  const feePctLabel = `${(markup * 100).toFixed(markup * 100 % 1 === 0 ? 0 : 2)}%`
  const validUntil = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [])

  if (loading) return <div className="p-8 text-sm text-faint">Loading proposal...</div>
  if (!items.length) return <div className="p-8 text-sm text-danger">This budget has no line items yet. Add line items to generate a proposal.</div>

  const client = project?.client || project?.customer_name || 'Client'

  return (
    <>
      {/* Toolbar sits in the page flow at the top of the content, not floating.
          Hidden when printing. */}
      <div className="no-print sticky top-0 z-10 -mx-4 -mt-4 mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:-mt-6 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-fg">Detail:</span>
          <div className="flex overflow-hidden rounded-lg border border-line bg-panel text-sm">
            {(['lump', 'category', 'line'] as Detail[]).map(d => (
              <button key={d} onClick={() => setDetail(d)}
                className={`px-3 py-2 font-medium capitalize ${detail === d ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-surface'}`}>
                {d === 'lump' ? 'Lump sum' : d === 'category' ? 'By section' : 'Itemized'}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-sm hover:bg-accent/90">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div className="mx-auto max-w-3xl rounded-xl border border-line bg-panel p-8 sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            {company?.logo_url && <img src={company.logo_url} alt="Logo" className="h-16 mb-3 object-contain" />}
            <p className="text-xl font-bold text-ink">{company?.name ?? 'General Contractor'}</p>
            {company?.address && <p className="text-sm text-muted-fg mt-0.5">{company.address}</p>}
            {company?.phone && <p className="text-sm text-muted-fg">{company.phone}</p>}
            {company?.contact_email && <p className="text-sm text-muted-fg">{company.contact_email}</p>}
            {company?.license_number && <p className="text-sm text-muted-fg">Lic. #{company.license_number}</p>}
          </div>
          <div className="text-right">
            <p className="text-3xl font-black text-ink">PROPOSAL</p>
            {costPlus && (
              <p className="text-sm font-semibold text-muted-fg mt-0.5">Cost plus {feePctLabel}</p>
            )}
            <p className="text-sm text-muted-fg mt-2">Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-sm text-muted-fg">
              {costPlus ? 'Estimate dated' : 'Valid until'}: {costPlus ? new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : validUntil}
            </p>
          </div>
        </div>

        <div className="border-t-2 border-accent mb-8" />

        {/* Prepared for + Project */}
        <div className="grid grid-cols-2 gap-8 mb-8">
          <div>
            <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-2">Prepared For</p>
            <p className="font-semibold text-ink text-lg">{client}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-2">Project</p>
            <p className="font-semibold text-ink">{project?.name}</p>
            {project?.address && <p className="text-sm text-muted-fg">{project.address}</p>}
          </div>
        </div>

        {/* On cost-plus, say what the document IS before any number appears.
            The single most expensive misreading of this page is a client
            treating the total as a fixed quote. */}
        {costPlus && (
          <div className="rounded-lg border border-ink/20 bg-surface px-5 py-4 mb-8 text-sm text-ink-soft">
            <p className="font-semibold text-ink">This is an estimate, not a fixed price.</p>
            <p className="mt-1 text-muted-fg">
              Work on this project is billed on a cost-plus basis: you pay the actual cost of the work,
              plus a contractor&apos;s fee of {feePctLabel}. The figures below are our best estimate of
              those costs today. The final amount will be based on what the work actually costs.
            </p>
          </div>
        )}

        {/* Scope / line items */}
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-surface border-y border-line">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Scope of Work</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">
                {costPlus ? 'Estimated cost' : 'Price'}
              </th>
            </tr>
          </thead>
          <tbody>
            {detail === 'lump' && (
              <tr className="border-b border-line-soft">
                <td className="px-4 py-4 text-ink-soft">Complete scope of work for {project?.name} as discussed.</td>
                <td className="px-4 py-4 text-right font-semibold text-ink">{money(subtotal)}</td>
              </tr>
            )}

            {detail === 'category' && byCategory.map(g => (
              <tr key={g.category} className="border-b border-line-soft">
                <td className="px-4 py-4 text-ink-soft">{g.category}</td>
                <td className="px-4 py-4 text-right font-semibold text-ink">{money(g.subtotal)}</td>
              </tr>
            ))}

            {detail === 'line' && byCategory.map(g => (
              <Fragment key={g.category}>
                <tr className="bg-surface/60">
                  <td className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-fg" colSpan={2}>{g.category}</td>
                </tr>
                {g.rows.map(r => (
                  <tr key={r.id} className="border-b border-line-soft">
                    <td className="px-4 py-3 pl-6 text-ink-soft">
                      {r.description || r.cost_code || 'Work item'}
                      {r.quantity != null && r.unit_price != null && (
                        <span className="block text-xs text-muted-fg">{r.quantity} × {money(sell(r.unit_price))}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-ink">{money(sell(r.budgeted_amount))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {/* Cost-plus shows the arithmetic of the deal: cost, the fee at its
                stated rate, and an estimated total that says so. */}
            {costPlus && (
              <>
                <tr className="border-t-2 border-ink">
                  <td className="px-4 py-3 text-right font-semibold text-ink-soft">Estimated cost of work</td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(subtotal)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 text-right font-semibold text-ink-soft">
                    Contractor&apos;s fee <span className="font-normal text-muted-fg">({feePctLabel})</span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-ink">{money(fee)}</td>
                </tr>
              </>
            )}
            <tr className={costPlus ? 'border-t border-ink' : 'border-t-2 border-ink'}>
              <td className="px-4 py-4 text-right font-semibold text-ink-soft">
                {costPlus ? 'Estimated total' : 'Total'}
              </td>
              <td className="px-4 py-4 text-right text-2xl font-black text-ink">{money(total)}</td>
            </tr>
            {costPlus && (
              <tr>
                <td className="px-4 pb-2 text-right text-xs text-muted-fg" colSpan={2}>
                  Estimate only - the final amount is the actual cost of the work plus {feePctLabel}.
                </td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Terms */}
        <div className="rounded-lg border border-line px-5 py-4 mb-8 text-sm text-muted-fg space-y-1.5">
          <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-1">Terms</p>
          {costPlus ? (
            <>
              <p>Work is billed at actual cost plus a contractor&apos;s fee of {feePctLabel}.</p>
              <p>The figures above are an estimate of costs, not a fixed price or a cap. The amount invoiced will reflect the cost of the work actually performed.</p>
              <p>Invoices are supported by the underlying costs they are based on.</p>
              <p>Changes to scope are handled the same way - at cost plus the fee - and recorded in writing.</p>
              <p>A payment schedule will be agreed upon acceptance.</p>
            </>
          ) : (
            <>
              <p>This proposal is valid for 30 days from the date above.</p>
              <p>Pricing covers the scope described here; changes to scope may adjust the price via a written change order.</p>
              <p>A payment schedule will be agreed upon acceptance.</p>
            </>
          )}
        </div>

        {/* Signature */}
        <div className="grid grid-cols-2 gap-8 mt-12">
          <div>
            <div className="border-t border-ink pt-2 text-sm text-muted-fg">Client signature</div>
          </div>
          <div>
            <div className="border-t border-ink pt-2 text-sm text-muted-fg">Date</div>
          </div>
        </div>

        <div className="border-t border-line pt-6 mt-10 text-center text-xs text-faint">
          <p>Thank you for the opportunity to {costPlus ? 'work on' : 'bid on'} your project.</p>
          {company?.contact_email && <p className="mt-1">Questions? Contact us at {company.contact_email}</p>}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { margin: 0; background: #fff; }
          @page { margin: 0.5in; }
        }
      `}</style>
    </>
  )
}

'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Printer } from 'lucide-react'

type Detail = 'lump' | 'category' | 'line'

interface BudgetItem {
  id: string
  category: string
  description: string
  cost_code?: string | null
  budgeted_amount: number
}

const money = (n: number) => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Client-facing proposal built from the internal budget/estimate. Applies the
// project's markup (contractor_fee_pct) to produce SELL prices - the raw cost
// is never shown. Detail level is a live toggle; print to save as PDF.
export default function ProposalPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [project, setProject] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [markup, setMarkup] = useState(0) // fraction, e.g. 0.15
  const [detail, setDetail] = useState<Detail>('category')
  const [loading, setLoading] = useState(true)

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
      setLoading(false)
    }
    load()
  }, [params.id])

  const sell = (cost: number) => Number(cost || 0) * (1 + markup)

  const byCategory = useMemo(() => {
    const map = new Map<string, BudgetItem[]>()
    for (const i of items) {
      const c = i.category || 'General'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(i)
    }
    return Array.from(map.entries()).map(([category, rows]) => ({
      category,
      rows,
      subtotal: rows.reduce((s, r) => s + sell(r.budgeted_amount), 0),
    }))
  }, [items, markup])

  const total = items.reduce((s, i) => s + sell(i.budgeted_amount), 0)
  const validUntil = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() + 30)
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }, [])

  if (loading) return <div className="p-8 text-sm text-faint">Loading proposal...</div>
  if (!items.length) return <div className="p-8 text-sm text-danger">This budget has no line items yet. Add line items to generate a proposal.</div>

  const client = project?.client || project?.customer_name || 'Client'

  return (
    <>
      <div className="no-print fixed top-4 right-4 z-50 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-line bg-panel text-sm">
          {(['lump', 'category', 'line'] as Detail[]).map(d => (
            <button key={d} onClick={() => setDetail(d)}
              className={`px-3 py-2 font-medium capitalize ${detail === d ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-surface'}`}>
              {d === 'lump' ? 'Lump sum' : d === 'category' ? 'By section' : 'Itemized'}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-lg">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <div className="min-h-screen bg-panel p-10 max-w-3xl mx-auto print:p-0 print:max-w-none">
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
            <p className="text-sm text-muted-fg mt-2">Date: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            <p className="text-sm text-muted-fg">Valid until: {validUntil}</p>
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

        {/* Scope / line items */}
        <table className="w-full mb-8">
          <thead>
            <tr className="bg-surface border-y border-line">
              <th className="text-left px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Scope of Work</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-muted-fg uppercase tracking-wide">Price</th>
            </tr>
          </thead>
          <tbody>
            {detail === 'lump' && (
              <tr className="border-b border-line-soft">
                <td className="px-4 py-4 text-ink-soft">Complete scope of work for {project?.name} as discussed.</td>
                <td className="px-4 py-4 text-right font-semibold text-ink">{money(total)}</td>
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
                    <td className="px-4 py-3 pl-6 text-ink-soft">{r.description || r.cost_code || 'Work item'}</td>
                    <td className="px-4 py-3 text-right text-ink">{money(sell(r.budgeted_amount))}</td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-ink">
              <td className="px-4 py-4 text-right font-semibold text-ink-soft">Total</td>
              <td className="px-4 py-4 text-right text-2xl font-black text-ink">{money(total)}</td>
            </tr>
          </tfoot>
        </table>

        {/* Terms */}
        <div className="rounded-lg border border-line px-5 py-4 mb-8 text-sm text-muted-fg space-y-1.5">
          <p className="text-xs font-semibold text-faint uppercase tracking-widest mb-1">Terms</p>
          <p>This proposal is valid for 30 days from the date above.</p>
          <p>Pricing covers the scope described here; changes to scope may adjust the price via a written change order.</p>
          <p>A payment schedule will be agreed upon acceptance.</p>
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
          <p>Thank you for the opportunity to bid on your project.</p>
          {company?.contact_email && <p className="mt-1">Questions? Contact us at {company.contact_email}</p>}
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

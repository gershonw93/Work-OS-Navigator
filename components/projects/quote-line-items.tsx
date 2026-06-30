'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { FileText, ExternalLink, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Line { id: string; description: string; budgeted_amount: number; progress_pct: number }
interface QProject { status: string; quote_file_url: string | null; quote_file_name: string | null; quote_total: number | null }

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// Sub's own-job line items, sourced from their uploaded quote.
//  mode 'budget'   — what they quoted (amounts + earned-to-date)
//  mode 'progress' — editable % complete per line + overall amount-weighted bar
export function QuoteLineItems({ projectId, mode }: { projectId: string; mode: 'budget' | 'progress' }) {
  const supabase = createClient()
  const [project, setProject] = useState<QProject | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${projectId}/quote`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) { const d = await res.json(); setProject(d.project); setLines(d.line_items ?? []) }
    setLoading(false)
  }
  useEffect(() => { load() }, [projectId])

  async function setPct(id: string, pct: number) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, progress_pct: pct } : l))
    const t = await token()
    await fetch(`/api/projects/${projectId}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ line_item_id: id, progress_pct: pct }),
    })
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const total = project?.quote_total ?? lines.reduce((s, l) => s + Number(l.budgeted_amount || 0), 0)
  const earned = lines.reduce((s, l) => s + Number(l.budgeted_amount || 0) * (Number(l.progress_pct || 0) / 100), 0)
  const overallPct = total > 0 ? Math.round((earned / total) * 100) : 0

  if (lines.length === 0) {
    return (
      <div className="bg-panel rounded-xl border border-line p-10 text-center">
        <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
        <p className="text-sm text-muted-fg">No line items yet. Upload your quote on the <span className="font-medium text-ink-soft">Quote</span> tab — AI reads it into line items.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">{mode === 'budget' ? 'Line Items' : 'Progress'}</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            {mode === 'budget' ? 'The line items from the quote you sent the client.' : 'Mark how complete each line item is — overall % is weighted by value.'}
          </p>
        </div>
        {project?.quote_file_url && (
          <a href={project.quote_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-accent-fg hover:underline">
            <FileText className="h-4 w-4" /> View quote <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* Overall */}
      <div className="bg-panel rounded-xl border border-line p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-ink-soft flex items-center gap-1.5"><TrendingUp className="h-4 w-4 text-accent-fg" /> {mode === 'budget' ? 'Quote total' : 'Overall progress'}</p>
          <p className="text-sm font-bold text-ink">{mode === 'budget' ? money(total) : `${overallPct}%`}</p>
        </div>
        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-success-solid transition-all" style={{ width: `${overallPct}%` }} />
        </div>
        <div className="flex justify-between mt-2 text-xs text-muted-fg">
          <span>Earned to date {money(earned)}</span><span>of {money(total)}</span>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-panel rounded-xl border border-line overflow-hidden divide-y divide-line-soft">
        {lines.map(l => (
          <div key={l.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-soft truncate">{l.description}</span>
              <span className="text-sm font-medium text-ink shrink-0">{money(l.budgeted_amount)}</span>
            </div>
            {mode === 'progress' && (
              <div className="flex items-center gap-3 mt-2">
                <input type="range" min={0} max={100} step={5} value={l.progress_pct}
                  onChange={e => setPct(l.id, Number(e.target.value))} className="flex-1 accent-[#C9F24A]" />
                <span className="text-xs font-semibold text-ink-soft w-10 text-right">{l.progress_pct}%</span>
              </div>
            )}
            {mode === 'budget' && l.progress_pct > 0 && (
              <div className="mt-1.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-muted rounded-full overflow-hidden"><div className="h-full bg-success-solid" style={{ width: `${l.progress_pct}%` }} /></div>
                <span className="text-[11px] text-faint w-20 text-right">{l.progress_pct}% · {money(Number(l.budgeted_amount) * l.progress_pct / 100)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Upload, FileText, Loader2, Sparkles, CheckCircle2, ExternalLink, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Line { id: string; description: string; budgeted_amount: number; progress_pct: number; quantity: number | null; unit_price: number | null; section: string | null }
interface Stage { label: string; percent: number | null; amount: number | null; trigger?: string | null }
interface QProject { status: string; quote_file_url: string | null; quote_file_name: string | null; quote_total: number | null; payment_terms: string | null; payment_stages: Stage[] | null }

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function QuotePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [project, setProject] = useState<QProject | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [converting, setConverting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [defaultTerms, setDefaultTerms] = useState<string | null>(null)
  const [terms, setTerms] = useState('')
  const [termsSaving, setTermsSaving] = useState(false)
  const [termsSaved, setTermsSaved] = useState(false)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/quote`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setProject(d.project); setLines(d.line_items ?? []); setDefaultTerms(d.default_payment_terms ?? null)
      setTerms(d.project?.payment_terms ?? d.default_payment_terms ?? '')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  async function saveTerms() {
    setTermsSaving(true)
    const t = await token()
    await fetch(`/api/projects/${params.id}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ payment_terms: terms }),
    })
    setTermsSaving(false); setTermsSaved(true); setTimeout(() => setTermsSaved(false), 1500)
    setProject(p => p ? { ...p, payment_terms: terms } : p)
  }

  async function upload(file: File) {
    setUploading(true)
    const t = await token()
    const form = new FormData(); form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/quote`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form })
    setUploading(false)
    if (res.ok) load()
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not read the quote')
  }

  async function convert() {
    setConverting(true)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/quote`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ action: 'convert' }),
    })
    setConverting(false)
    if (res.ok) load()
    else alert('Could not convert')
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  const isPending = project?.status === 'planning'
  const total = project?.quote_total ?? lines.reduce((s, l) => s + Number(l.budgeted_amount || 0), 0)
  const stages = project?.payment_stages ?? null

  // Group line items by section, preserving order.
  const sections: { name: string; rows: Line[] }[] = []
  for (const l of lines) {
    const name = l.section ?? ''
    let g = sections.find(s => s.name === name)
    if (!g) { g = { name, rows: [] }; sections.push(g) }
    g.rows.push(l)
  }

  return (
    <div className="space-y-6">
      <input ref={fileRef} type="file" accept="application/pdf,image/*" className="sr-only"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Quote</h1>
          <p className="text-sm text-muted-fg mt-0.5">Upload the quote you sent the client. AI reads it into line items — then convert it to an active job.</p>
        </div>
        <span className={cn('text-xs font-semibold rounded-full px-2.5 py-1', isPending ? 'bg-warn-tint text-warn' : 'bg-success-tint text-success')}>
          {isPending ? 'Quote · Pending' : 'Active job'}
        </span>
      </div>

      {/* Quote file */}
      {project?.quote_file_url ? (
        <div className="bg-panel rounded-xl border border-line p-4 flex flex-wrap items-center justify-between gap-3">
          <a href={project.quote_file_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm text-accent-fg hover:underline">
            <FileText className="h-4 w-4" /> {project.quote_file_name ?? 'Quote'} <ExternalLink className="h-3 w-3" />
          </a>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-fg">Total <span className="font-bold text-ink">{money(total)}</span></span>
            <Button size="sm" variant="outline" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Replace</>}
            </Button>
          </div>
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()} disabled={uploading}
          className="w-full bg-panel rounded-xl border-2 border-dashed border-line p-10 text-center hover:border-accent hover:bg-surface transition-colors">
          {uploading ? <Loader2 className="h-8 w-8 text-accent-fg mx-auto mb-3 animate-spin" /> : <Upload className="h-8 w-8 text-faint mx-auto mb-3" />}
          <p className="text-sm font-medium text-ink-soft">{uploading ? 'Reading your quote…' : 'Upload your quote (PDF or photo)'}</p>
          <p className="text-xs text-faint mt-1 inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI scans it into line items automatically</p>
        </button>
      )}

      {/* Line items — grouped by section, with Qty / Unit / Amount columns */}
      {lines.length > 0 && (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">Line items ({lines.length})</p>
            <p className="text-xs text-faint">From your quote · also feeds Budget &amp; Progress</p>
          </div>
          {/* Column header */}
          <div className="hidden sm:grid grid-cols-[1fr_4rem_6rem_6rem] gap-3 px-4 py-2 border-b border-line-soft text-[10px] font-semibold uppercase tracking-wide text-faint">
            <span>Description</span><span className="text-right">Qty</span><span className="text-right">Unit</span><span className="text-right">Amount</span>
          </div>
          {sections.map(sec => (
            <div key={sec.name}>
              {sec.name && <div className="bg-surface px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-muted-fg">{sec.name}</div>}
              <div className="divide-y divide-line-soft">
                {sec.rows.map(l => (
                  <div key={l.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-3 sm:grid sm:grid-cols-[1fr_4rem_6rem_6rem] sm:gap-3">
                      <span className="text-sm text-ink-soft min-w-0">{l.description}</span>
                      <span className="hidden sm:block text-sm text-muted-fg text-right">{l.quantity != null ? l.quantity : '—'}</span>
                      <span className="hidden sm:block text-sm text-muted-fg text-right">{l.unit_price != null ? money(l.unit_price) : '—'}</span>
                      <span className="text-sm font-medium text-ink text-right shrink-0">{money(l.budgeted_amount)}</span>
                    </div>
                    {l.quantity != null && (
                      <p className="sm:hidden text-xs text-faint mt-0.5">{l.quantity} × {l.unit_price != null ? money(l.unit_price) : '—'}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_4rem_6rem_6rem] gap-3 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span><span /><span /><span className="text-right">{money(total)}</span>
          </div>
        </div>
      )}

      {/* Payment terms — structured stages from the quote */}
      {(project?.quote_file_url || lines.length > 0) && (
        stages && stages.length > 0 ? (
          <div className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-4 py-2.5 border-b border-line-soft flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-faint">Payment schedule ({stages.length})</p>
              {total > 0 && <p className="text-xs text-faint">of {money(total)}</p>}
            </div>
            <div className="divide-y divide-line-soft">
              {stages.map((st, i) => {
                const amt = st.amount ?? (st.percent != null && total ? Math.round(total * st.percent / 100) : null)
                return (
                  <div key={i} className="px-4 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm text-ink-soft">{st.label}</p>
                      {st.trigger && <p className="text-xs text-faint">{st.trigger}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      {st.percent != null && <span className="text-xs text-muted-fg mr-2">{st.percent}%</span>}
                      <span className="text-sm font-medium text-ink">{money(amt)}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : (
          <div className={cn('rounded-xl border p-4', !project?.payment_terms ? 'border-warn/40 bg-warn-tint/30' : 'border-line bg-panel')}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-ink-soft">Payment terms</p>
              {!project?.payment_terms && <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-warn-tint text-warn">Please set</span>}
            </div>
            {!project?.payment_terms && (
              <p className="text-xs text-muted-fg mb-2">
                We couldn't find payment terms on the quote. {defaultTerms ? 'Your default is filled in below — adjust if needed.' : 'Add them here (e.g. 50% deposit, 40% on rough-in, 10% on completion).'}
              </p>
            )}
            <textarea rows={3} value={terms} onChange={e => setTerms(e.target.value)}
              placeholder="e.g. 50% deposit, 40% at rough-in, 10% on completion"
              className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none" />
            <div className="flex items-center justify-between mt-2">
              <span className="text-xs text-faint">Set a default in Settings → Company so it auto-fills next time.</span>
              <Button size="sm" disabled={termsSaving} onClick={saveTerms}>
                {termsSaved ? <><CheckCircle2 className="h-3.5 w-3.5" /> Saved</> : termsSaving ? 'Saving…' : 'Save terms'}
              </Button>
            </div>
          </div>
        )
      )}

      {/* Convert */}
      {isPending && (
        <div className="rounded-xl border border-accent/40 bg-accent-tint/40 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <p className="font-semibold text-ink-soft">Quote approved by the client?</p>
            <p className="text-muted-fg text-xs mt-0.5">Convert it to an active job to start tracking schedule, tasks, progress, and time.</p>
          </div>
          <Button disabled={converting} onClick={convert} className="gap-1.5">
            {converting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Convert to active job
          </Button>
        </div>
      )}
      {!isPending && project && (
        <p className="text-sm text-success inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> This job is active. Track it in the other tabs.</p>
      )}
    </div>
  )
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Scale, Plus, X, Upload, Trophy, Trash2, FileText, Loader2, Check, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Quote {
  id: string
  comparison_id: string
  file_url: string | null
  file_name: string | null
  vendor_name: string | null
  total_amount: number | null
  valid_until: string | null
  scope_summary: string | null
  data: { line_items?: any[]; inclusions?: string[]; exclusions?: string[]; payment_terms?: string | null; notes?: string | null } | null
}
interface Comparison {
  id: string
  title: string
  trade: string | null
  winning_quote_id: string | null
  quotes: Quote[]
}

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function QuotesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newTrade, setNewTrade] = useState('')
  const [creating, setCreating] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/quotes`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setComparisons((await res.json()).comparisons ?? [])
    setLoading(false)
  }
  useEffect(() => { load() }, [params.id])

  async function createComparison() {
    if (!newTitle.trim()) return
    setCreating(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/quotes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: newTitle, trade: newTrade }),
    })
    setCreating(false)
    if (res.ok) { setNewTitle(''); setNewTrade(''); setShowNew(false); load() }
  }

  async function uploadQuote(compId: string, file: File) {
    setUploadingFor(compId)
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch(`/api/projects/${params.id}/quotes/${compId}/upload`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
      })
      if (res.ok) load()
      else alert((await res.json().catch(() => ({}))).error ?? 'Upload failed')
    } finally {
      setUploadingFor(null)
    }
  }

  async function setWinner(compId: string, quoteId: string | null) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/quotes/${compId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ winning_quote_id: quoteId }),
    })
    load()
  }

  async function deleteQuote(compId: string, quoteId: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/quotes/${compId}/${quoteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    load()
  }

  async function deleteComparison(compId: string) {
    if (!confirm('Delete this comparison and its quotes?')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/quotes/${compId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    load()
  }

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Compare Quotes</h1>
          <p className="text-sm text-muted-fg mt-0.5">Upload quotes for a scope and compare them side-by-side. AI reads each quote.</p>
        </div>
        <Button onClick={() => setShowNew(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> New Comparison</Button>
      </div>

      {showNew && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Title <span className="text-danger">*</span></Label>
              <Input placeholder="e.g. Electrical rough-in" value={newTitle} onChange={e => setNewTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Trade <span className="text-faint font-normal">(optional)</span></Label>
              <Input placeholder="e.g. Electrical" value={newTrade} onChange={e => setNewTrade(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
            <Button onClick={createComparison} disabled={creating || !newTitle.trim()}>{creating ? 'Creating…' : 'Create'}</Button>
          </div>
        </div>
      )}

      {comparisons.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Scale className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No comparisons yet. Create one, then upload 2+ quotes to compare.</p>
        </div>
      ) : comparisons.map(comp => {
        const quotes = comp.quotes ?? []
        const totals = quotes.map(q => q.total_amount).filter((n): n is number => n != null)
        const lowest = totals.length ? Math.min(...totals) : null
        const highest = totals.length ? Math.max(...totals) : null
        return (
          <div key={comp.id} className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-ink-soft">{comp.title}</h2>
                {comp.trade && <p className="text-xs text-faint">{comp.trade}</p>}
              </div>
              <div className="flex items-center gap-2">
                {lowest != null && highest != null && highest > lowest && (
                  <span className="text-xs text-success font-medium">Spread {money(highest - lowest)}</span>
                )}
                <input ref={el => { fileRefs.current[comp.id] = el }} type="file" accept="application/pdf,image/*" className="sr-only"
                  onChange={e => { const f = e.target.files?.[0]; if (f) uploadQuote(comp.id, f); e.target.value = '' }} />
                <Button size="sm" variant="outline" disabled={uploadingFor === comp.id} onClick={() => fileRefs.current[comp.id]?.click()}>
                  {uploadingFor === comp.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Add quote</>}
                </Button>
                <button onClick={() => deleteComparison(comp.id)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {quotes.length === 0 ? (
              <div className="p-8 text-center text-sm text-faint">
                {uploadingFor === comp.id ? 'Reading quote…' : 'Upload your first quote (PDF or photo).'}
              </div>
            ) : (
              <div className="p-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(quotes.length, 3)}, minmax(0, 1fr))` }}>
                {quotes.map(q => {
                  const isLowest = q.total_amount != null && q.total_amount === lowest && totals.length > 1
                  const isWinner = comp.winning_quote_id === q.id
                  return (
                    <div key={q.id} className={cn('rounded-xl border p-4 flex flex-col gap-3 min-w-0',
                      isWinner ? 'border-accent ring-1 ring-accent bg-accent-tint/30' : 'border-line')}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-ink truncate">{q.vendor_name ?? 'Unknown vendor'}</p>
                          {q.file_name && (
                            <a href={q.file_url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-accent-fg hover:underline inline-flex items-center gap-1">
                              <FileText className="h-3 w-3" /> {q.file_name} <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                        <button onClick={() => deleteQuote(comp.id, q.id)} className="p-1 rounded text-faint hover:text-danger shrink-0"><X className="h-3.5 w-3.5" /></button>
                      </div>

                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className={cn('text-2xl font-bold', isLowest ? 'text-success' : 'text-ink')}>{money(q.total_amount)}</span>
                          {isLowest && <span className="text-[10px] font-semibold rounded-full bg-success-tint text-success px-1.5 py-0.5">Lowest</span>}
                        </div>
                        {q.valid_until && <p className="text-xs text-faint">Valid until {new Date(q.valid_until + 'T00:00:00').toLocaleDateString()}</p>}
                      </div>

                      {q.scope_summary && <p className="text-xs text-muted-fg">{q.scope_summary}</p>}

                      {(q.data?.line_items?.length ?? 0) > 0 && (
                        <div className="border-t border-line-soft pt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-faint mb-1">Line items</p>
                          <div className="space-y-0.5 max-h-40 overflow-y-auto">
                            {q.data!.line_items!.map((li: any, i: number) => (
                              <div key={i} className="flex justify-between gap-2 text-xs">
                                <span className="text-muted-fg truncate">{li.description}</span>
                                <span className="text-ink-soft shrink-0">{li.amount != null ? money(li.amount) : ''}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {(q.data?.inclusions?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-success mb-0.5">Includes</p>
                          <ul className="text-xs text-muted-fg space-y-0.5">{q.data!.inclusions!.slice(0, 5).map((x, i) => <li key={i} className="flex gap-1"><Check className="h-3 w-3 text-success shrink-0 mt-0.5" />{x}</li>)}</ul>
                        </div>
                      )}
                      {(q.data?.exclusions?.length ?? 0) > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-danger mb-0.5">Excludes</p>
                          <ul className="text-xs text-muted-fg space-y-0.5">{q.data!.exclusions!.slice(0, 5).map((x, i) => <li key={i} className="flex gap-1"><X className="h-3 w-3 text-danger shrink-0 mt-0.5" />{x}</li>)}</ul>
                        </div>
                      )}

                      <div className="mt-auto pt-2">
                        {isWinner ? (
                          <Button size="sm" variant="secondary" className="w-full" onClick={() => setWinner(comp.id, null)}>
                            <Trophy className="h-3.5 w-3.5 text-accent-fg" /> Winner — clear
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => setWinner(comp.id, q.id)}>
                            <Trophy className="h-3.5 w-3.5" /> Mark winner
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

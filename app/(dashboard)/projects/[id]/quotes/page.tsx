'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Trophy, Trash2, FileText, Loader2, Check, ExternalLink, Sparkles, AlertTriangle, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface Quote {
  id: string
  comparison_id: string
  file_url: string | null
  file_name: string | null
  vendor_name: string | null
  total_amount: number | null
  valid_until: string | null
  scope_summary: string | null
  data: { line_items?: any[]; inclusions?: string[]; exclusions?: string[]; payment_terms?: string | null; notes?: string | null; extract_error?: string | null } | null
}
interface Analysis {
  per_quote?: { quote_id: string; missing?: string[]; strengths?: string[]; concerns?: string[] }[]
  recommendation?: string
  recommended_quote_id?: string | null
}
interface Comparison {
  id: string
  title: string
  trade: string | null
  winning_quote_id: string | null
  requirements: string | null
  analysis: Analysis | null
  quotes: Quote[]
}

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

export default function QuotesPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [comparisons, setComparisons] = useState<Comparison[]>([])
  const [loading, setLoading] = useState(true)
  const [newUploading, setNewUploading] = useState(false)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [analyzingFor, setAnalyzingFor] = useState<string | null>(null)
  const newRef = useRef<HTMLInputElement | null>(null)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  async function saveRequirements(compId: string, requirements: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/quotes/${compId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requirements }),
    })
    load()
  }

  async function analyze(compId: string) {
    setAnalyzingFor(compId)
    const token = await getToken()
    try {
      const res = await fetch(`/api/projects/${params.id}/quotes/${compId}/analyze`, {
        method: 'POST', headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) load()
      else alert((await res.json().catch(() => ({}))).error ?? 'Analysis failed')
    } finally { setAnalyzingFor(null) }
  }

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

  async function uploadOne(compId: string, file: File) {
    const token = await getToken()
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`/api/projects/${params.id}/quotes/${compId}/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
    })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
  }

  // Add one or more files (each file = a quote) to an existing comparison
  async function uploadQuotes(compId: string, files: FileList | File[]) {
    setUploadingFor(compId)
    try {
      for (const f of Array.from(files)) await uploadOne(compId, f)
      load()
    } catch (e: any) {
      alert(e?.message ?? 'Upload failed'); load()
    } finally {
      setUploadingFor(null)
    }
  }

  // Just upload files — auto-creates a comparison, each file becomes a quote
  async function uploadNewSet(files: FileList | File[]) {
    const list = Array.from(files)
    if (list.length === 0) return
    setNewUploading(true)
    try {
      const token = await getToken()
      const res = await fetch(`/api/projects/${params.id}/quotes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: 'Untitled comparison' }),
      })
      if (!res.ok) throw new Error('Could not start a comparison')
      const { comparison } = await res.json()
      for (const f of list) await uploadOne(comparison.id, f)
      load()
    } catch (e: any) {
      alert(e?.message ?? 'Upload failed'); load()
    } finally {
      setNewUploading(false)
    }
  }

  async function renameComparison(compId: string, title: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/quotes/${compId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title: title.trim() || 'Untitled comparison' }),
    })
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
      <input ref={newRef} type="file" accept="application/pdf,image/*" multiple className="sr-only"
        onChange={e => { if (e.target.files?.length) uploadNewSet(e.target.files); e.target.value = '' }} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Compare Quotes</h1>
          <p className="text-sm text-muted-fg mt-0.5">Upload quote files — each file is a quote. AI reads them and compares.</p>
        </div>
        <Button onClick={() => newRef.current?.click()} disabled={newUploading} className="gap-1.5">
          {newUploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><Upload className="h-4 w-4" /> Upload Quotes</>}
        </Button>
      </div>

      {comparisons.length === 0 ? (
        <button
          onClick={() => newRef.current?.click()}
          disabled={newUploading}
          className="w-full bg-panel rounded-xl border-2 border-dashed border-line p-10 text-center hover:border-accent hover:bg-surface transition-colors"
        >
          {newUploading ? <Loader2 className="h-8 w-8 text-accent-fg mx-auto mb-3 animate-spin" /> : <Upload className="h-8 w-8 text-faint mx-auto mb-3" />}
          <p className="text-sm font-medium text-ink-soft">{newUploading ? 'Reading your quotes…' : 'Upload quote files'}</p>
          <p className="text-xs text-faint mt-1">Select one or more PDFs/photos — each file becomes a quote. AI reads and compares them.</p>
        </button>
      ) : comparisons.map(comp => {
        const quotes = comp.quotes ?? []
        const totals = quotes.map(q => q.total_amount).filter((n): n is number => n != null)
        const lowest = totals.length ? Math.min(...totals) : null
        const highest = totals.length ? Math.max(...totals) : null
        return (
          <div key={comp.id} className="bg-panel rounded-xl border border-line overflow-hidden">
            <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-2">
              <input
                defaultValue={comp.title}
                onBlur={e => { if (e.target.value.trim() !== comp.title) renameComparison(comp.id, e.target.value) }}
                className="text-sm font-semibold text-ink-soft bg-transparent border-b border-transparent hover:border-line focus:border-accent focus:outline-none min-w-0 flex-1 max-w-xs"
                aria-label="Comparison name"
              />
              <div className="flex items-center gap-2">
                {lowest != null && highest != null && highest > lowest && (
                  <span className="text-xs text-success font-medium">Spread {money(highest - lowest)}</span>
                )}
                <input ref={el => { fileRefs.current[comp.id] = el }} type="file" accept="application/pdf,image/*" multiple className="sr-only"
                  onChange={e => { if (e.target.files?.length) uploadQuotes(comp.id, e.target.files); e.target.value = '' }} />
                <Button size="sm" variant="outline" disabled={uploadingFor === comp.id} onClick={() => fileRefs.current[comp.id]?.click()}>
                  {uploadingFor === comp.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Add quotes</>}
                </Button>
                <button onClick={() => deleteComparison(comp.id)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>

            {/* Requirements + AI analysis */}
            <div className="px-4 sm:px-5 py-3 border-b border-line-soft bg-surface/60 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-1.5 flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> What you need (requirements)</p>
                <textarea
                  rows={2}
                  defaultValue={comp.requirements ?? ''}
                  onBlur={e => { if ((e.target.value ?? '') !== (comp.requirements ?? '')) saveRequirements(comp.id, e.target.value) }}
                  placeholder="e.g. 200A panel upgrade, all permits included, EV-charger rough-in, finish within 3 weeks…"
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none"
                />
                <div className="flex items-center justify-between mt-2">
                  <span className="text-xs text-faint">AI checks each quote against this and flags what's missing.</span>
                  <Button size="sm" disabled={analyzingFor === comp.id || quotes.length === 0} onClick={() => analyze(comp.id)}>
                    {analyzingFor === comp.id ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</> : <><Sparkles className="h-3.5 w-3.5" /> Analyze quotes</>}
                  </Button>
                </div>
              </div>
              {comp.analysis?.recommendation && (
                <div className="rounded-lg bg-accent-tint/50 border border-accent/30 px-3 py-2.5">
                  <p className="text-xs font-semibold text-accent-fg mb-0.5 flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Recommendation</p>
                  <p className="text-sm text-ink-soft">{comp.analysis.recommendation}</p>
                </div>
              )}
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

                      {q.data?.extract_error && (
                        <div className="rounded-lg bg-danger-tint border border-danger/30 px-2.5 py-1.5 text-xs text-danger flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          <span>Couldn't read this file automatically. Open it to view, or delete and re-upload.</span>
                        </div>
                      )}
                      {q.scope_summary && <p className="text-xs text-muted-fg">{q.scope_summary}</p>}

                      {(() => {
                        const ga = comp.analysis?.per_quote?.find(p => p.quote_id === q.id)
                        const isRec = comp.analysis?.recommended_quote_id === q.id
                        if (!ga && !isRec) return null
                        return (
                          <div className="rounded-lg bg-surface border border-line-soft p-2 space-y-1.5">
                            {isRec && <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full bg-accent-tint text-accent-fg px-1.5 py-0.5"><Sparkles className="h-2.5 w-2.5" /> AI pick</span>}
                            {(ga?.missing?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-danger mb-0.5">Missing</p>
                                <ul className="text-xs text-muted-fg space-y-0.5">{ga!.missing!.slice(0, 6).map((x, i) => <li key={i} className="flex gap-1"><AlertTriangle className="h-3 w-3 text-danger shrink-0 mt-0.5" />{x}</li>)}</ul>
                              </div>
                            )}
                            {(ga?.concerns?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-warn mb-0.5">Concerns</p>
                                <ul className="text-xs text-muted-fg space-y-0.5">{ga!.concerns!.slice(0, 4).map((x, i) => <li key={i} className="flex gap-1"><AlertTriangle className="h-3 w-3 text-warn shrink-0 mt-0.5" />{x}</li>)}</ul>
                              </div>
                            )}
                            {(ga?.strengths?.length ?? 0) > 0 && (
                              <div>
                                <p className="text-[10px] font-semibold uppercase tracking-wide text-success mb-0.5">Strengths</p>
                                <ul className="text-xs text-muted-fg space-y-0.5">{ga!.strengths!.slice(0, 4).map((x, i) => <li key={i} className="flex gap-1"><Check className="h-3 w-3 text-success shrink-0 mt-0.5" />{x}</li>)}</ul>
                              </div>
                            )}
                          </div>
                        )
                      })()}

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

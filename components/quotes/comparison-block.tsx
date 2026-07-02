'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Upload, Trophy, Trash2, FileText, Loader2, Check, ExternalLink, Sparkles, AlertTriangle, ClipboardList } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useDeleteGuard } from '@/components/ui/delete-guard'

export interface Quote {
  id: string
  comparison_id: string
  file_url: string | null
  file_name: string | null
  vendor_name: string | null
  total_amount: number | null
  valid_until: string | null
  scope_summary: string | null
  data: { line_items?: any[]; inclusions?: string[]; exclusions?: string[]; payment_terms?: string | null; notes?: string | null; extract_error?: string | null; contact?: { name?: string | null; email?: string | null; phone?: string | null } | null } | null
}
export interface Analysis {
  per_quote?: { quote_id: string; missing?: string[]; strengths?: string[]; concerns?: string[] }[]
  recommendation?: string
  recommended_quote_id?: string | null
}
export interface Comparison {
  id: string
  title: string
  trade: string | null
  bid_request_id?: string | null
  winning_quote_id: string | null
  awarded_subcontract_id: string | null
  requirements: string | null
  analysis: Analysis | null
  quotes: Quote[]
}

const money = (n: number | null) => n == null ? '—' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// Renders the analysis + quote grid + award flow for a single comparison.
// Used standalone and embedded inside a Request Quotes card.
export function ComparisonBlock({ comp, projectId, onChanged }: { comp: Comparison; projectId: string; onChanged: () => void }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const [uploadingFor, setUploadingFor] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [awardTarget, setAwardTarget] = useState<{ quoteId: string; vendor: string } | null>(null)
  const [awarding, setAwarding] = useState(false)
  const [awardType, setAwardType] = useState<'subcontractor' | 'supplier'>('subcontractor')
  const [awardBudget, setAwardBudget] = useState<'none' | 'new' | string>('new')
  const [budgetLines, setBudgetLines] = useState<{ id: string; description: string; category: string; subcontract_id: string | null }[]>([])

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function openAward(quoteId: string, vendor: string) {
    setAwardType('subcontractor'); setAwardBudget('new')
    setAwardTarget({ quoteId, vendor })
    const token = await getToken()
    const res = await fetch(`/api/projects/${projectId}/budget`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setBudgetLines(((await res.json()).items ?? []).filter((l: any) => !l.subcontract_id))
  }

  async function saveRequirements(requirements: string) {
    const token = await getToken()
    await fetch(`/api/projects/${projectId}/quotes/${comp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requirements }),
    })
    onChanged()
  }

  async function analyze() {
    setAnalyzing(true)
    const token = await getToken()
    try {
      const res = await fetch(`/api/projects/${projectId}/quotes/${comp.id}/analyze`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) onChanged()
      else alert((await res.json().catch(() => ({}))).error ?? 'Analysis failed')
    } finally { setAnalyzing(false) }
  }

  // Comparing IS analyzing — as soon as a comparison has quotes, run the AI check
  // automatically so the user never has to click a separate "Analyze" step.
  // Runs once per comparison until an analysis exists; adding quotes later or
  // editing requirements re-enables the manual "Re-analyze" button.
  const autoRan = useRef(false)
  useEffect(() => {
    const readyQuotes = (comp.quotes ?? []).filter(q => q.total_amount != null || (q.data?.line_items?.length ?? 0) > 0)
    if (
      !autoRan.current &&
      !awarding && !analyzing && !uploadingFor &&
      !comp.analysis &&
      !comp.awarded_subcontract_id &&
      readyQuotes.length > 0
    ) {
      autoRan.current = true
      analyze()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id, comp.quotes, comp.analysis, uploadingFor])

  async function uploadOne(file: File) {
    const token = await getToken()
    const form = new FormData(); form.append('file', file)
    const res = await fetch(`/api/projects/${projectId}/quotes/${comp.id}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Upload failed')
  }
  async function uploadQuotes(files: FileList | File[]) {
    setUploadingFor(true)
    try { for (const f of Array.from(files)) await uploadOne(f); onChanged() }
    catch (e: any) { alert(e?.message ?? 'Upload failed'); onChanged() }
    finally { setUploadingFor(false) }
  }

  async function award() {
    if (!awardTarget) return
    setAwarding(true)
    const token = await getToken()
    const body: any = { quote_id: awardTarget.quoteId, vendor_type: awardType }
    if (awardBudget === 'new') body.create_budget_line = true
    else if (awardBudget !== 'none') body.budget_line_id = awardBudget
    const res = await fetch(`/api/projects/${projectId}/quotes/${comp.id}/award`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body),
    })
    setAwarding(false); setAwardTarget(null)
    if (res.ok) onChanged()
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not award')
  }

  async function setWinner(quoteId: string | null) {
    const token = await getToken()
    await fetch(`/api/projects/${projectId}/quotes/${comp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ winning_quote_id: quoteId }),
    })
    onChanged()
  }

  function deleteQuote(quoteId: string, vendor: string | null) {
    guardDelete(async () => {
      const token = await getToken()
      await fetch(`/api/projects/${projectId}/quotes/${comp.id}/${quoteId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
      onChanged()
    }, { label: `the quote from ${vendor ?? 'this vendor'}`, protected: true })
  }

  const quotes = comp.quotes ?? []
  const awarded = !!comp.awarded_subcontract_id
  const totals = quotes.map(q => q.total_amount).filter((n): n is number => n != null)
  const lowest = totals.length ? Math.min(...totals) : null
  const highest = totals.length ? Math.max(...totals) : null

  return (
    <div className="rounded-lg border border-line-soft overflow-hidden">
      {/* Award modal */}
      {awardTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !awarding && setAwardTarget(null)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft"><h2 className="font-semibold text-ink">Award to project</h2></div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-muted-fg">
                Adds <span className="font-medium text-ink-soft">{awardTarget.vendor}</span> to your Directory and creates a contract — the amount flows into Financials, Schedule, and Compliance.
              </p>
              <div>
                <p className="text-sm font-medium text-ink-soft mb-1.5">This vendor is a…</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['subcontractor', 'supplier'] as const).map(t => (
                    <button key={t} onClick={() => setAwardType(t)}
                      className={cn('rounded-lg border p-2.5 text-left transition-colors', awardType === t ? 'border-accent bg-accent-tint/40' : 'border-line hover:bg-surface')}>
                      <p className="text-sm font-semibold text-ink capitalize">{t}</p>
                      <p className="text-xs text-faint mt-0.5">{t === 'supplier' ? 'Materials (e.g. lumber)' : 'Work / labor on site'}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-ink-soft mb-1.5">Budget</p>
                <div className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm text-ink-soft">
                    <input type="radio" className="accent-[#C9F24A]" checked={awardBudget === 'new'} onChange={() => setAwardBudget('new')} />
                    Create a new budget line for this contract
                  </label>
                  {budgetLines.length > 0 && (
                    <label className="flex items-center gap-2 text-sm text-ink-soft">
                      <input type="radio" className="accent-[#C9F24A]" checked={awardBudget !== 'new' && awardBudget !== 'none'} onChange={() => setAwardBudget(budgetLines[0].id)} />
                      Link to an existing budget line:
                      <select disabled={awardBudget === 'new' || awardBudget === 'none'} value={awardBudget === 'new' || awardBudget === 'none' ? '' : awardBudget}
                        onChange={e => setAwardBudget(e.target.value)}
                        className="flex-1 min-w-0 rounded-md border border-line bg-panel px-2 py-1 text-sm disabled:opacity-50">
                        {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} · {l.description}</option>)}
                      </select>
                    </label>
                  )}
                  <label className="flex items-center gap-2 text-sm text-muted-fg">
                    <input type="radio" className="accent-[#C9F24A]" checked={awardBudget === 'none'} onChange={() => setAwardBudget('none')} />
                    Don't add to the budget
                  </label>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="secondary" disabled={awarding} onClick={() => setAwardTarget(null)}>Cancel</Button>
                <Button disabled={awarding} onClick={award}>{awarding ? 'Awarding…' : 'Award'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Requirements + AI analysis */}
      <div className="px-4 py-3 border-b border-line-soft bg-surface/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint flex items-center gap-1"><ClipboardList className="h-3.5 w-3.5" /> Compare responses{lowest != null && highest != null && highest > lowest ? <span className="text-success ml-1">· spread {money(highest - lowest)}</span> : null}</p>
          {awarded ? (
            <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-success-tint text-success inline-flex items-center gap-1"><Check className="h-3 w-3" /> Awarded — locked</span>
          ) : (
            <>
              <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple className="sr-only"
                onChange={e => { if (e.target.files?.length) uploadQuotes(e.target.files); e.target.value = '' }} />
              <Button size="sm" variant="outline" disabled={uploadingFor} onClick={() => fileRef.current?.click()}>
                {uploadingFor ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading…</> : <><Upload className="h-3.5 w-3.5" /> Add quote</>}
              </Button>
            </>
          )}
        </div>
        <div>
          <textarea rows={2} defaultValue={comp.requirements ?? ''}
            onBlur={e => { if ((e.target.value ?? '') !== (comp.requirements ?? '')) saveRequirements(e.target.value) }}
            placeholder="What you need (requirements) — e.g. 200A panel, all permits included, finish in 3 weeks…"
            className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-faint">AI checks each quote against this automatically. Re-run after changing requirements.</span>
            <Button size="sm" variant={comp.analysis ? 'outline' : 'default'} disabled={analyzing || quotes.length === 0 || awarded} onClick={analyze}>
              {analyzing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing…</> : <><Sparkles className="h-3.5 w-3.5" /> {comp.analysis ? 'Re-analyze' : 'Analyze quotes'}</>}
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
        <div className="p-6 text-center text-sm text-faint">{uploadingFor ? 'Reading quote…' : 'No quotes yet.'}</div>
      ) : (
        <div className="p-4 grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(quotes.length, 3)}, minmax(0, 1fr))` }}>
          {quotes.map(q => {
            const isLowest = q.total_amount != null && q.total_amount === lowest && totals.length > 1
            const isWinner = comp.winning_quote_id === q.id
            return (
              <div key={q.id} className={cn('rounded-xl border p-4 flex flex-col gap-3 min-w-0', isWinner ? 'border-accent ring-1 ring-accent bg-accent-tint/30' : 'border-line')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink truncate">{q.vendor_name ?? 'Unknown vendor'}</p>
                    {q.file_name && (
                      <a href={q.file_url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-accent-fg hover:underline inline-flex items-center gap-1">
                        <FileText className="h-3 w-3" /> {q.file_name} <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    )}
                  </div>
                  <button onClick={() => deleteQuote(q.id, q.vendor_name)} className="p-1 rounded text-faint hover:text-danger shrink-0"><X className="h-3.5 w-3.5" /></button>
                </div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className={cn('text-2xl font-bold', isLowest ? 'text-success' : 'text-ink')}>{money(q.total_amount)}</span>
                    {isLowest && <span className="text-[10px] font-semibold rounded-full bg-success-tint text-success px-1.5 py-0.5">Lowest</span>}
                  </div>
                  {q.valid_until && <p className="text-xs text-faint">Valid until {new Date(q.valid_until + 'T00:00:00').toLocaleDateString()}</p>}
                </div>
                {(q.data?.contact?.name || q.data?.contact?.email || q.data?.contact?.phone) && (
                  <p className="text-xs text-muted-fg">
                    {q.data?.contact?.name && <span className="font-medium text-ink-soft">{q.data.contact.name}</span>}
                    {q.data?.contact?.phone && <span> · {q.data.contact.phone}</span>}
                    {q.data?.contact?.email && <span> · {q.data.contact.email}</span>}
                  </p>
                )}
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
                <div className="mt-auto pt-2 space-y-1.5">
                  {awarded ? (
                    isWinner ? (
                      <div className="rounded-lg bg-success-tint text-success text-xs font-medium px-2.5 py-2 text-center flex items-center justify-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> Awarded — added to the project
                      </div>
                    ) : (
                      <div className="rounded-lg bg-muted text-muted-fg text-xs font-medium px-2.5 py-2 text-center">Not selected</div>
                    )
                  ) : (
                    <>
                      {isWinner ? (
                        <Button size="sm" variant="secondary" className="w-full" onClick={() => setWinner(null)}>
                          <Trophy className="h-3.5 w-3.5 text-accent-fg" /> Winner — clear
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => setWinner(q.id)}>
                          <Trophy className="h-3.5 w-3.5" /> Mark winner
                        </Button>
                      )}
                      {!comp.awarded_subcontract_id && (
                        <Button size="sm" className="w-full" disabled={q.total_amount == null} onClick={() => openAward(q.id, q.vendor_name ?? comp.title)}>
                          Award to project
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

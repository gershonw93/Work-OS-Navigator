'use client'

import { ContactPicker } from '@/components/contact-picker'
import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { fetchProblem } from '@/lib/fetch-error'
import { lotTag } from '@/lib/lot-details'
import { cn } from '@/lib/utils'
import { AlertCircle, Check, CheckCircle2, Layers, X, XCircle } from 'lucide-react'
import {
  boardCells, boardColumns, boardCounts, bulkMisfit, bulkProblem, cellMatches, PERMIT_TYPES,
  type BoardCell, type BoardFilter, type BoardPermit, type BulkAction,
} from '@/lib/permit-board'
import { todayIso, type PermitItem, type PermitRound, type PermitShare } from '@/lib/permit-rounds'
import { PermitPanel, STANDING_CHIP } from './permit-panel'
import type { PermitReply } from '@/lib/permit-reply'

// ─────────────────────────────────────────────────────────────────────────────
// Every house in a development against every permit type, and who has each
// one now. Shown on a development's Permits tab, above the development's own
// permits. Rules: lib/permit-board.ts and lib/permit-rounds.ts.
// ─────────────────────────────────────────────────────────────────────────────

export interface BoardHouse {
  id: string; name: string; unit?: string | null; floor?: string | null
  lot?: string | null; block?: string | null; status?: string | null
}

export interface BoardData {
  site: { id: string; name: string }
  houses: BoardHouse[]
  permits: (BoardPermit & { description?: string | null; issued_date?: string | null; expiry_date?: string | null; file_url?: string | null })[]
  rounds: PermitRound[]
  items: PermitItem[]
  shares?: PermitShare[]
  replies?: PermitReply[]
  history: boolean
}

interface Row { id: string; name: string; tag: string | null; isSite: boolean }

const FILTERS: { key: BoardFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'them', label: 'With the city' },
  { key: 'chase', label: 'Chase' },
  { key: 'us', label: 'With us' },
  { key: 'done', label: 'Done' },
]

async function token() {
  const { data: { session } } = await createClient().auth.getSession()
  return session?.access_token ?? ''
}

// A status is a dot and a word, not a pill: a grid of pills is a wall of
// boxes, and the colour only has to say one thing.
const DOT: Record<string, string> = {
  neutral: 'bg-muted2', info: 'bg-info', warn: 'bg-warn', danger: 'bg-danger', success: 'bg-success',
}
const WORD: Record<string, string> = {
  neutral: 'text-muted-fg', info: 'text-ink', warn: 'text-warn', danger: 'text-danger', success: 'text-ink-soft',
}

function CellChip({ cell, onOpen, faded }: { cell: BoardCell | undefined; onOpen: () => void; faded: boolean }) {
  if (!cell) return <span className="text-xs text-faint">None</span>
  const tone = cell.standing.chase ? 'warn' : cell.standing.tone
  return (
    <button type="button" onClick={onOpen}
      title={cell.standing.label + (cell.others ? ` (+${cell.others} more of this type)` : '')}
      className={cn('-mx-2 inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-md px-2 text-sm hover:bg-surface',
        WORD[tone], faded && 'opacity-30')}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      {cell.standing.chase ? `Chase · ${cell.standing.short.replace('With city · ', '')}` : cell.standing.short}
      {cell.others > 0 && <span className="text-faint">+{cell.others}</span>}
    </button>
  )
}

/** The panel a cell opens: the same one the Permits list opens, as a drawer. */
function PermitDrawer({ data, rowName, permitId, canEdit, onChanged, onClose }: {
  data: BoardData; rowName: string; permitId: string; canEdit: boolean; onChanged: () => void; onClose: () => void
}) {
  const permit = data.permits.find(p => p.id === permitId)
  if (!permit) return null
  return (
    <PermitPanel projectId={permit.project_id} permit={permit} title={rowName}
      rounds={data.rounds.filter(r => r.permit_id === permit.id)}
      items={data.items.filter(i => i.permit_id === permit.id)}
      shares={(data.shares ?? []).filter(x => x.permit_id === permit.id)}
      replies={(data.replies ?? []).filter(x => x.permit_id === permit.id)}
      historyOk={data.history} canEdit={canEdit} docked={false} onChanged={onChanged} onClose={onClose} />
  )
}

/** One action across many houses. */
function BulkDialog({ data, rows, cells, onClose, onDone }: {
  data: BoardData; rows: Row[]; cells: Map<string, Map<string, BoardCell>>; onClose: () => void; onDone: () => void
}) {
  const [action, setAction] = useState<BulkAction>('submit')
  const [type, setType] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [submittedOn, setSubmittedOn] = useState(todayIso())
  const [expectedBy, setExpectedBy] = useState('')
  const [outcome, setOutcome] = useState<'corrections' | 'rejected' | ''>('')
  const [outcomeOn, setOutcomeOn] = useState(todayIso())
  const [itemsText, setItemsText] = useState('')
  const [authority, setAuthority] = useState('')
  // Adding: several types at once, each house getting every one it lacks.
  // One issuing authority for them all, or one per type ("some yes, some not").
  const [addTypes, setAddTypes] = useState<string[]>([])
  const [sameAuthority, setSameAuthority] = useState(true)
  const [authorityFor, setAuthorityFor] = useState<Record<string, string>>({})
  // A permit that is not on the list: named here, then a chip like the rest.
  const [customTypes, setCustomTypes] = useState<string[]>([])
  const [customName, setCustomName] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<{ name: string; ok: boolean; message: string }[] | null>(null)

  const existingTypes = boardColumns(data.permits)
  const typeOptions = action === 'add'
    ? Array.from(new Set([...existingTypes, ...PERMIT_TYPES.filter(t => t !== 'Other'), ...customTypes]))
    : existingTypes

  // Which houses this action makes sense for, so "select those" picks the
  // right twenty instead of making somebody tick them one at a time.
  // Why a house cannot be ticked for what is being done (null = it can).
  const misfit = (a: BulkAction, t: string, r: Row, adding: string[] = addTypes): string | null => {
    if (a === 'add') return adding.length && adding.every(x => cells.get(r.id)?.get(x)) ? 'Has them all' : null
    return bulkMisfit(a, t, cells.get(r.id)?.get(t)?.standing)
  }
  const fitsFor = (a: BulkAction, t: string, adding: string[] = addTypes) => rows.filter(r => !misfit(a, t, r, adding))
  const fitting = fitsFor(action, type)

  function choose(next: { action?: BulkAction; type?: string; addTypes?: string[] }) {
    const a = next.action ?? action, t = next.type ?? type, adding = next.addTypes ?? addTypes
    setAction(a); setType(t); setAddTypes(adding); setError('')
    // Re-pick on every change of what is being done: a selection made for
    // "log submission" is the wrong twenty for "record an answer".
    const ready = a === 'add' ? adding.length > 0 : !!t
    setPicked(new Set(ready ? fitsFor(a, t, adding).map(r => r.id) : []))
  }
  function addCustom() {
    const name = customName.trim().replace(/\s+/g, ' ')
    if (!name) return
    // Same name as one already offered, whatever the case: pick that one.
    const known = typeOptions.find(t => t.toLowerCase() === name.toLowerCase())
    const t = known ?? name
    if (!known) setCustomTypes(prev => [...prev, t])
    setCustomName('')
    if (!addTypes.includes(t)) choose({ addTypes: [...addTypes, t] })
  }
  const toggleAddType = (t: string) =>
    choose({ addTypes: addTypes.includes(t) ? addTypes.filter(x => x !== t) : [...addTypes, t] })
  const authorityOf = (t: string) => (sameAuthority ? authority : authorityFor[t] ?? authority).trim()

  const togglePick = (id: string) => setPicked(prev => {
    const r = rows.find(x => x.id === id)
    if (r && misfit(action, type, r) && !prev.has(id)) return prev
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n
  })

  // Several types: the same one-type request per type, so every house still
  // goes through exactly the write a single permit does, and each answer names
  // the type it was about.
  async function runAdd() {
    if (!addTypes.length) { setError('Pick at least one permit type.'); return }
    if (!picked.size) { setError('Pick at least one house.'); return }
    const missing = addTypes.find(t => !authorityOf(t))
    if (missing) { setError(sameAuthority ? 'Add who is issuing them - every new permit needs something to tell it apart.' : `Add who issues the ${missing} permit.`); return }
    setSaving(true); setError('')
    const all: { name: string; ok: boolean; message: string }[] = []
    try {
      for (const t of addTypes) {
        const ids = Array.from(picked).filter(id => !cells.get(id)?.get(t))
        const skipped = Array.from(picked).filter(id => cells.get(id)?.get(t))
        skipped.forEach(id => all.push({ name: `${rows.find(r => r.id === id)?.name ?? 'House'} - ${t}`, ok: false, message: `Already has a ${t} permit` }))
        if (!ids.length) continue
        try {
          const res = await fetch(`/api/projects/${data.site.id}/permit-board`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
            body: JSON.stringify({ action: 'add', permit_type: t, project_ids: ids, issuing_authority: authorityOf(t) }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok) { ids.forEach(id => all.push({ name: `${rows.find(r => r.id === id)?.name ?? 'House'} - ${t}`, ok: false, message: json.error ?? `Could not save (${res.status})` })); continue }
          for (const r of json.results ?? []) all.push({ ...r, name: `${r.name} - ${t}` })
        } catch (e) {
          // One type that did not come back must not hide the others' answers.
          ids.forEach(id => all.push({ name: `${rows.find(r => r.id === id)?.name ?? 'House'} - ${t}`, ok: false, message: fetchProblem(e, `adding ${t}`) }))
        }
      }
      setResults(all)
    } finally {
      setSaving(false)
      onDone()
    }
  }

  async function run() {
    if (action === 'add') return runAdd()
    const items = itemsText.split('\n')
    const problem = bulkProblem({ action, permit_type: type, project_ids: Array.from(picked), outcome: action === 'answer' ? outcome : null, items })
    if (problem) { setError(problem); return }
    if (action === 'submit' && !submittedOn) { setError('Add the date it was submitted.'); return }
    if (action === 'answer' && !outcomeOn) { setError('Add the date they answered.'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/projects/${data.site.id}/permit-board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({
          action, permit_type: type, project_ids: Array.from(picked), note: note || null,
          submitted_on: submittedOn, expected_by: expectedBy || null,
          outcome: outcome || null, outcome_on: outcomeOn, items,
          issuing_authority: authority || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? `Could not save (${res.status})`); return }
      setResults(json.results ?? [])
    } catch (e) {
      setError(fetchProblem(e, 'updating the houses'))
    } finally {
      setSaving(false)
      onDone()
    }
  }

  const label = (a: BulkAction) => a === 'add' ? 'Add a permit' : a === 'submit' ? 'Mark as sent' : 'Record an answer'

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={onClose}>
      <div className="w-full min-w-0 max-w-full sm:max-w-xl overflow-y-auto rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-3">
          <h2 className="min-w-0 truncate font-semibold text-ink">Update several houses</h2>
          <button type="button" onClick={onClose} aria-label="Close" title="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-faint hover:text-ink lg:h-9 lg:w-9">
            <X className="h-5 w-5" />
          </button>
        </div>

        {results ? (
          <div className="space-y-3 px-5 py-5">
            <p className="text-sm font-medium text-ink">
              {results.filter(r => r.ok).length} of {results.length} done.
              {results.some(r => !r.ok) && ' The rest were left alone - each says why.'}
            </p>
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 px-3 py-2 text-sm">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />}
                  <span className="min-w-0 flex-1"><span className="font-medium text-ink">{r.name}</span><span className="text-muted-fg"> - {r.message}</span></span>
                </div>
              ))}
            </div>
            <div className="flex justify-end"><Button onClick={onClose}>Done</Button></div>
          </div>
        ) : (
          <>
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-1.5">
                <Label>What happened? <span className="text-danger">*</span></Label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(['submit', 'answer', 'add'] as BulkAction[]).map(a => (
                    <button key={a} type="button" onClick={() => choose({ action: a })}
                      className={cn('min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium',
                        action === a ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                      {label(a)}
                    </button>
                  ))}
                </div>
              </div>

              {action === 'add' ? (
                <div className="space-y-1.5">
                  <Label>Permit types <span className="text-danger">*</span> <span className="font-normal text-faint">- pick as many as you need</span></Label>
                  <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto rounded-lg border border-line p-2">
                    {typeOptions.map(t => {
                      const on = addTypes.includes(t)
                      return (
                        <button key={t} type="button" onClick={() => toggleAddType(t)} aria-pressed={on}
                          className={cn('inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm',
                            on ? 'border-accent bg-accent-tint font-medium text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                          {on && <Check className="h-3.5 w-3.5" />}{t}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2">
                    <Input value={customName} onChange={e => setCustomName(e.target.value)} maxLength={60}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
                      placeholder="Not on the list? Name it, e.g. Tree Removal" />
                    <Button type="button" variant="outline" className="shrink-0" onClick={addCustom}>Add</Button>
                  </div>
                </div>
              ) : (
              <div className="space-y-1.5">
                <Label>Permit type <span className="text-danger">*</span></Label>
                <SearchableSelect value={type} onChange={e => choose({ type: e.target.value })}
                  className="w-full rounded-md border border-muted2 bg-panel px-3 py-2 text-sm focus:border-accent focus:outline-none">
                  <option value="">-- Select permit type --</option>
                  {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
                </SearchableSelect>
              </div>
              )}

              {action === 'submit' && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Submitted on <span className="text-danger">*</span></Label>
                    <Input type="date" value={submittedOn} onChange={e => setSubmittedOn(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Answer expected by <span className="text-faint font-normal">(optional)</span></Label>
                    <Input type="date" value={expectedBy} onChange={e => setExpectedBy(e.target.value)} />
                  </div>
                </div>
              )}

              {action === 'answer' && (
                <>
                  <div className="space-y-1.5">
                    <Label>What did they say? <span className="text-danger">*</span></Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['corrections', 'rejected'] as const).map(o => (
                        <button key={o} type="button" onClick={() => setOutcome(o)}
                          className={cn('min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm font-medium',
                            outcome === o ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2')}>
                          {o === 'corrections' ? 'Corrections needed' : 'Rejected'}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-fg">Approvals are recorded house by house - each permit has its own number and issue date.</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Answered on <span className="text-danger">*</span></Label>
                    <Input type="date" value={outcomeOn} onChange={e => setOutcomeOn(e.target.value)} />
                  </div>
                  {outcome === 'corrections' && (
                    <div className="space-y-1.5">
                      <Label>What they asked for <span className="text-danger">*</span></Label>
                      <textarea rows={4} value={itemsText} onChange={e => setItemsText(e.target.value)}
                        placeholder="One per line - every house picked gets the list"
                        className="w-full resize-y rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                    </div>
                  )}
                </>
              )}

              {action === 'add' && (
                <div className="space-y-2">
                  <Label>Issuing authority <span className="text-danger">*</span></Label>
                  {addTypes.length > 1 && (
                    <div className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
                      {([[true, 'Same for all'], [false, 'Different per type']] as const).map(([v, l]) => (
                        <button key={l} type="button" onClick={() => setSameAuthority(v)}
                          className={cn('min-h-9 rounded-md px-2 text-sm', sameAuthority === v ? 'bg-panel font-medium text-ink shadow-sm' : 'text-muted-fg hover:text-ink')}>
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* From the Directory: the exact card name is what Email it looks the address up by. */}
                  {sameAuthority || addTypes.length < 2 ? (
                    <ContactPicker filterType="inspector" value={authority} onChange={name => setAuthority(name)} placeholder="Search your Directory, e.g. Lakewood Township" />
                  ) : (
                    <div className="space-y-2">
                      {addTypes.map(t => (
                        <div key={t} className="grid grid-cols-1 items-center gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-3">
                          <span className="truncate text-sm font-medium text-ink-soft">{t}</span>
                          <ContactPicker filterType="inspector" value={authorityFor[t] ?? authority}
                            onChange={name => setAuthorityFor(prev => ({ ...prev, [t]: name }))} placeholder="Search your Directory" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {action !== 'add' && (
                <div className="space-y-1.5">
                  <Label>{action === 'submit' ? 'What was sent' : 'Notes'} <span className="text-faint font-normal">(optional)</span></Label>
                  <textarea rows={2} value={note} onChange={e => setNote(e.target.value)}
                    className="w-full resize-none rounded-md border border-muted2 px-3 py-2 text-sm focus:border-accent focus:outline-none" />
                  <p className="text-xs text-muted-fg">Files go on each house&apos;s permit - open a cell to attach the letter.</p>
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label>Houses <span className="text-danger">*</span></Label>
                  {(action === 'add' ? addTypes.length > 0 : !!type) && (
                    <div className="flex gap-3 text-xs">
                      <button type="button" className="text-accent-fg hover:underline" onClick={() => setPicked(new Set(fitting.map(r => r.id)))}>
                        Select the {fitting.length} that fit
                      </button>
                      <button type="button" className="text-muted-fg hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
                    </div>
                  )}
                </div>
                {!(action === 'add' ? addTypes.length > 0 : !!type) ? (
                  <p className="text-sm text-muted-fg">Pick the permit type first - the houses it fits are selected for you.</p>
                ) : action === 'add' ? (
                  <div className="max-h-64 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                    {rows.map(r => {
                      const has = addTypes.filter(t => cells.get(r.id)?.get(t))
                      const why = misfit('add', type, r)
                      return (
                        <label key={r.id} className={cn('flex min-h-11 items-center gap-3 px-3 py-1.5', why ? 'cursor-not-allowed bg-surface/60' : 'cursor-pointer')}>
                          <input type="checkbox" checked={picked.has(r.id)} disabled={!!why && !picked.has(r.id)} onChange={() => togglePick(r.id)} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1 truncate text-sm text-ink">{r.name}{r.tag ? <span className="text-faint"> · {r.tag}</span> : null}</span>
                          <span className="whitespace-nowrap text-xs text-faint">
                            {has.length === 0 ? 'Has none' : has.length === addTypes.length ? 'Has them all' : `Has ${has.join(', ')}`}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                ) : (
                  <div className="max-h-64 divide-y divide-line-soft overflow-y-auto rounded-lg border border-line">
                    {rows.map(r => {
                      const cell = cells.get(r.id)?.get(type)
                      const why = misfit(action, type, r)
                      return (
                        <label key={r.id} className={cn('flex min-h-11 items-center gap-3 px-3 py-1.5', why ? 'cursor-not-allowed bg-surface/60' : 'cursor-pointer')}>
                          <input type="checkbox" checked={picked.has(r.id)} disabled={!!why && !picked.has(r.id)} onChange={() => togglePick(r.id)} className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className={cn('block truncate text-sm', why ? 'text-faint' : 'text-ink')}>{r.name}{r.tag ? <span className="text-faint"> · {r.tag}</span> : null}</span>
                            {why && <span className="block truncate text-xs text-muted-fg">{why}</span>}
                          </span>
                          <span className={cn('whitespace-nowrap rounded-full border px-2 py-0.5 text-xs', cell ? STANDING_CHIP[cell.standing.tone] : 'border-line text-faint')}>
                            {cell ? cell.standing.short : 'None'}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2 border-t border-line-soft px-5 py-4">
              {/* Big enough to be seen: a one-line 12px note under a long form read as "the button did nothing". */}
              {error && <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-tint px-3 py-2 text-sm text-danger"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
              <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={run} disabled={saving}>
                  {saving ? 'Working...' : action === 'add' && addTypes.length > 1
                    ? `Add ${addTypes.length} permits${picked.size ? ` to ${picked.size}` : ''}`
                    : `${label(action)}${picked.size ? ` for ${picked.size}` : ''}`}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export function PermitBoard({ data, canEdit, onChanged }: { data: BoardData; canEdit: boolean; onChanged: () => void }) {
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [open, setOpen] = useState<{ permitId: string; rowName: string } | null>(null)
  const [bulk, setBulk] = useState(false)
  const today = todayIso()

  const cells = useMemo(() => boardCells(data.permits, data.rounds, data.items, today), [data, today])
  const columns = useMemo(() => boardColumns(data.permits), [data.permits])
  const [phoneType, setPhoneType] = useState<string | null>(null)
  const activeType = phoneType && columns.includes(phoneType) ? phoneType : columns[0] ?? null
  const counts = boardCounts(cells)

  // The development's own permits are a row of their own, at the top.
  const rows: Row[] = [
    ...(cells.has(data.site.id) ? [{ id: data.site.id, name: `${data.site.name} (shared)`, tag: null, isSite: true }] : []),
    ...data.houses.map(h => ({ id: h.id, name: h.name, tag: lotTag(h), isSite: false })),
  ]
  const shown = filter === 'all' ? rows : rows.filter(r => columns.some(c => cellMatches(cells.get(r.id)?.get(c), filter)))

  if (!data.history) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-tint px-4 py-3 text-sm text-danger">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        Could not load the permits&apos; submissions, so this board cannot say who has what. Reload to try again.
      </div>
    )
  }

  return (
    <section className="space-y-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink"><Layers className="h-5 w-5 text-faint" /> Every house</h2>
          <p className="text-sm text-muted-fg">Who has each permit right now. Tap one to see its history or record what happened.</p>
        </div>
        {canEdit && data.houses.length > 0 && <Button variant="outline" onClick={() => setBulk(true)}>Update several houses</Button>}
      </div>

      {data.houses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted-fg">No houses in this development yet.</p>
      ) : (
        <>
          <div className="scroll-fade flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(f => {
              const n = f.key === 'all' ? null : counts[f.key as Exclude<BoardFilter, 'all'>]
              return (
                <button key={f.key} type="button" onClick={() => setFilter(f.key)}
                  className={cn('min-h-9 shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-sm',
                    filter === f.key ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-muted-fg hover:border-muted2',
                    f.key === 'chase' && n ? 'text-warn' : '')}>
                  {f.label}{n != null ? ` ${n}` : ''}
                </button>
              )
            })}
          </div>

          {columns.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted-fg">
              No permits on these houses yet. Use Update several houses to add one to all of them at once.
            </p>
          ) : (
            <>
              {/* Phone: one permit type at a time, houses as rows. */}
              <div className="space-y-2 lg:hidden">
                <div className="scroll-fade flex gap-2 overflow-x-auto pb-1">
                  {columns.map(c => (
                    <button key={c} type="button" onClick={() => setPhoneType(c)}
                      className={cn('min-h-9 shrink-0 whitespace-nowrap rounded-lg border px-3 py-1 text-sm',
                        activeType === c ? 'border-ink bg-surface font-medium text-ink' : 'border-line text-muted-fg')}>
                      {c}
                    </button>
                  ))}
                </div>
                <div className="divide-y divide-line-soft rounded-2xl border border-line bg-panel">
                  {shown.map(r => {
                    const cell = activeType ? cells.get(r.id)?.get(activeType) : undefined
                    return (
                      <div key={r.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                          {r.tag && <p className="truncate text-xs text-faint">{r.tag}</p>}
                        </div>
                        <CellChip cell={cell} faded={!cellMatches(cell, filter)}
                          onOpen={() => cell && setOpen({ permitId: cell.permit.id, rowName: r.name })} />
                      </div>
                    )
                  })}
                  {shown.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-fg">Nothing here.</p>}
                </div>
              </div>

              {/* Desktop: the grid. */}
              <div className="hidden lg:block overflow-x-auto rounded-2xl border border-line bg-panel">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left">
                      <th className="sticky left-0 w-[30%] bg-panel px-5 py-3 text-xs font-medium uppercase tracking-wide text-faint">House</th>
                      {columns.map(c => {
                        const have = rows.filter(r => cells.get(r.id)?.get(c)).length
                        const done = rows.filter(r => cellMatches(cells.get(r.id)?.get(c), 'done')).length
                        return (
                          <th key={c} className="px-5 py-3 align-bottom font-normal">
                            <span className="block text-xs font-medium uppercase tracking-wide text-faint">{c}</span>
                            <span className="block text-xs text-muted-fg">{done} of {have} done</span>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {shown.map(r => (
                      <tr key={r.id} className="group">
                        <td className="sticky left-0 bg-panel px-5 py-3 group-hover:bg-surface">
                          <span className="font-medium text-ink">{r.name}</span>
                          {r.tag && <span className="ml-2 text-xs text-faint">{r.tag}</span>}
                        </td>
                        {columns.map(c => {
                          const cell = cells.get(r.id)?.get(c)
                          return (
                            <td key={c} className="px-5 py-3 group-hover:bg-surface">
                              <CellChip cell={cell} faded={filter !== 'all' && !cellMatches(cell, filter)}
                                onOpen={() => cell && setOpen({ permitId: cell.permit.id, rowName: r.name })} />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                    {shown.length === 0 && (
                      <tr><td colSpan={columns.length + 1} className="px-5 py-6 text-center text-muted-fg">Nothing here.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {open && (
        <PermitDrawer data={data} rowName={open.rowName} permitId={open.permitId} canEdit={canEdit}
          onChanged={onChanged} onClose={() => setOpen(null)} />
      )}
      {bulk && (
        <BulkDialog data={data} rows={rows} cells={cells} onClose={() => setBulk(false)} onDone={onChanged} />
      )}
    </section>
  )
}

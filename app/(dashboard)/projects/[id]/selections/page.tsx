'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import {
  Palette, Plus, Trash2, Link2, CheckCircle2, AlertTriangle, Clock, X,
  ChevronDown, ChevronRight, ExternalLink, Sparkles, GitPullRequest, Loader2,
} from 'lucide-react'
import {
  SELECTION_CATEGORIES, SELECTION_STATUSES, STATUS_TINT, PROJECT_TYPE_LABEL,
  categoryDef, daysUntil, isOutstanding, urgency, variance,
  recommendedCategories, seedRowCount, itemsForType, isHomeType,
  type SelectionStatus,
} from '@/lib/selections'

const money = (n: number | null | undefined) =>
  n == null ? '-' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

interface Option {
  id: string; name: string; description: string | null; price: number | null
  vendor: string | null; link_url: string | null; is_allowance: boolean
}
interface Selection {
  id: string; category: string; item: string; location: string | null
  allowance_amount: number | null; budget_line_item_id: string | null
  needed_by: string | null; lead_time_days: number | null
  status: SelectionStatus; selected_name: string | null; selected_price: number | null
  selected_at: string | null; selected_by_name: string | null
  change_order_id: string | null; notes: string | null
  selection_options: Option[]
}

export default function SelectionsPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const [rows, setRows] = useState<Selection[]>([])
  const [budgetLines, setBudgetLines] = useState<any[]>([])
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState(false)
  const [linking, setLinking] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [projectType, setProjectType] = useState<string | null>(null)
  const [showSeed, setShowSeed] = useState(false)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<'outstanding' | 'all'>('outstanding')
  const [needsMigration, setNeedsMigration] = useState(false)

  // add form
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState({ category: SELECTION_CATEGORIES[0].category, item: '', location: '', allowance_amount: '', needed_by: '', budget_line_item_id: '' })
  const [saving, setSaving] = useState(false)

  // option drafts, per selection
  const [optDraft, setOptDraft] = useState<Record<string, { name: string; price: string; vendor: string; link_url: string }>>({})

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections`, { headers: { Authorization: `Bearer ${t}` } })
    if (res.ok) {
      const d = await res.json()
      setRows(d.selections ?? [])
      setBudgetLines(d.budget_lines ?? [])
      setPortalToken(d.portal_token ?? null)
      setClientName(d.client_name ?? null)
      setNeedsMigration(!!d.needs_migration)
      setProjectType(d.project_type ?? null)
    }
    setLoading(false)
  }
  useEffect(() => { setOrigin(window.location.origin); load() }, [params.id])

  async function patch(id: string, body: any) {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify(body),
    })
    if (res.ok) load()
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not save')
  }

  function openSeed() {
    setPicked(new Set(recommendedCategories(projectType)))
    setShowSeed(true)
  }

  async function seed() {
    setSeeding(true)
    const t = await token()
    await fetch(`/api/projects/${params.id}/selections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ seed: true, categories: Array.from(picked) }),
    })
    setSeeding(false)
    setShowSeed(false)
    load()
  }

  async function add() {
    if (!form.item.trim()) return
    setSaving(true)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        category: form.category, item: form.item, location: form.location || null,
        allowance_amount: form.allowance_amount === '' ? null : Number(form.allowance_amount),
        needed_by: form.needed_by || null,
        budget_line_item_id: form.budget_line_item_id || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ category: form.category, item: '', location: '', allowance_amount: '', needed_by: '', budget_line_item_id: '' })
      setShowAdd(false); load()
    } else alert((await res.json().catch(() => ({}))).error ?? 'Could not add')
  }

  async function addOption(selId: string) {
    const d = optDraft[selId]
    if (!d?.name?.trim()) return
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections/${selId}/options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ name: d.name, price: d.price === '' ? null : Number(d.price), vendor: d.vendor || null, link_url: d.link_url || null }),
    })
    if (res.ok) { setOptDraft(p => ({ ...p, [selId]: { name: '', price: '', vendor: '', link_url: '' } })); load() }
  }

  async function removeOption(selId: string, optionId: string) {
    const t = await token()
    await fetch(`/api/projects/${params.id}/selections/${selId}/options?optionId=${optionId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${t}` },
    })
    load()
  }

  function remove(sel: Selection) {
    guardDelete(async () => {
      const t = await token()
      await fetch(`/api/projects/${params.id}/selections/${sel.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } })
      load()
    }, { label: `the "${sel.item}" selection` })
  }

  // Copy the link the client picks on. A project that has never been shared has
  // no portal token yet, and hiding the button in that case would quietly
  // remove the whole point of the board - so mint one.
  //
  // Only ever when there ISN'T one: POST regenerates the token, which would
  // silently kill a portal link already sent.
  async function copyClientLink() {
    let tok = portalToken
    if (!tok) {
      setLinking(true)
      const t = await token()
      const res = await fetch(`/api/projects/${params.id}/portal-token`, {
        method: 'POST', headers: { Authorization: `Bearer ${t}` },
      })
      setLinking(false)
      if (!res.ok) { alert('Could not create a client link for this project.'); return }
      tok = (await res.json()).token
      setPortalToken(tok ?? null)
    }
    navigator.clipboard?.writeText(`${origin}/portal/${tok}/selections`)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const shown = useMemo(
    () => filter === 'all' ? rows : rows.filter(r => isOutstanding(r.status)),
    [rows, filter])

  const byCategory = useMemo(() => {
    const m = new Map<string, Selection[]>()
    for (const r of shown) {
      if (!m.has(r.category)) m.set(r.category, [])
      m.get(r.category)!.push(r)
    }
    return Array.from(m.entries())
  }, [shown])

  // The three numbers worth knowing at a glance: what's still owed, what's
  // already late, and how far the picks have run past the allowances.
  const stats = useMemo(() => {
    const outstanding = rows.filter(r => isOutstanding(r.status))
    const late = outstanding.filter(r => urgency(r) === 'late')
    const over = rows.reduce((sum, r) => sum + Math.max(0, variance(r) ?? 0), 0)
    const under = rows.reduce((sum, r) => sum + Math.min(0, variance(r) ?? 0), 0)
    return { outstanding: outstanding.length, late: late.length, net: over + under, total: rows.length }
  }, [rows])

  const portalLink = portalToken ? `${origin}/portal/${portalToken}/selections` : null

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Selections</h1>
          <p className="text-sm text-muted-fg mt-0.5">
            The choices that aren&apos;t yours to make. Each one has an allowance and a date driven by
            lead time - so nobody finds out the windows weren&apos;t ordered the week they were due on site.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className="gap-1.5" onClick={copyClientLink} disabled={linking}>
            {linking ? <Loader2 className="h-4 w-4 animate-spin" />
              : copied ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Link2 className="h-4 w-4" />}
            {linking ? 'Creating link…' : copied ? 'Copied' : 'Copy client link'}
          </Button>
          <Button onClick={() => setShowAdd(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> Add selection</Button>
        </div>
      </div>

      {needsMigration && (
        <p className="flex items-start gap-2 rounded-xl border border-warn/40 bg-warn-tint px-4 py-3 text-sm text-warn">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Selections needs one database migration before it can save anything. Run
          <code className="mx-1 font-mono text-xs">_combined_008-068.sql</code> in the Supabase SQL editor.
        </p>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Still owed" value={String(stats.outstanding)} tone={stats.outstanding ? 'warn' : 'ok'} />
          <Stat label="Past due" value={String(stats.late)} tone={stats.late ? 'danger' : 'ok'} />
          <Stat label="Decided" value={`${stats.total - stats.outstanding} of ${stats.total}`} tone="ok" />
          <Stat label="Over allowance" value={stats.net === 0 ? '-' : money(stats.net)} tone={stats.net > 0 ? 'danger' : 'ok'} />
        </div>
      )}

      {showAdd && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                {SELECTION_CATEGORIES.map(c => <option key={c.category} value={c.category}>{c.category}</option>)}
                <option value="Other">Other</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>What&apos;s being chosen <span className="text-danger">*</span></Label>
              <Input value={form.item} onChange={e => setForm(p => ({ ...p, item: e.target.value }))} placeholder="e.g. Master bath floor tile" />
            </div>
            <div className="space-y-1.5">
              <Label>Room / location</Label>
              <Input value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="optional" />
            </div>
            <div className="space-y-1.5">
              <Label>Allowance ($)</Label>
              <Input type="number" value={form.allowance_amount} onChange={e => setForm(p => ({ ...p, allowance_amount: e.target.value }))} placeholder="what the budget carries" />
            </div>
            <div className="space-y-1.5">
              <Label>Decide by</Label>
              <Input type="date" value={form.needed_by} onChange={e => setForm(p => ({ ...p, needed_by: e.target.value }))} />
              <p className="text-[11px] text-faint">
                {categoryDef(form.category)?.lead_time_days
                  ? `Typical lead time ${categoryDef(form.category)!.lead_time_days} days · late here blocks ${categoryDef(form.category)!.blocks.toLowerCase()}`
                  : 'Back it up from install by the lead time.'}
              </p>
            </div>
            {budgetLines.length > 0 && (
              <div className="space-y-1.5">
                <Label>Budget line <span className="text-faint font-normal">(optional)</span></Label>
                <Select value={form.budget_line_item_id} onChange={e => setForm(p => ({ ...p, budget_line_item_id: e.target.value }))}>
                  <option value="">Not linked</option>
                  {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} - {l.description}</option>)}
                </Select>
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={add} disabled={saving || !form.item.trim()}>{saving ? 'Adding…' : 'Add'}</Button>
          </div>
        </div>
      )}

      {/* Which categories does this job actually have?
          Pre-ticked from the project type - a medical fit-out has no sod and no
          bathtub, and a board that opens with 71 rows on it reads as homework
          rather than a list you'd keep current. */}
      {showSeed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowSeed(false)}>
          <div className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl bg-panel border border-line shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 p-5 pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink">What does this job include?</h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  {projectType
                    ? <>Ticked for a {PROJECT_TYPE_LABEL[projectType] ?? projectType} job. Change anything that doesn&apos;t fit.</>
                    : <>Tick the categories this job has.</>}
                </p>
              </div>
              <button onClick={() => setShowSeed(false)} className="p-1 rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex items-center gap-3 px-5 pb-2 text-xs">
              <button onClick={() => setPicked(new Set(SELECTION_CATEGORIES.map(c => c.category)))} className="text-accent-fg hover:underline">Select all</button>
              <button onClick={() => setPicked(new Set(recommendedCategories(projectType)))} className="text-accent-fg hover:underline">Reset to recommended</button>
              <button onClick={() => setPicked(new Set())} className="text-faint hover:text-danger">Clear</button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-1">
              {SELECTION_CATEGORIES.map(cat => {
                const on = picked.has(cat.category)
                const recommended = recommendedCategories(projectType).includes(cat.category)
                const n = itemsForType(cat, projectType).length
                const already = rows.some(r => r.category === cat.category)
                return (
                  <label key={cat.category}
                    className={cn('flex items-start gap-2.5 rounded-lg border px-3 py-2 cursor-pointer transition-colors',
                      on ? 'border-accent/40 bg-accent-tint' : 'border-line hover:bg-surface')}>
                    <input type="checkbox" className="mt-0.5 accent-[#C9F24A]" checked={on}
                      onChange={() => setPicked(prev => { const nx = new Set(prev); on ? nx.delete(cat.category) : nx.add(cat.category); return nx })} />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-ink-soft">{cat.category}</span>
                        <span className="text-[11px] text-faint">{n} item{n === 1 ? '' : 's'}</span>
                        {!recommended && (
                          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-muted text-muted-fg">unusual here</span>
                        )}
                        {already && (
                          <span className="text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-info-tint text-info">already on the board</span>
                        )}
                      </span>
                      <span className="block text-[11px] text-faint mt-0.5">
                        ~{cat.lead_time_days} day lead · blocks {cat.blocks.toLowerCase()}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pt-3 border-t border-line-soft">
              <p className="text-xs text-muted-fg">
                {picked.size === 0
                  ? 'Nothing selected.'
                  : <>Adds <span className="font-semibold text-ink">{seedRowCount(Array.from(picked), projectType)}</span> selections across {picked.size} categor{picked.size === 1 ? 'y' : 'ies'}.
                      {!!projectType && !isHomeType(projectType) && ' Home-only items like bathtubs and laundry cabinets are left out.'}</>}
              </p>
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" onClick={() => setShowSeed(false)}>Cancel</Button>
                <Button onClick={seed} disabled={seeding || picked.size === 0}>
                  {seeding ? <><Loader2 className="h-4 w-4 animate-spin" /> Building…</> : 'Add these'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Palette className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg max-w-md mx-auto">
            No selections yet. Pick the categories this job actually has - windows, cabinets, fixtures,
            paint, flooring, tile - and each one arrives with its typical lead time already on it.
            We&apos;ll tick the ones that suit a {PROJECT_TYPE_LABEL[projectType ?? ''] ?? 'job'} like this
            one to start with.
          </p>
          <Button onClick={openSeed} className="mt-4 gap-1.5">
            <Sparkles className="h-4 w-4" /> Start the standard board
          </Button>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {(['outstanding', 'all'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={cn('rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                  filter === f ? 'bg-accent text-accent-ink' : 'text-muted-fg hover:bg-muted')}>
                {f === 'outstanding' ? `Still owed (${stats.outstanding})` : `Everything (${stats.total})`}
              </button>
            ))}
            <button onClick={openSeed}
              className="ml-auto inline-flex items-center gap-1.5 text-sm font-medium text-muted-fg hover:text-ink">
              <Sparkles className="h-3.5 w-3.5" /> Add a category
            </button>
          </div>

          {byCategory.length === 0 ? (
            <div className="bg-panel rounded-xl border border-line p-10 text-center">
              <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-3" />
              <p className="text-sm text-muted-fg">Every selection is decided. Nothing is waiting on the client.</p>
            </div>
          ) : byCategory.map(([category, items]) => {
            const def = categoryDef(category)
            return (
              <div key={category} className="bg-panel rounded-xl border border-line overflow-hidden">
                <div className="px-4 py-2.5 border-b border-line-soft flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">{category}</h2>
                  {def && <p className="text-xs text-faint">~{def.lead_time_days} day lead · blocks {def.blocks.toLowerCase()}</p>}
                </div>
                <div className="divide-y divide-line-soft">
                  {items.map(sel => {
                    const v = variance(sel)
                    const u = urgency(sel)
                    const days = daysUntil(sel.needed_by)
                    const isOpen = expanded.has(sel.id)
                    return (
                      <div key={sel.id}>
                        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-x-4 gap-y-2">
                          <button onClick={() => toggle(sel.id)} className="flex items-start gap-2 flex-1 min-w-0 text-left">
                            <span className="mt-0.5 text-faint shrink-0">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium text-ink-soft">
                                {sel.item}
                                {sel.location && <span className="text-faint font-normal"> · {sel.location}</span>}
                              </span>
                              <span className="block text-xs text-faint mt-0.5">
                                {sel.allowance_amount != null ? `Allowance ${money(sel.allowance_amount)}` : 'No allowance set'}
                                {sel.selected_name ? ` · chose ${sel.selected_name}` : ''}
                                {sel.selected_price != null ? ` at ${money(sel.selected_price)}` : ''}
                              </span>
                            </span>
                          </button>

                          <div className="flex flex-wrap items-center gap-2 shrink-0">
                            {v != null && v !== 0 && (
                              <span className={cn('text-xs font-semibold rounded-full px-2 py-0.5',
                                v > 0 ? 'bg-danger-tint text-danger' : 'bg-success-tint text-success')}>
                                {v > 0 ? `+${money(v)} over` : `${money(Math.abs(v))} under`}
                              </span>
                            )}
                            {sel.needed_by && u !== 'none' && (
                              <span className={cn('inline-flex items-center gap-1 text-xs font-medium rounded-full px-2 py-0.5',
                                u === 'late' ? 'bg-danger-tint text-danger' : u === 'soon' ? 'bg-warn-tint text-warn' : 'text-muted-fg')}>
                                {u === 'late' ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                                {days! < 0 ? `${Math.abs(days!)}d late` : `${days}d left`}
                              </span>
                            )}
                            <select value={sel.status} onChange={e => patch(sel.id, { status: e.target.value })}
                              className={cn('rounded-full border-0 px-2.5 py-1 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-accent', STATUS_TINT[sel.status])}>
                              {SELECTION_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                            </select>
                            <button onClick={() => remove(sel)} className="text-faint hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>

                        {isOpen && (
                          <div className="px-4 pb-4 pl-10 space-y-3 bg-surface/50">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Allowance ($)</Label>
                                <Input type="number" defaultValue={sel.allowance_amount ?? ''} className="h-8 text-sm"
                                  onBlur={e => { const val = e.target.value === '' ? null : Number(e.target.value); if (val !== sel.allowance_amount) patch(sel.id, { allowance_amount: val }) }} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Decide by</Label>
                                <Input type="date" defaultValue={sel.needed_by ?? ''} className="h-8 text-sm"
                                  onBlur={e => { if (e.target.value !== (sel.needed_by ?? '')) patch(sel.id, { needed_by: e.target.value || null }) }} />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">What they chose</Label>
                                <Input defaultValue={sel.selected_name ?? ''} className="h-8 text-sm" placeholder="e.g. SW Alabaster"
                                  onBlur={e => { if (e.target.value !== (sel.selected_name ?? '')) patch(sel.id, { selected_name: e.target.value || null, status: e.target.value ? 'chosen' : sel.status }) }} />
                              </div>
                            </div>

                            {sel.selected_at && (
                              <p className="text-[11px] text-faint">
                                Decided {new Date(sel.selected_at).toLocaleDateString()}
                                {sel.selected_by_name ? ` by ${sel.selected_by_name}` : ''}
                              </p>
                            )}

                            {/* Options the client picks from */}
                            <div className="space-y-1.5">
                              <Label className="text-xs">Options offered</Label>
                              {sel.selection_options?.length > 0 && (
                                <div className="rounded-lg border border-line divide-y divide-line-soft">
                                  {sel.selection_options.map(o => (
                                    <div key={o.id} className="flex items-center gap-2 px-3 py-2">
                                      <span className="flex-1 min-w-0 text-sm text-ink-soft truncate">
                                        {o.name}
                                        {o.vendor && <span className="text-faint"> · {o.vendor}</span>}
                                      </span>
                                      {o.link_url && <a href={o.link_url} target="_blank" rel="noreferrer" className="text-faint hover:text-accent-fg"><ExternalLink className="h-3.5 w-3.5" /></a>}
                                      <span className="text-sm tabular-nums text-ink shrink-0">{money(o.price)}</span>
                                      <button onClick={() => removeOption(sel.id, o.id)} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>
                                    </div>
                                  ))}
                                </div>
                              )}
                              <div className="flex flex-wrap gap-1.5">
                                <Input className="h-8 text-sm flex-1 min-w-[10rem]" placeholder="Option name"
                                  value={optDraft[sel.id]?.name ?? ''}
                                  onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? { name: '', price: '', vendor: '', link_url: '' }), name: e.target.value } }))} />
                                <Input className="h-8 text-sm w-24" type="number" placeholder="Price"
                                  value={optDraft[sel.id]?.price ?? ''}
                                  onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? { name: '', price: '', vendor: '', link_url: '' }), price: e.target.value } }))} />
                                <Input className="h-8 text-sm w-32" placeholder="Vendor"
                                  value={optDraft[sel.id]?.vendor ?? ''}
                                  onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? { name: '', price: '', vendor: '', link_url: '' }), vendor: e.target.value } }))} />
                                <Button size="sm" variant="outline" onClick={() => addOption(sel.id)}><Plus className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>

                            {/* The overage, made real */}
                            {v != null && v > 0 && (
                              sel.change_order_id ? (
                                <p className="inline-flex items-center gap-1.5 text-xs text-success">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Change order raised for {money(v)}
                                </p>
                              ) : (
                                <Button size="sm" variant="outline" className="gap-1.5"
                                  onClick={() => patch(sel.id, { create_change_order: true })}>
                                  <GitPullRequest className="h-3.5 w-3.5" /> Raise a {money(v)} change order
                                </Button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <p className="text-xs text-faint">
            {portalLink ? (
              <>
                {clientName ? `${clientName} picks` : 'Your client picks'} at{' '}
                <span className="font-mono text-muted-fg break-all">{portalLink}</span> - same link as their project portal, no account needed.
              </>
            ) : (
              <>This project hasn&apos;t been shared with the client yet. &ldquo;Copy client link&rdquo; creates the link and copies it - no account needed on their end.</>
            )}
          </p>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'ok' | 'warn' | 'danger' }) {
  return (
    <div className="bg-panel rounded-xl border border-line px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-faint font-semibold">{label}</p>
      <p className={cn('text-lg font-bold mt-0.5',
        tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</p>
    </div>
  )
}

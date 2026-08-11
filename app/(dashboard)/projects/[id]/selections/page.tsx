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
  ClipboardPaste, Truck, MessageSquareWarning, Wallet, ImagePlus,
} from 'lucide-react'
import {
  SELECTION_CATEGORIES, SELECTION_STATUSES, STATUS_TINT, PROJECT_TYPE_LABEL,
  categoryDef, daysUntil, isOutstanding, urgency, variance,
  recommendedCategories, seedRowCount, itemsForType, isHomeType, matchBudgetLine,
  type SelectionStatus,
} from '@/lib/selections'

const money = (n: number | null | undefined) =>
  n == null ? '-' : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

interface Option {
  id: string; name: string; description: string | null; price: number | null
  brand: string | null; model_number: string | null
  color_hex: string | null; image_url: string | null; link_url: string | null
  vendor: string | null; vendor_company_id: string | null; is_allowance: boolean
}
interface Selection {
  id: string; category: string; item: string; location: string | null
  allowance_amount: number | null; budget_line_item_id: string | null
  needed_by: string | null; lead_time_days: number | null
  status: SelectionStatus; selected_name: string | null; selected_price: number | null
  selected_at: string | null; selected_by_name: string | null
  change_order_id: string | null; notes: string | null
  reference_url: string | null; reference_label: string | null
  supplier_company_id: string | null; ordered_at: string | null; expected_delivery: string | null
  change_requested_at: string | null; change_request_note: string | null
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
  type OptDraft = { name: string; brand: string; price: string; color_hex: string; link_url: string; image_url: string }
  const BLANK_OPT: OptDraft = { name: '', brand: '', price: '', color_hex: '', link_url: '', image_url: '' }
  const [optDraft, setOptDraft] = useState<Record<string, OptDraft>>({})
  const [uploading, setUploading] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [pasteFor, setPasteFor] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [ordering, setOrdering] = useState<string | null>(null)
  const [orderFor, setOrderFor] = useState<Selection | null>(null)
  const [orderForm, setOrderForm] = useState({ supplier_company_id: '', expected_delivery: '', amount: '' })
  const [showLink, setShowLink] = useState(false)
  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({})
  const [linkSaving, setLinkSaving] = useState(false)
  const [fillPrompt, setFillPrompt] = useState<{ sel: Selection; line: any; amount: number } | null>(null)
  const [filling, setFilling] = useState(false)

  async function token() { const { data: { session } } = await supabase.auth.getSession(); return session?.access_token ?? '' }

  async function load() {
    const t = await token()
    const [res, dir] = await Promise.all([
      fetch(`/api/projects/${params.id}/selections`, { headers: { Authorization: `Bearer ${t}` } }),
      fetch('/api/directory', { headers: { Authorization: `Bearer ${t}` } }),
    ])
    if (dir.ok) {
      // Suppliers come from the Directory rather than a free-text box - this is
      // who the order actually goes to.
      setSuppliers(((await dir.json()).companies ?? [])
        .filter((c: any) => c.type === 'supplier' || c.type === 'subcontractor')
        .map((c: any) => ({ id: c.id, name: c.name })))
    }
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

  // What the app thinks each unlinked selection belongs to. A suggestion, shown
  // and changeable - never applied behind the user's back, because a wrong link
  // puts a client's upgrade on somebody else's line.
  const suggestions = useMemo(() => {
    if (!budgetLines.length) return []
    return rows
      .filter(r => !r.budget_line_item_id)
      .map(r => ({ sel: r, line: matchBudgetLine(r.category, budgetLines) }))
      .filter(x => x.line)
  }, [rows, budgetLines])

  function openLinkReview() {
    const seed: Record<string, string> = {}
    for (const r of rows.filter(x => !x.budget_line_item_id)) {
      seed[r.id] = matchBudgetLine(r.category, budgetLines)?.id ?? ''
    }
    setLinkChoice(seed)
    setShowLink(true)
  }

  async function applyLinks() {
    setLinkSaving(true)
    const t = await token()
    const links = Object.entries(linkChoice)
      .filter(([, lineId]) => lineId)
      .map(([id, budget_line_item_id]) => ({ id, budget_line_item_id }))
    await fetch(`/api/projects/${params.id}/selections/link-budget`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ links }),
    })
    setLinkSaving(false)
    setShowLink(false)
    load()
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
      body: JSON.stringify({
        name: d.name, brand: d.brand || null,
        price: d.price === '' ? null : Number(d.price),
        color_hex: d.color_hex || null, link_url: d.link_url || null, image_url: d.image_url || null,
      }),
    })
    // Keep the brand. You're entering a fan deck or a product line, so it's the
    // same manufacturer line after line - retyping it every row is the kind of
    // small tax that stops people adding options at all. Change it when it changes.
    if (res.ok) { setOptDraft(p => ({ ...p, [selId]: { ...BLANK_OPT, brand: d.brand } })); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not add that option')
  }

  /**
   * A photo of the actual thing, dropped or picked.
   *
   * `optionId` attaches it to an option that already exists; without one it
   * comes back as a URL for the row being drafted.
   */
  async function uploadPhoto(selId: string, file: File, optionId?: string): Promise<string | null> {
    if (!file.type.startsWith('image/')) { alert('That needs to be an image.'); return null }
    setUploading(optionId ?? selId)
    const t = await token()
    const form = new FormData()
    form.append('file', file)
    if (optionId) form.append('optionId', optionId)
    const res = await fetch(`/api/projects/${params.id}/selections/${selId}/options/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${t}` }, body: form,
    })
    setUploading(null)
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { alert(body.error ?? 'Could not upload that image'); return null }
    if (optionId) load()
    return body.image_url ?? null
  }

  // A fan deck has twelve colors on it. Nobody is filling in twelve forms.
  async function pasteOptions(selId: string) {
    if (!pasteText.trim()) return
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections/${selId}/options`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ paste: pasteText }),
    })
    if (res.ok) { setPasteText(''); setPasteFor(null); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not read those')
  }

  function openOrder(sel: Selection) {
    setOrderFor(sel)
    setOrderForm({
      supplier_company_id: (sel as any).supplier_company_id ?? '',
      expected_delivery: '',
      // Already priced when it was put in front of them - nobody retypes it.
      amount: String(sel.selected_price ?? sel.allowance_amount ?? ''),
    })
  }

  async function placeOrder() {
    if (!orderFor) return
    setOrdering(orderFor.id)
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/selections/${orderFor.id}/order`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        supplier_company_id: orderForm.supplier_company_id || null,
        expected_delivery: orderForm.expected_delivery || null,
        amount: orderForm.amount === '' ? null : Number(orderForm.amount),
      }),
    })
    setOrdering(null)
    if (res.ok) { setOrderFor(null); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not place the order')
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

  /** The manufacturer already used on this selection, for one-click refill. */
  const lastBrand = (sel: Selection): string | null => {
    for (let i = sel.selection_options.length - 1; i >= 0; i--) {
      const b = sel.selection_options[i]?.brand
      if (b) return b
    }
    return null
  }

  /**
   * What's left on a budget line once the selections already hanging off it are
   * accounted for.
   *
   * Excludes the selection being edited, or its own allowance would count
   * against the room it's asking about.
   */
  function lineBudget(lineId: string | null, exceptSelId?: string) {
    const line = budgetLines.find(l => l.id === lineId)
    if (!line) return null
    const budgeted = Number(line.budgeted_amount ?? 0)
    const allocated = rows
      .filter(r => r.budget_line_item_id === lineId && r.id !== exceptSelId)
      .reduce((sum, r) => sum + Number(r.allowance_amount ?? 0), 0)
    return { line, budgeted, allocated, remaining: Math.round((budgeted - allocated) * 100) / 100 }
  }

  /**
   * Link a selection to a budget line, and do the obvious follow-on.
   *
   * Two things people would otherwise do by hand, in order: if the line has
   * money on it and this selection has no allowance, the allowance is what's
   * left. If the line has nothing on it and the selection does, the line is
   * probably the one that's wrong - so offer to fill it rather than silently
   * leaving a $0 line with an allowance pointing at it.
   */
  async function linkToBudget(sel: Selection, lineId: string) {
    const info = lineId ? lineBudget(lineId, sel.id) : null
    const patchBody: any = { budget_line_item_id: lineId || null }

    if (info && sel.allowance_amount == null && info.remaining > 0) {
      patchBody.allowance_amount = info.remaining
    }
    await patch(sel.id, patchBody)

    if (info && info.budgeted === 0 && sel.allowance_amount != null && sel.allowance_amount > 0) {
      setFillPrompt({ sel, line: info.line, amount: Number(sel.allowance_amount) })
    }
  }

  /**
   * No line fits, so make one.
   *
   * Named from the selection itself and seeded with its allowance, because the
   * alternative is sending someone to the Budget tab to type the same three
   * things and then come back.
   */
  async function createBudgetLine(sel: Selection) {
    const t = await token()
    const res = await fetch(`/api/projects/${params.id}/budget`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({
        category: sel.category,
        description: sel.location ? `${sel.item} (${sel.location})` : sel.item,
        budgeted_amount: sel.allowance_amount ?? 0,
        cost_type: 'hard',
      }),
    })
    if (!res.ok) { alert((await res.json().catch(() => ({}))).error ?? 'Could not add a budget line'); return }
    const newId = (await res.json().catch(() => ({}))).item?.id
    if (newId) await patch(sel.id, { budget_line_item_id: newId })
    else load()
  }

  /** Push the allowance onto the empty budget line it points at. */
  async function fillBudgetLine() {
    if (!fillPrompt) return
    setFilling(true)
    const t = await token()
    await fetch(`/api/projects/${params.id}/budget/${fillPrompt.line.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ budgeted_amount: fillPrompt.amount }),
    })
    setFilling(false)
    setFillPrompt(null)
    load()
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
    const linked = rows.filter(r => r.budget_line_item_id).length
    return { outstanding: outstanding.length, late: late.length, net: over + under, total: rows.length, linked }
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
          <code className="mx-1 font-mono text-xs">_combined_008-069.sql</code> in the Supabase SQL editor.
        </p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/40 bg-accent-tint px-4 py-3">
          <p className="text-sm text-accent-fg">
            <span className="font-semibold">{suggestions.length}</span> selection{suggestions.length === 1 ? '' : 's'} look
            like {suggestions.length === 1 ? 'it belongs' : 'they belong'} on a budget line. Want to connect
            {suggestions.length === 1 ? ' it' : ' them'}? You can change any of the suggestions first.
          </p>
          <Button size="sm" onClick={openLinkReview} className="gap-1.5 shrink-0">
            <Wallet className="h-3.5 w-3.5" /> Review &amp; connect
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat label="Still owed" value={String(stats.outstanding)} tone={stats.outstanding ? 'warn' : 'ok'} />
          <Stat label="Past due" value={String(stats.late)} tone={stats.late ? 'danger' : 'ok'} />
          <Stat label="Decided" value={`${stats.total - stats.outstanding} of ${stats.total}`} tone="ok" />
          <Stat label="Over allowance" value={stats.net === 0 ? '-' : money(stats.net)} tone={stats.net > 0 ? 'danger' : 'ok'} />
          <Stat label="On the budget" value={`${stats.linked} of ${stats.total}`} tone={stats.linked < stats.total ? 'warn' : 'ok'} />
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

      {/* The line it points at has nothing on it, and this selection has a
          number. Offering to move the number across beats leaving a $0 line
          with an allowance aimed at it - but it is an offer, since the empty
          line might be deliberate. */}
      {fillPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setFillPrompt(null)}>
          <div className="w-full max-w-md rounded-xl bg-panel border border-line shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-semibold text-ink">That budget line is empty</h3>
              <p className="text-sm text-muted-fg mt-1">
                <span className="font-medium text-ink-soft">{fillPrompt.line.category} - {fillPrompt.line.description}</span> has
                nothing budgeted, and &ldquo;{fillPrompt.sel.item}&rdquo; carries an allowance of{' '}
                <span className="font-semibold text-ink">{money(fillPrompt.amount)}</span>.
              </p>
              <p className="text-sm text-muted-fg mt-2">Set the line to that amount?</p>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setFillPrompt(null)}>Leave it</Button>
              <Button onClick={fillBudgetLine} disabled={filling}>
                {filling ? <><Loader2 className="h-4 w-4 animate-spin" /> Setting…</> : `Set it to ${money(fillPrompt.amount)}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Recommend, don't decide. Each row arrives pre-set to the app's best
          guess with the reasoning visible - the category it matched on - and
          every one is changeable before anything saves. */}
      {showLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowLink(false)}>
          <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl bg-panel border border-line shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2 p-5 pb-3">
              <div>
                <h3 className="text-base font-semibold text-ink">Connect selections to the budget</h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  Each one is set to our best guess. Change anything that&apos;s wrong, or set it to
                  &ldquo;Don&apos;t link&rdquo; - nothing saves until you hit Connect.
                </p>
              </div>
              <button onClick={() => setShowLink(false)} className="p-1 rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-1.5">
              {rows.filter(r => !r.budget_line_item_id).map(r => {
                const guess = matchBudgetLine(r.category, budgetLines)
                const chosen = linkChoice[r.id] ?? ''
                return (
                  <div key={r.id} className="grid sm:grid-cols-2 gap-2 items-center rounded-lg border border-line px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-soft truncate">{r.item}</p>
                      <p className="text-[11px] text-faint">{r.category}</p>
                    </div>
                    <div className="min-w-0">
                      <Select value={chosen} className="h-8 text-sm"
                        onChange={e => setLinkChoice(p => ({ ...p, [r.id]: e.target.value }))}>
                        <option value="">Don&apos;t link</option>
                        {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} - {l.description}</option>)}
                      </Select>
                      {guess && chosen === guess.id && (
                        <p className="text-[11px] text-accent-fg mt-0.5">Suggested from &ldquo;{r.category}&rdquo;</p>
                      )}
                      {!guess && <p className="text-[11px] text-faint mt-0.5">No obvious match - pick one if it belongs somewhere.</p>}
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 p-5 pt-3 border-t border-line-soft">
              <p className="text-xs text-muted-fg">
                Connecting <span className="font-semibold text-ink">{Object.values(linkChoice).filter(Boolean).length}</span> of{' '}
                {rows.filter(r => !r.budget_line_item_id).length}.
              </p>
              <div className="flex gap-2 ml-auto">
                <Button variant="secondary" onClick={() => setShowLink(false)}>Cancel</Button>
                <Button onClick={applyLinks} disabled={linkSaving}>
                  {linkSaving ? <><Loader2 className="h-4 w-4 animate-spin" /> Connecting…</> : 'Connect'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Placing the order. The amount is already known - it was priced when
          the option went in front of the client - so this is about who it goes
          to and when it lands, not retyping a number. */}
      {orderFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setOrderFor(null)}>
          <div className="w-full max-w-md rounded-xl bg-panel border border-line shadow-xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-ink">Order {orderFor.item}</h3>
                <p className="text-xs text-muted-fg mt-0.5">
                  {orderFor.selected_name ?? 'Nothing chosen yet'}
                  {orderFor.location ? ` · ${orderFor.location}` : ''}
                </p>
              </div>
              <button onClick={() => setOrderFor(null)} className="p-1 rounded-lg text-faint hover:bg-surface"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Supplier</Label>
                <Select value={orderForm.supplier_company_id}
                  onChange={e => setOrderForm(p => ({ ...p, supplier_company_id: e.target.value }))}>
                  <option value="">Pick from your Directory…</option>
                  {suppliers.map(sup => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                </Select>
                {suppliers.length === 0 && (
                  <p className="text-[11px] text-faint">No suppliers in your Directory yet - add them there and they show up here.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Amount</Label>
                  <Input type="number" value={orderForm.amount}
                    onChange={e => setOrderForm(p => ({ ...p, amount: e.target.value }))} />
                  <p className="text-[11px] text-faint">Already priced from what they chose.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Expected delivery</Label>
                  <Input type="date" value={orderForm.expected_delivery}
                    onChange={e => setOrderForm(p => ({ ...p, expected_delivery: e.target.value }))} />
                </div>
              </div>
            </div>

            <p className="rounded-lg bg-surface border border-line px-3 py-2 text-[11px] text-muted-fg">
              This books the cost against{' '}
              {orderFor.budget_line_item_id
                ? <span className="font-medium text-ink-soft">{budgetLines.find(l => l.id === orderFor.budget_line_item_id)?.description ?? 'the linked budget line'}</span>
                : <span className="text-warn">no budget line - link one first if you want it on the budget</span>}
              , and the client&apos;s link will show it as Ordered.
            </p>

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => setOrderFor(null)}>Cancel</Button>
              <Button onClick={placeOrder} disabled={ordering === orderFor.id}>
                {ordering === orderFor.id ? <><Loader2 className="h-4 w-4 animate-spin" /> Ordering…</> : 'Mark ordered'}
              </Button>
            </div>
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
                                {/* Where it lands in the budget - the answer to
                                    "so which line does this show up on?" */}
                                {sel.budget_line_item_id
                                  ? <span className="text-muted-fg"> · {budgetLines.find(l => l.id === sel.budget_line_item_id)?.description ?? 'budget line'}</span>
                                  : <span className="text-warn"> · no budget line</span>}
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
                                {/* How much room is actually left on the line this
                                    hangs off, once its other selections are counted. */}
                                {(() => {
                                  const b = lineBudget(sel.budget_line_item_id, sel.id)
                                  if (!b) return null
                                  if (b.budgeted === 0) return <p className="text-[11px] text-warn">That budget line has nothing on it yet.</p>
                                  const over = b.remaining < 0
                                  return (
                                    <p className={cn('text-[11px]', over ? 'text-danger' : 'text-faint')}>
                                      {over
                                        ? `${money(Math.abs(b.remaining))} over the line's ${money(b.budgeted)}`
                                        : `${money(b.remaining)} left of ${money(b.budgeted)} on this line`}
                                    </p>
                                  )
                                })()}
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
                              {/* One link for the whole selection, not one per
                                  option. "Here's the color chart, go look" is a
                                  single fact about the category - repeating it on
                                  every row would be noise. */}
                              <div className="space-y-1">
                                <Label className="text-xs">Where they can browse the range <span className="text-faint font-normal">- optional</span></Label>
                                <Input className="h-8 text-sm" defaultValue={sel.reference_url ?? ''}
                                  placeholder="e.g. the manufacturer's color chart or product page"
                                  onBlur={e => { if (e.target.value !== (sel.reference_url ?? '')) patch(sel.id, { reference_url: e.target.value || null }) }} />
                                <p className="text-[11px] text-faint">
                                  Shown at the top of this selection on the client&apos;s link, so they can see the full
                                  range and then tell you what they picked.
                                </p>
                              </div>

                              <div className="flex items-center justify-between gap-2">
                                <Label className="text-xs">Options the client picks from</Label>
                                <button type="button" onClick={() => { setPasteFor(pasteFor === sel.id ? null : sel.id); setPasteText('') }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-fg hover:underline">
                                  <ClipboardPaste className="h-3 w-3" /> Paste a list
                                </button>
                              </div>

                              {sel.selection_options?.length > 0 && (
                                <div className="rounded-lg border border-line divide-y divide-line-soft">
                                  {sel.selection_options.map(o => (
                                    <div key={o.id} className="flex items-center gap-2.5 px-3 py-2">
                                      {/* What the client will actually look at */}
                                      {/* Drop a photo straight onto it, or click. */}
                                      <label
                                        onDragOver={e => { e.preventDefault(); setDragOver(o.id) }}
                                        onDragLeave={() => setDragOver(null)}
                                        onDrop={e => {
                                          e.preventDefault(); setDragOver(null)
                                          const f = e.dataTransfer.files?.[0]
                                          if (f) uploadPhoto(sel.id, f, o.id)
                                        }}
                                        title="Drop or click to add a photo"
                                        className={cn('h-8 w-8 shrink-0 rounded border overflow-hidden cursor-pointer flex items-center justify-center',
                                          dragOver === o.id ? 'border-accent bg-accent-tint' : 'border-line')}>
                                        <input type="file" accept="image/*" className="sr-only"
                                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(sel.id, f, o.id); e.target.value = '' }} />
                                        {uploading === o.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" />
                                          : o.image_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img src={o.image_url} alt="" className="h-full w-full object-cover" />
                                          ) : o.color_hex ? (
                                            <span className="h-full w-full" style={{ backgroundColor: o.color_hex }} />
                                          ) : <ImagePlus className="h-3.5 w-3.5 text-faint" />}
                                      </label>
                                      <span className="flex-1 min-w-0 text-sm text-ink-soft truncate">
                                        {o.brand && <span className="text-faint">{o.brand} </span>}{o.name}
                                      </span>
                                      {o.link_url && <a href={o.link_url} target="_blank" rel="noreferrer" title="Product page" className="text-faint hover:text-accent-fg"><ExternalLink className="h-3.5 w-3.5" /></a>}
                                      <span className="text-sm tabular-nums text-ink shrink-0">{money(o.price)}</span>
                                      <button onClick={() => removeOption(sel.id, o.id)} className="text-faint hover:text-danger"><X className="h-3.5 w-3.5" /></button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {pasteFor === sel.id ? (
                                <div className="space-y-1.5 rounded-lg border border-accent/40 bg-surface p-2.5">
                                  <p className="text-[11px] text-muted-fg">
                                    One per line. It works out which bit is which - a <span className="font-mono">#hex</span> is a
                                    swatch, a link is a link, a number is the price, the rest is the name.
                                  </p>
                                  <textarea rows={4} value={pasteText} onChange={e => setPasteText(e.target.value)}
                                    placeholder={'Sherwin Williams | Alabaster | #edeae3 | 62\nSherwin Williams | Repose Gray | #cbc7c0 | 62\nBenjamin Moore | Chantilly Lace | #f4f4ef | 78'}
                                    className="w-full rounded-md border border-muted2 bg-panel px-2.5 py-2 font-mono text-[11px] text-ink placeholder:text-faint focus:border-accent focus:outline-none resize-none" />
                                  <div className="flex gap-1.5">
                                    <Button size="sm" onClick={() => pasteOptions(sel.id)} disabled={!pasteText.trim()}>Add them</Button>
                                    <Button size="sm" variant="secondary" onClick={() => { setPasteFor(null); setPasteText('') }}>Cancel</Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1.5 items-center">
                                  <div className="relative">
                                    <Input className="h-8 text-sm w-28" placeholder="Brand"
                                      value={optDraft[sel.id]?.brand ?? ''}
                                      onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), brand: e.target.value } }))} />
                                    {/* Cleared it and want it back - one click rather than retyping. */}
                                    {!optDraft[sel.id]?.brand && lastBrand(sel) && (
                                      <button type="button"
                                        onClick={() => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), brand: lastBrand(sel)! } }))}
                                        className="absolute inset-y-0 right-1 my-auto h-5 max-w-[6rem] truncate rounded bg-muted px-1.5 text-[10px] font-medium text-muted-fg hover:bg-accent-tint hover:text-accent-fg"
                                        title={`Use ${lastBrand(sel)}`}>
                                        {lastBrand(sel)}
                                      </button>
                                    )}
                                  </div>
                                  <Input className="h-8 text-sm flex-1 min-w-[9rem]" placeholder="Option name"
                                    value={optDraft[sel.id]?.name ?? ''}
                                    onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), name: e.target.value } }))} />
                                  <Input className="h-8 text-sm w-20" type="number" placeholder="Price"
                                    value={optDraft[sel.id]?.price ?? ''}
                                    onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), price: e.target.value } }))} />
                                  <Input className="h-8 text-sm w-36" placeholder="Link to product"
                                    value={optDraft[sel.id]?.link_url ?? ''}
                                    onChange={e => setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), link_url: e.target.value } }))} />
                                  {/* A photo of the real thing, not a color wheel. */}
                                  <label
                                    onDragOver={e => { e.preventDefault(); setDragOver(sel.id) }}
                                    onDragLeave={() => setDragOver(null)}
                                    onDrop={async e => {
                                      e.preventDefault(); setDragOver(null)
                                      const f = e.dataTransfer.files?.[0]
                                      if (!f) return
                                      const url = await uploadPhoto(sel.id, f)
                                      if (url) setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), image_url: url } }))
                                    }}
                                    title="Drop a photo here, or click to pick one"
                                    className={cn('h-8 shrink-0 inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium cursor-pointer',
                                      dragOver === sel.id ? 'border-accent bg-accent-tint text-accent-fg'
                                        : optDraft[sel.id]?.image_url ? 'border-success text-success' : 'border-line text-muted-fg hover:bg-muted')}>
                                    <input type="file" accept="image/*" className="sr-only"
                                      onChange={async e => {
                                        const f = e.target.files?.[0]; e.target.value = ''
                                        if (!f) return
                                        const url = await uploadPhoto(sel.id, f)
                                        if (url) setOptDraft(p => ({ ...p, [sel.id]: { ...(p[sel.id] ?? BLANK_OPT), image_url: url } }))
                                      }} />
                                    {uploading === sel.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                                    {optDraft[sel.id]?.image_url ? 'Photo added' : 'Photo'}
                                  </label>
                                  <Button size="sm" variant="outline" onClick={() => addOption(sel.id)}><Plus className="h-3.5 w-3.5" /></Button>
                                </div>
                              )}
                            </div>

                            {/* Which budget line this comes out of. Without it the
                                allowance is a number in a vacuum and the order
                                lands nowhere. */}
                            {budgetLines.length > 0 && (
                              <div className="space-y-1">
                                <Label className="text-xs">Budget line</Label>
                                <Select value={sel.budget_line_item_id ?? ''} className="h-8 text-sm"
                                  onChange={e => linkToBudget(sel, e.target.value)}>
                                  <option value="">Not linked to the budget</option>
                                  {budgetLines.map(l => <option key={l.id} value={l.id}>{l.category} - {l.description}</option>)}
                                </Select>
                                {!sel.budget_line_item_id && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-[11px] text-warn flex-1 min-w-[12rem]">
                                      Needed before you can accept or order this - an accepted selection is money, and it
                                      has to land somewhere the budget can see.
                                    </p>
                                    <button type="button" onClick={() => createBudgetLine(sel)}
                                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[11px] font-medium text-ink-soft hover:border-accent hover:text-accent-fg">
                                      <Plus className="h-3 w-3" /> Add a line for this
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* A client asking to change something already ordered */}
                            {sel.change_requested_at && (
                              <div className="rounded-lg border border-warn/40 bg-warn-tint px-3 py-2">
                                <p className="text-xs font-semibold text-warn inline-flex items-center gap-1.5">
                                  <MessageSquareWarning className="h-3.5 w-3.5" /> Client asked to change this
                                </p>
                                {sel.change_request_note && <p className="text-xs text-warn mt-1">{sel.change_request_note}</p>}
                                <button onClick={() => patch(sel.id, { change_requested_at: null, change_request_note: null })}
                                  className="text-[11px] text-warn underline mt-1">Mark handled</button>
                              </div>
                            )}

                            {/* Ordering it */}
                            {sel.status === 'chosen' && (
                              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => openOrder(sel)}>
                                <Truck className="h-3.5 w-3.5" /> Order it
                              </Button>
                            )}
                            {sel.ordered_at && (
                              <p className="text-xs text-success inline-flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5" />
                                Ordered {new Date(sel.ordered_at).toLocaleDateString()}
                                {sel.expected_delivery ? ` · due ${new Date(sel.expected_delivery + 'T00:00:00').toLocaleDateString()}` : ''}
                              </p>
                            )}

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

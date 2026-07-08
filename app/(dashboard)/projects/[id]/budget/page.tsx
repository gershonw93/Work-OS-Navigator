'use client'

import { useEffect, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Wallet, DollarSign, CheckCircle2, TrendingDown, TrendingUp, Plus, Trash2, Pencil, X, Check, Link as LinkIcon, AlertTriangle, LayoutTemplate, Save, FileSpreadsheet, FolderInput, Search, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useViewerContext } from '@/lib/use-viewer-context'
import { QuoteLineItems } from '@/components/projects/quote-line-items'

interface BudgetItem {
  id: string
  cost_code: string | null
  category: string
  description: string
  budgeted_amount: number
  committed_amount: number
  actual_amount: number
  notes: string | null
  sort_order: number
  subcontract_id: string | null
  linked: boolean
  linked_label: string | null
}

interface SubOption {
  id: string
  label: string
  contract_amount: number
}

const CATEGORIES = [
  'General Conditions', 'Permits & Fees', 'Site Work', 'Excavation', 'Foundation',
  'Concrete', 'Masonry', 'Metals', 'Lumber', 'Framing', 'Roofing', 'Siding',
  'Windows & Doors', 'Insulation', 'Drywall', 'Flooring', 'Tile', 'Painting',
  'Trim & Millwork', 'Cabinets & Countertops', 'Plumbing', 'HVAC', 'Electrical',
  'Appliances', 'Landscaping', 'Concrete Flatwork', 'Cleanup', 'Equipment Rental',
  'Contingency', 'General',
]

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

// Small labeled wrapper for compact inline form fields
function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</span>
      {children}
    </div>
  )
}

const blankForm = {
  cost_code: '', category: 'General', description: '',
  budgeted_amount: '', committed_amount: '', actual_amount: '', notes: '',
  subcontract_id: '',
}

export default function BudgetPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const vc = useViewerContext(params.id)
  const [items, setItems] = useState<BudgetItem[]>([])
  const [subOptions, setSubOptions] = useState<SubOption[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [materialsTotal, setMaterialsTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...blankForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...blankForm })
  const [assigningSubId, setAssigningSubId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('category')

  // Templates
  const [showTemplate, setShowTemplate] = useState(false)
  const [showSave, setShowSave] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [otherProjects, setOtherProjects] = useState<{ id: string; name: string }[]>([])
  const [copyAmounts, setCopyAmounts] = useState(false)
  const [applying, setApplying] = useState(false)
  const [tplName, setTplName] = useState('')
  const [savingTpl, setSavingTpl] = useState(false)
  const [importItems, setImportItems] = useState<{ description: string; default_amount: number | null }[] | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const [importOnly, setImportOnly] = useState(false)
  const [importName, setImportName] = useState('')
  const [importing, setImporting] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setItems(d.items ?? [])
      setSubOptions(d.subcontracts ?? [])
      setMaterials(d.materials ?? [])
      setMaterialsTotal(d.materials_total ?? 0)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  // One-click: create a budget line for an unassigned subcontract, linked to it
  async function assignSubToBudget(sub: SubOption) {
    setAssigningSubId(sub.id)
    const token = await getToken()
    // Map the sub's trade to a budget category if it matches one, else General
    const category = CATEGORIES.find(c => c.toLowerCase() === (sub.label.split('·')[0] || '').trim().toLowerCase()) || 'General'
    const res = await fetch(`/api/projects/${params.id}/budget`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        category,
        description: sub.label,
        budgeted_amount: sub.contract_amount,
        subcontract_id: sub.id,
      }),
    })
    setAssigningSubId(null)
    if (res.ok) load()
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not assign')
  }

  async function openTemplatePicker() {
    setShowTemplate(true)
    setImportOnly(false)
    setCopyAmounts(false); setImportItems(null)
    const token = await getToken()
    const [tplRes, projRes] = await Promise.all([
      fetch('/api/budget-templates', { headers: { Authorization: `Bearer ${token}` } }),
      fetch('/api/projects', { headers: { Authorization: `Bearer ${token}` } }),
    ])
    if (tplRes.ok) setTemplates((await tplRes.json()).templates ?? [])
    if (projRes.ok) {
      const d = await projRes.json()
      setOtherProjects((d.projects ?? []).filter((p: any) => p.id !== params.id).map((p: any) => ({ id: p.id, name: p.name })))
    }
  }

  async function applyTemplate(body: any) {
    setApplying(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...body, copy_amounts: copyAmounts }),
    })
    setApplying(false)
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (d.skipped > 0) alert(`${d.skipped} line${d.skipped !== 1 ? 's' : ''} skipped — already on this budget.`)
      setShowTemplate(false); load()
    }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not apply')
  }

  async function importExcel(file: File) {
    setImporting(true)
    const token = await getToken()
    const form = new FormData(); form.append('file', file)
    const res = await fetch('/api/budget-templates/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    setImporting(false)
    if (res.ok) { const d = await res.json(); setImportItems(d.items ?? []); setImportName(d.suggested_name ?? 'Imported template') }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not read file')
  }

  const normDesc = (t: string) => (t || '').toLowerCase().replace(/\s+/g, ' ').trim()

  // Merge an imported sheet into the existing budget: matching descriptions
  // update that line's budgeted amount, everything else is added as new.
  async function applyImportMerge() {
    if (!importItems?.length) return
    setApplying(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: importItems, merge: true }),
    })
    setApplying(false)
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (d.skipped > 0) alert(`${d.skipped} duplicate line${d.skipped !== 1 ? 's' : ''} skipped.`)
      setShowTemplate(false); setImportItems(null); load()
    }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not apply')
  }

  async function saveImportedAsTemplateAndApply() {
    if (!importItems?.length) return
    setApplying(true)
    const token = await getToken()
    // Save as a reusable template
    const createRes = await fetch('/api/budget-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: importName || 'Imported template', source: 'excel', items: importItems.map(i => ({ description: i.description, default_amount: i.default_amount })) }),
    })
    if (createRes.ok) {
      const { template } = await createRes.json()
      await applyTemplate({ template_id: template.id })
    } else { setApplying(false); alert('Could not save template') }
  }

  async function saveCurrentAsTemplate() {
    if (!tplName.trim()) return
    setSavingTpl(true)
    const token = await getToken()
    const res = await fetch('/api/budget-templates', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: tplName, source: 'job',
        items: items.map(i => ({ category: i.category, cost_code: i.cost_code, description: i.description, default_amount: i.budgeted_amount })),
      }),
    })
    setSavingTpl(false)
    if (res.ok) { setShowSave(false); setTplName(''); alert('Saved as template') }
  }

  async function addLine() {
    if (!form.description.trim()) return
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      setForm({ ...blankForm })
      setAdding(false)
      load()
    }
  }

  function startEdit(item: BudgetItem) {
    setEditingId(item.id)
    setEditForm({
      cost_code: item.cost_code ?? '',
      category: item.category,
      description: item.description,
      budgeted_amount: String(item.budgeted_amount ?? ''),
      committed_amount: String(item.committed_amount ?? ''),
      actual_amount: String(item.actual_amount ?? ''),
      notes: item.notes ?? '',
      subcontract_id: item.subcontract_id ?? '',
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    if (res.ok) { setEditingId(null); load() }
  }

  function remove(id: string) {
    guardDelete(async () => {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}/budget/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      load()
    }, { label: 'this budget line', protected: true })
  }

  const totalBudgeted = items.reduce((s, i) => s + Number(i.budgeted_amount || 0), 0)
  const totalCommitted = items.reduce((s, i) => s + Number(i.committed_amount || 0), 0)
  const totalActual = items.reduce((s, i) => s + Number(i.actual_amount || 0), 0)
  const remaining = totalBudgeted - totalActual
  const overBudget = remaining < 0

  // Search filter
  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(i => [i.description, i.cost_code, i.category, i.linked_label, i.notes]
        .some(v => (v ?? '').toLowerCase().includes(q)))
    : items

  // Sort within whatever grouping is applied
  const variance = (i: BudgetItem) => Number(i.budgeted_amount || 0) - Number(i.actual_amount || 0)
  const sortRows = (rows: BudgetItem[]) => {
    const r = [...rows]
    switch (sortBy) {
      case 'description': r.sort((a, b) => a.description.localeCompare(b.description)); break
      case 'budgeted': r.sort((a, b) => Number(b.budgeted_amount || 0) - Number(a.budgeted_amount || 0)); break
      case 'committed': r.sort((a, b) => Number(b.committed_amount || 0) - Number(a.committed_amount || 0)); break
      case 'actual': r.sort((a, b) => Number(b.actual_amount || 0) - Number(a.actual_amount || 0)); break
      case 'variance': r.sort((a, b) => variance(a) - variance(b)); break
    }
    return r
  }

  // When sorting by a non-category key, show one flat list instead of category groups
  const flatSort = sortBy !== 'category'
  const grouped: { category: string; rows: BudgetItem[] }[] = []
  if (flatSort) {
    if (filtered.length) grouped.push({ category: 'All line items', rows: sortRows(filtered) })
  } else {
    for (const item of filtered) {
      let g = grouped.find(x => x.category === item.category)
      if (!g) { g = { category: item.category, rows: [] }; grouped.push(g) }
      g.rows.push(item)
    }
  }

  // Subcontracts not yet linked to any budget line
  const linkedSubIds = new Set(items.map(i => i.subcontract_id).filter(Boolean))
  const unbudgetedSubs = subOptions.filter(s => !linkedSubIds.has(s.id))
  const unbudgetedTotal = unbudgetedSubs.reduce((s, x) => s + Number(x.contract_amount || 0), 0)

  const statCards = [
    { label: 'Total Budget', value: totalBudgeted, color: 'text-ink', bg: 'bg-panel', icon: DollarSign },
    { label: 'Committed', value: totalCommitted, color: 'text-info', bg: 'bg-info-tint', icon: TrendingUp },
    { label: 'Actual Spent', value: totalActual, color: 'text-success', bg: 'bg-success-tint', icon: CheckCircle2 },
    {
      label: overBudget ? 'Over Budget' : 'Remaining',
      value: Math.abs(remaining),
      color: overBudget ? 'text-danger' : 'text-warn',
      bg: overBudget ? 'bg-danger-tint' : 'bg-warn-tint',
      icon: overBudget ? TrendingDown : Wallet,
    },
  ]

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  // Sub's own job → budget IS the quote line items (no committed/actual rollup).
  if (!vc.loading && vc.companyType === 'subcontractor' && vc.owns) {
    return <QuoteLineItems projectId={params.id} mode="budget" />
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink">Budget</h1>
          <p className="text-sm text-muted-fg mt-0.5">Line-item cost breakdown — budgeted vs committed vs actual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => importInputRef.current?.click()} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Import Estimate
          </Button>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            onChange={e => { const file = e.target.files?.[0]; if (file) { setImportOnly(true); setShowTemplate(true); setImportItems(null); importExcel(file) } e.target.value = '' }} />
          <Button variant="outline" onClick={openTemplatePicker} className="gap-1.5"><LayoutTemplate className="h-4 w-4" /> Use Template</Button>
          {items.length > 0 && <Button variant="outline" onClick={() => setShowSave(true)} className="gap-1.5"><Save className="h-4 w-4" /> Save as Template</Button>}
          <Button onClick={() => setAdding(v => !v)} className="gap-1.5"><Plus className="h-4 w-4" /> Add Line</Button>
        </div>
      </div>

      {/* Use Template modal */}
      {showTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowTemplate(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">{importOnly ? 'Import estimate / budget sheet' : 'Start from a template'}</h2>
              <div className="flex items-center gap-3">
                {!importOnly && <a href="/budget-templates" className="text-xs text-accent-fg hover:underline">Manage templates →</a>}
                <button onClick={() => setShowTemplate(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
              </div>
            </div>
            <div className="p-5 space-y-5">
              {!importOnly && <label className="flex items-center gap-2 text-sm text-ink-soft">
                <input type="checkbox" className="accent-[#C9F24A]" checked={copyAmounts} onChange={e => setCopyAmounts(e.target.checked)} />
                Also copy amounts (default: bring line items in blank)
              </label>}

              {/* Saved templates */}
              {!importOnly && <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2">Saved templates</p>
                {templates.length === 0 ? <p className="text-xs text-faint">No templates yet.</p> : (
                  <div className="space-y-1.5">
                    {templates.map(t => (
                      <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-soft truncate">{t.name}</p>
                          <p className="text-xs text-faint">{(t.budget_template_items?.length ?? 0)} line items</p>
                        </div>
                        <Button size="sm" disabled={applying} onClick={() => applyTemplate({ template_id: t.id })}>Apply</Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>}

              {/* From another job */}
              {!importOnly && <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2"><FolderInput className="inline h-3.5 w-3.5 mr-1" />Copy from a similar job</p>
                <div className="flex gap-2">
                  <SearchableSelect className="flex-1" onChange={e => e.target.value && applyTemplate({ source_project_id: e.target.value })}>
                    <option value="">Select a project…</option>
                    {otherProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </SearchableSelect>
                </div>
              </div>}

              {/* Upload Excel */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-faint mb-2"><FileSpreadsheet className="inline h-3.5 w-3.5 mr-1" />Import an estimate / budget sheet (Excel or CSV)</p>
                {!importItems ? (
                  <label className="flex items-center gap-2 rounded-lg border border-dashed border-muted2 px-3 py-2.5 text-sm text-muted-fg hover:bg-surface cursor-pointer w-fit">
                    <FileSpreadsheet className="h-4 w-4" /> {importing ? 'Reading…' : 'Choose .xlsx / .csv'}
                    <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) importExcel(f) }} />
                  </label>
                ) : (
                  (() => {
                    const existingDescs = new Set(items.map(l => normDesc(l.description)))
                    const matches = importItems.filter(i => existingDescs.has(normDesc(i.description))).length
                    const fresh = importItems.length - matches
                    return (
                  <div className="rounded-lg border border-line p-3 space-y-2">
                    <p className="text-sm text-ink-soft">
                      {importItems.length} line items found
                      {items.length > 0 && matches > 0 && <span className="text-muted-fg"> — {matches} match existing lines, {fresh} new</span>}
                    </p>
                    <div className="max-h-32 overflow-y-auto text-xs space-y-0.5">
                      {importItems.slice(0, 30).map((i, idx) => {
                        const isMatch = existingDescs.has(normDesc(i.description))
                        return (
                          <div key={idx} className="flex items-center justify-between gap-2 text-faint">
                            <span className="truncate">{i.description}</span>
                            <span className="flex items-center gap-1.5 shrink-0">
                              {items.length > 0 && (
                                <span className={cn('rounded-full px-1.5 py-0 text-[10px] font-medium', isMatch ? 'bg-info-tint text-info' : 'bg-success-tint text-success')}>
                                  {isMatch ? 'updates' : 'new'}
                                </span>
                              )}
                              {i.default_amount != null ? money(i.default_amount) : ''}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setImportItems(null)}>Choose another</Button>
                      {items.length > 0 && matches > 0 && (
                        <Button size="sm" disabled={applying} onClick={applyImportMerge}>
                          {applying ? 'Applying…' : `Update ${matches} matching${fresh > 0 ? ` + add ${fresh} new` : ''}`}
                        </Button>
                      )}
                      <Button size="sm" variant={items.length > 0 && matches > 0 ? 'outline' : 'default'} disabled={applying} onClick={saveImportedAsTemplateAndApply}>{applying ? 'Applying…' : 'Add all as new (save template)'}</Button>
                    </div>
                    {items.length > 0 && matches > 0 && (
                      <p className="text-xs text-faint">Updating never deletes anything — lines not in the sheet are left untouched.</p>
                    )}
                  </div>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Save as template modal */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSave(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Save as template</h2>
              <button onClick={() => setShowSave(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                <Label>Template name</Label>
                <Input placeholder="e.g. New build — full custom" value={tplName} onChange={e => setTplName(e.target.value)} autoFocus />
              </div>
              <p className="text-xs text-faint">Saves these {items.length} line items (with amounts) as a reusable template for future jobs.</p>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowSave(false)}>Cancel</Button>
                <Button onClick={saveCurrentAsTemplate} disabled={savingTpl || !tplName.trim()}>{savingTpl ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border border-line p-4', s.bg)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', s.color)} />
                <p className="text-xs font-medium text-muted-fg">{s.label}</p>
              </div>
              <p className={cn('text-2xl font-bold', s.color)}>{money(s.value)}</p>
            </div>
          )
        })}
      </div>

      {/* Unbudgeted subcontracts hint */}
      {unbudgetedSubs.length > 0 && (
        <div className="rounded-xl border border-warn/30 bg-warn-tint px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-0.5" />
          <div className="min-w-0 text-sm">
            <p className="font-medium text-ink-soft">
              {unbudgetedSubs.length} subcontract{unbudgetedSubs.length > 1 ? 's' : ''} not linked to a budget line
              <span className="text-muted-fg font-normal"> · {money(unbudgetedTotal)} uncovered</span>
            </p>
            <p className="text-xs text-muted-fg mt-1 mb-2">
              Assign a subcontract to auto-create a linked budget line that tracks its committed &amp; actual costs.
            </p>
            <div className="flex flex-col gap-1.5">
              {unbudgetedSubs.map(s => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg bg-panel border border-warn/20 px-3 py-1.5">
                  <span className="text-sm text-ink-soft truncate">{s.label} <span className="text-faint">· {money(s.contract_amount)}</span></span>
                  <Button size="sm" disabled={assigningSubId === s.id} onClick={() => assignSubToBudget(s)} className="shrink-0">
                    {assigningSubId === s.id ? 'Adding…' : <><Plus className="h-3.5 w-3.5" /> Assign</>}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Spend progress */}
      {totalBudgeted > 0 && (
        <div className="bg-panel rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-ink-soft">Budget Used</p>
            <p className={cn('text-sm', overBudget ? 'text-danger font-semibold' : 'text-muted-fg')}>
              {((totalActual / totalBudgeted) * 100).toFixed(1)}% spent
            </p>
          </div>
          <div className="h-3 w-full bg-muted rounded-full overflow-hidden flex">
            <div className={cn('h-full transition-all', overBudget ? 'bg-danger-solid' : 'bg-success-solid')}
              style={{ width: `${Math.min((totalActual / totalBudgeted) * 100, 100)}%` }} />
            <div className="h-full bg-blue-300 transition-all"
              style={{ width: `${Math.min(Math.max((totalCommitted - totalActual) / totalBudgeted * 100, 0), 100 - Math.min((totalActual / totalBudgeted) * 100, 100))}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-fg">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success-solid" />Spent {money(totalActual)}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-300" />Committed {money(totalCommitted)}</span>
            {!overBudget && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-muted2" />Remaining {money(remaining)}</span>}
          </div>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-panel rounded-xl border border-accent/40 p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold text-ink-soft">New Budget Line</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <input className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Cost code (optional)"
              value={form.cost_code} onChange={e => setForm({ ...form, cost_code: e.target.value })} />
            <SearchableSelect className="rounded-lg border border-line px-3 py-2 text-sm bg-panel"
              value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </SearchableSelect>
            <input className="rounded-lg border border-line px-3 py-2 text-sm col-span-2 sm:col-span-1" placeholder="Description *"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <input type="number" className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Budgeted $"
              value={form.budgeted_amount} onChange={e => setForm({ ...form, budgeted_amount: e.target.value })} />
            {form.subcontract_id ? (
              <>
                <div className="rounded-lg border border-line bg-muted px-3 py-2 text-sm text-muted-fg flex items-center justify-between">
                  <span className="text-xs">Committed</span>
                  <span className="font-medium text-ink-soft">{money(subOptions.find(s => s.id === form.subcontract_id)?.contract_amount ?? 0)}</span>
                </div>
                <div className="rounded-lg border border-line bg-muted px-3 py-2 text-sm text-muted-fg flex items-center justify-between">
                  <span className="text-xs">Actual</span>
                  <span className="font-medium text-accent-fg">Auto</span>
                </div>
              </>
            ) : (
              <>
                <input type="number" className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Committed $"
                  value={form.committed_amount} onChange={e => setForm({ ...form, committed_amount: e.target.value })} />
                <input type="number" className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Actual $"
                  value={form.actual_amount} onChange={e => setForm({ ...form, actual_amount: e.target.value })} />
              </>
            )}
          </div>
          {subOptions.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <label className="text-xs font-medium text-muted-fg sm:w-44 shrink-0">Link to subcontract (auto-fills Committed &amp; Actual)</label>
              <SearchableSelect className="flex-1 rounded-lg border border-line px-3 py-2 text-sm bg-panel"
                value={form.subcontract_id} onChange={e => {
                  const sub = subOptions.find(s => s.id === e.target.value)
                  setForm(f => ({
                    ...f,
                    subcontract_id: e.target.value,
                    // auto-fill description & budget from the linked contract when blank
                    description: f.description.trim() || (sub?.label ?? ''),
                    budgeted_amount: f.budgeted_amount || (sub ? String(sub.contract_amount) : ''),
                  }))
                }}>
                <option value="">Not linked — enter manually</option>
                {subOptions.filter(s => !linkedSubIds.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.label} · {money(s.contract_amount)}</option>)}
              </SearchableSelect>
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setAdding(false); setForm({ ...blankForm }) }}>Cancel</Button>
            <Button onClick={addLine} disabled={saving || !form.description.trim()}>{saving ? 'Saving…' : 'Add Line'}</Button>
          </div>
        </div>
      )}

      {/* Search + sort toolbar */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint" />
            <Input className="pl-9" placeholder="Search line items…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-muted-fg whitespace-nowrap">Sort by</span>
            <SearchableSelect className="rounded-lg border border-line px-3 py-2 text-sm bg-panel" value={sortBy} onChange={e => setSortBy(e.target.value)}>
              <option value="category">Category</option>
              <option value="description">Description (A–Z)</option>
              <option value="budgeted">Budgeted (high → low)</option>
              <option value="committed">Committed (high → low)</option>
              <option value="actual">Actual (high → low)</option>
              <option value="variance">Variance (over first)</option>
            </SearchableSelect>
          </div>
        </div>
      )}

      {/* Budget table */}
      {items.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Wallet className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No budget lines yet. Add your first cost line to start tracking.</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Search className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No line items match “{search}”.</p>
        </div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          {/* header row (desktop) */}
          <div className="hidden md:grid grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide">
            <span>Line Item</span>
            <span className="text-right">Budgeted</span>
            <span className="text-right">Committed</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Variance</span>
            <span />
          </div>

          {grouped.map(group => {
            const gBudget = group.rows.reduce((s, i) => s + Number(i.budgeted_amount || 0), 0)
            return (
              <div key={group.category}>
                <div className="bg-surface px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-muted-fg">{group.category}</span>
                  <span className="text-xs font-semibold text-muted-fg">{money(gBudget)}</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {group.rows.map(item => {
                    const variance = Number(item.budgeted_amount || 0) - Number(item.actual_amount || 0)
                    const over = variance < 0
                    const overCommitted = Number(item.budgeted_amount || 0) > 0 && (Number(item.committed_amount || 0) - Number(item.budgeted_amount || 0)) >= 1
                    if (editingId === item.id) {
                      return (
                        <div key={item.id} className="px-4 py-3 bg-accent-tint/40 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <Field label="Cost code">
                              <input className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="optional"
                                value={editForm.cost_code} onChange={e => setEditForm({ ...editForm, cost_code: e.target.value })} />
                            </Field>
                            <Field label="Category">
                              <SearchableSelect className="rounded-lg border border-line px-2.5 py-1.5 text-sm bg-panel"
                                value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                              </SearchableSelect>
                            </Field>
                            <Field label="Description" className="col-span-2 sm:col-span-1">
                              <input className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="What this covers"
                                value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                            </Field>
                            <Field label="Budgeted ($)">
                              <input type="number" className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="0"
                                value={editForm.budgeted_amount} onChange={e => setEditForm({ ...editForm, budgeted_amount: e.target.value })} />
                            </Field>
                            {editForm.subcontract_id ? (
                              <>
                                <Field label="Committed ($)">
                                  <div className="rounded-lg border border-line bg-muted px-2.5 py-1.5 text-sm flex items-center justify-between">
                                    <span className="text-xs text-faint">auto</span>
                                    <span className="font-medium text-ink-soft">{money(subOptions.find(s => s.id === editForm.subcontract_id)?.contract_amount ?? 0)}</span>
                                  </div>
                                </Field>
                                <Field label="Actual ($)">
                                  <div className="rounded-lg border border-line bg-muted px-2.5 py-1.5 text-sm flex items-center justify-between">
                                    <span className="text-xs text-faint">from invoices</span>
                                    <span className="font-medium text-accent-fg">Auto</span>
                                  </div>
                                </Field>
                              </>
                            ) : (
                              <>
                                <Field label="Committed ($)">
                                  <input type="number" className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="0"
                                    value={editForm.committed_amount} onChange={e => setEditForm({ ...editForm, committed_amount: e.target.value })} />
                                </Field>
                                <Field label="Actual ($)">
                                  <input type="number" className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="0"
                                    value={editForm.actual_amount} onChange={e => setEditForm({ ...editForm, actual_amount: e.target.value })} />
                                </Field>
                              </>
                            )}
                          </div>
                          {subOptions.length > 0 && (
                            <Field label="Link to subcontract (auto-fills Committed & Actual)">
                              <SearchableSelect className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm bg-panel"
                                value={editForm.subcontract_id} onChange={e => setEditForm({ ...editForm, subcontract_id: e.target.value })}>
                                <option value="">Not linked — enter manually</option>
                                {subOptions.filter(s => !linkedSubIds.has(s.id) || s.id === item.subcontract_id).map(s => <option key={s.id} value={s.id}>{s.label} · {money(s.contract_amount)}</option>)}
                              </SearchableSelect>
                            </Field>
                          )}
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 text-xs text-muted-fg px-2 py-1.5 rounded-lg hover:bg-muted">
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button onClick={() => saveEdit(item.id)} disabled={saving}
                              className="inline-flex items-center gap-1 text-xs text-accent-ink bg-accent hover:bg-accent px-2.5 py-1.5 rounded-lg">
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={item.id} className="group md:grid md:grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] md:gap-2 md:items-center px-4 py-3 hover:bg-surface transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-soft truncate">
                            {item.cost_code && <span className="text-faint font-normal mr-1.5">{item.cost_code}</span>}
                            {item.description}
                          </p>
                          {item.linked ? (
                            <p className="text-xs text-accent-fg truncate flex items-center gap-1">
                              <LinkIcon className="h-3 w-3 shrink-0" /> Linked · {item.linked_label}
                            </p>
                          ) : item.notes ? (
                            <p className="text-xs text-faint truncate">{item.notes}</p>
                          ) : null}
                        </div>
                        <div className="flex justify-between md:block md:text-right mt-2 md:mt-0 text-sm">
                          <span className="md:hidden text-xs text-faint">Budgeted</span>
                          <span className="text-ink-soft">{money(item.budgeted_amount)}</span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm">
                          <span className="md:hidden text-xs text-faint">Committed</span>
                          <span
                            title={overCommitted ? `Committed ${money(item.committed_amount)} exceeds budget ${money(item.budgeted_amount)} by ${money(Number(item.committed_amount) - Number(item.budgeted_amount))}` : undefined}
                            className={cn('inline-flex items-center gap-1 justify-end',
                              overCommitted ? 'text-danger font-semibold' : (item.linked ? 'text-ink-soft' : 'text-muted-fg'))}>
                            {overCommitted && <AlertTriangle className="h-3 w-3 shrink-0" />}
                            {money(item.committed_amount)}
                          </span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm">
                          <span className="md:hidden text-xs text-faint">Actual</span>
                          <span className={item.linked ? 'text-ink-soft' : 'text-muted-fg'}>{money(item.actual_amount)}</span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm font-medium">
                          <span className="md:hidden text-xs text-faint">Variance</span>
                          <span className={variance === 0 ? 'text-faint' : over ? 'text-danger' : 'text-success'}>
                            {variance === 0 ? '—' : `${over ? '-' : ''}${money(Math.abs(variance))}`}
                          </span>
                        </div>
                        <div className="flex justify-end gap-1 mt-2 md:mt-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-muted-fg">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* totals footer */}
          <div className="hidden md:grid grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft">
            <span>Total</span>
            <span className="text-right">{money(totalBudgeted)}</span>
            <span className={cn('text-right', (totalCommitted - totalBudgeted) >= 1 ? 'text-danger' : '')}
              title={(totalCommitted - totalBudgeted) >= 1 ? `Committed exceeds budget by ${money(totalCommitted - totalBudgeted)}` : undefined}>
              {money(totalCommitted)}
            </span>
            <span className="text-right">{money(totalActual)}</span>
            <span className={cn('text-right', overBudget ? 'text-danger' : 'text-success')}>
              {overBudget ? '-' : ''}{money(Math.abs(remaining))}
            </span>
            <span />
          </div>
        </div>
      )}

      {/* Materials — receipts assigned to this job (linked ones roll into a line's Actual) */}
      {materials.length > 0 && (() => {
        const materialsOwed = materials.reduce((s: number, m: any) => s + (m.client_paid ? 0 : Number(m.amount ?? 0)), 0)
        return (
        <div className="mt-6 rounded-xl border border-line bg-panel overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-line-soft flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink-soft inline-flex items-center gap-1.5"><ShoppingCart className="h-4 w-4 text-muted-fg" /> Materials</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-bold text-ink">{money(materialsTotal)} spent</span>
              {materialsOwed > 0 && <span className="font-medium text-warn">{money(materialsOwed)} owed by client</span>}
            </div>
          </div>
          <div className="divide-y divide-line-soft">
            {materials.map((m: any) => (
              <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-2.5 text-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink-soft truncate">{m.store_name || 'Material purchase'}</p>
                  <p className="text-xs text-faint truncate">
                    {[m.category, m.budget_line_id ? 'in a budget line' : 'not linked to a line', m.purchase_date && new Date(m.purchase_date + 'T00:00:00').toLocaleDateString()].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {m.client_paid ? (
                  <span className="text-xs font-medium text-success">Paid</span>
                ) : (
                  <span className="text-xs font-medium text-warn">Owed</span>
                )}
                {m.receipt_url && <a href={m.receipt_url} target="_blank" rel="noreferrer" className="text-xs text-accent-fg hover:underline">Receipt</a>}
                <span className="font-bold text-ink">{money(m.amount)}</span>
              </div>
            ))}
          </div>
          <div className="px-5 py-2.5 border-t border-line-soft bg-surface text-right">
            <a href="/materials" className="text-xs font-medium text-accent-fg hover:underline">Add a receipt →</a>
          </div>
        </div>
        )
      })()}
    </div>
  )
}

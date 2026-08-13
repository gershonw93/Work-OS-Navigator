'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Wallet, DollarSign, CheckCircle2, TrendingDown, TrendingUp, Plus, Trash2, Pencil, X, Check, Link as LinkIcon, AlertTriangle, LayoutTemplate, Save, FileSpreadsheet, FolderInput, Search, ShoppingCart, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useViewerContext } from '@/lib/use-viewer-context'
import { QuoteLineItems } from '@/components/projects/quote-line-items'
import { HARD_COST_CATEGORIES, SOFT_COST_CATEGORIES, categoryOptions } from '@/lib/budget-categories'
import type { BudgetTotals } from '@/lib/invoice-budget'

interface BudgetItem {
  id: string
  cost_code: string | null
  category: string
  description: string
  budgeted_amount: number
  committed_amount: number
  actual_amount: number
  materials_amount?: number
  /** Approved change orders on this line. */
  change_orders_amount: number
  /** budgeted + approved changes - what this line is judged against. */
  revised_budget: number
  notes: string | null
  sort_order: number
  subcontract_id: string | null
  linked: boolean
  linked_label: string | null
  space_type: 'interior' | 'exterior' | null
  cost_type?: 'hard' | 'soft' | null
}

interface SubOption {
  id: string
  label: string
  contract_amount: number
}

const CATEGORIES = HARD_COST_CATEGORIES

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

// Category is free text in the database, so the dropdown is a starting point,
// not a constraint - every GC has a trade nobody else calls by that name.
// Anything typed here comes back in the list on the next job.
function CategoryPicker({
  costType, known, value, onChange, compact,
}: {
  costType: 'hard' | 'soft'
  known: string[]
  value: string
  onChange: (v: string) => void
  compact?: boolean
}) {
  const options = useMemo(() => categoryOptions(costType, known), [costType, known])
  const [custom, setCustom] = useState(() => !!value && !options.includes(value))
  const cls = compact
    ? 'w-full rounded-lg border border-line px-2.5 py-1.5 text-sm bg-panel'
    : 'w-full rounded-lg border border-line px-3 py-2 text-sm bg-panel'

  return (
    <div className="space-y-1">
      {custom ? (
        <input autoFocus className={cls} placeholder="Name your category, e.g. Craning"
          value={value} onChange={e => onChange(e.target.value)} />
      ) : (
        <SearchableSelect className={cls} value={value} onChange={e => onChange(e.target.value)}>
          {options.map(c => <option key={c} value={c}>{c}</option>)}
        </SearchableSelect>
      )}
      <button
        type="button"
        onClick={() => {
          if (custom && !options.includes(value)) onChange(options[0])
          setCustom(v => !v)
        }}
        className="text-[11px] font-medium text-accent-fg hover:underline"
      >
        {custom ? 'Choose from the list' : '+ Use my own category'}
      </button>
    </div>
  )
}

const blankForm = {
  cost_code: '', category: 'General', description: '', cost_type: 'hard' as 'hard' | 'soft',
  budgeted_amount: '', committed_amount: '', actual_amount: '', notes: '',
  subcontract_id: '', space_type: '',
}

const SPACE_LABELS: Record<string, string> = { interior: 'Interior', exterior: 'Exterior' }

export default function BudgetPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const vc = useViewerContext(params.id)
  const [items, setItems] = useState<BudgetItem[]>([])
  const [totals, setTotals] = useState<BudgetTotals | null>(null)
  const [subOptions, setSubOptions] = useState<SubOption[]>([])
  const [materials, setMaterials] = useState<any[]>([])
  const [materialsTotal, setMaterialsTotal] = useState(0)
  const [spaceTotals, setSpaceTotals] = useState({ interior: 0, exterior: 0, unassigned: 0 })
  const [projectSqft, setProjectSqft] = useState<{ interior: number | null; exterior: number | null }>({ interior: null, exterior: null })
  // Markup % (stored as a fraction on the project as contractor_fee_pct). Shown
  // here as a whole percent; also drives the client proposal + billing fee.
  const [markupPct, setMarkupPct] = useState('0')
  const [savingMarkup, setSavingMarkup] = useState(false)
  // What the job earns. On a spec build it's the sale price, on a fixed-price
  // contract it's the contract value. Blank means fall back to markup on cost.
  const [sellout, setSellout] = useState('')
  const [savingSellout, setSavingSellout] = useState(false)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  const [knownCategories, setKnownCategories] = useState<string[]>([])
  const [billingMode, setBillingMode] = useState<string>('simple')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...blankForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...blankForm })
  const [assigningSubId, setAssigningSubId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('category')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)

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
  // Whether an imported sheet brings its amounts. Defaults on - someone who
  // uploaded a priced budget meant the prices.
  const [importAmounts, setImportAmounts] = useState(true)
  const [importName, setImportName] = useState('')
  const [importing, setImporting] = useState(false)

  // Soft-cost starter list
  const [showSoft, setShowSoft] = useState(false)
  const [softPicks, setSoftPicks] = useState<Set<string>>(new Set(SOFT_COST_CATEGORIES))
  const [addingSoft, setAddingSoft] = useState(false)

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
      setTotals(d.totals ?? null)
      setSubOptions(d.subcontracts ?? [])
      setMaterials(d.materials ?? [])
      setMaterialsTotal(d.materials_total ?? 0)
      setSpaceTotals(d.space_totals ?? { interior: 0, exterior: 0, unassigned: 0 })
      setProjectSqft(d.project_sqft ?? { interior: null, exterior: null })
      setMarkupPct(String(Math.round((Number(d.contractor_fee_pct ?? 0)) * 1000) / 10))
      setProjectStatus(d.project_status ?? null)
      setBillingMode(d.billing_mode ?? 'simple')
      setKnownCategories(d.known_categories ?? [])
      setSellout(d.sellout_amount != null ? String(d.sellout_amount) : '')
    }
    setLoading(false)
  }

  // Persist the markup % (as a fraction) on the project. Reuses the payments
  // fee endpoint - markup and the billed contractor fee are the same number.
  async function saveMarkup() {
    setSavingMarkup(true)
    try {
      const token = await getToken()
      const frac = Math.max(0, (Number(markupPct) || 0) / 100)
      await fetch(`/api/projects/${params.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fee_pct: frac }),
      })
    } finally {
      setSavingMarkup(false)
    }
  }

  // Persist the sellout on the project. Blank clears it back to "no figure yet",
  // which is different from a sellout of zero.
  async function saveSellout() {
    setSavingSellout(true)
    try {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellout_amount: sellout.trim() === '' ? null : Number(sellout) || 0 }),
      })
    } finally {
      setSavingSellout(false)
    }
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
      // An explicit copy_amounts on the call wins - the import flow has its own
      // toggle, and the template checkbox is not even on screen there.
      body: JSON.stringify({ copy_amounts: copyAmounts, ...body }),
    })
    setApplying(false)
    if (res.ok) {
      const d = await res.json().catch(() => ({}))
      if (d.skipped > 0) alert(`${d.skipped} line${d.skipped !== 1 ? 's' : ''} skipped - already on this budget.`)
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

  // Merge an imported sheet into the existing budget. By default, matching
  // descriptions update that line's budgeted amount; skipDuplicates leaves
  // matching lines untouched instead. Either way, everything else (fresh
  // rows) is added as new.
  async function applyImportMerge(skipDuplicates = false) {
    if (!importItems?.length) return
    setApplying(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        // Strip the amounts here rather than server-side, so what is sent is
        // exactly what the confirmation screen showed.
        items: importAmounts ? importItems : importItems.map(i => ({ ...i, default_amount: null })),
        merge: true,
        skip_duplicates: skipDuplicates,
      }),
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
      await applyTemplate({ template_id: template.id, copy_amounts: importAmounts })
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
        items: items.map(i => ({ category: i.category, cost_code: i.cost_code, description: i.description, default_amount: i.budgeted_amount, cost_type: i.cost_type ?? 'hard' })),
      }),
    })
    setSavingTpl(false)
    if (res.ok) { setShowSave(false); setTplName(''); alert('Saved as template') }
  }

  // Seed the standard soft costs as blank lines. Goes through the same apply
  // endpoint as templates, so anything already on the budget is skipped.
  async function addSoftCosts() {
    const picks = SOFT_COST_CATEGORIES.filter(c => softPicks.has(c))
    if (!picks.length) return
    setAddingSoft(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ items: picks.map(c => ({ category: c, description: c, cost_type: 'soft' })) }),
    })
    setAddingSoft(false)
    if (res.ok) { setShowSoft(false); load() }
    else alert((await res.json().catch(() => ({}))).error ?? 'Could not add soft costs')
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
      cost_type: item.cost_type === 'soft' ? 'soft' : 'hard',
      budgeted_amount: String(item.budgeted_amount ?? ''),
      committed_amount: String(item.committed_amount ?? ''),
      actual_amount: String(item.actual_amount ?? ''),
      notes: item.notes ?? '',
      subcontract_id: item.subcontract_id ?? '',
      space_type: item.space_type ?? '',
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

  function toggleSelect(id: string) {
    setSelected(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll(rows: BudgetItem[]) {
    setSelected(s => {
      const rowIds = rows.map(r => r.id)
      const allSelected = rowIds.every(id => s.has(id))
      const next = new Set(s)
      if (allSelected) rowIds.forEach(id => next.delete(id))
      else rowIds.forEach(id => next.add(id))
      return next
    })
  }

  function bulkRemove() {
    const ids = Array.from(selected)
    if (!ids.length) return
    guardDelete(async () => {
      setBulkDeleting(true)
      const token = await getToken()
      await Promise.all(ids.map(id => fetch(`/api/projects/${params.id}/budget/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })))
      setBulkDeleting(false)
      setSelected(new Set())
      load()
    }, { label: `these ${ids.length} budget line${ids.length !== 1 ? 's' : ''}`, protected: true })
  }

  // Soft costs (permits, plans, insurance, interest) sit alongside the trades
  // so the job total is the real total, but they are summarised separately.
  const softItems = items.filter(i => i.cost_type === 'soft')
  const hardItems = items.filter(i => i.cost_type !== 'soft')
  // Section subtotals use the REVISED budget so they add up to the headline.
  const sumOf = (rows: BudgetItem[]) => rows.reduce((s, i) => s + revisedOf(i), 0)
  const totalSoft = sumOf(softItems)
  const totalHard = sumOf(hardItems)

  // Computed server-side from the same rollup the Invoices tab uses. The
  // fallbacks keep the page honest if an older response arrives without them.
  const totalBudgeted = totals?.revised_budget ?? items.reduce((s, i) => s + revisedOf(i), 0)
  const originalBudget = totals?.original_budget ?? totalBudgeted
  const approvedChanges = totals?.approved_changes ?? 0
  const totalCommitted = totals?.committed ?? items.reduce((s, i) => s + Number(i.committed_amount || 0), 0)
  const totalActual = totals?.actual ?? items.reduce((s, i) => s + Number(i.actual_amount || 0), 0)
  const committedNotBilled = totals?.committed_not_billed ?? 0
  // Remaining now counts signed contracts, not just invoices. Budget minus
  // Actual told a GC with $450k signed and $200k billed that $300k was still
  // theirs to spend; it never was.
  const remaining = totals?.remaining ?? (totalBudgeted - totalActual)
  const overBudget = remaining < 0

  // Everything a line is judged against uses budget + approved change orders.
  // Judging against the original made a line look over budget at the exact
  // moment the overage was approved and paid for.
  function revisedOf(i: BudgetItem) {
    return i.revised_budget != null
      ? Number(i.revised_budget)
      : Number(i.budgeted_amount || 0) + Number(i.change_orders_amount || 0)
  }

  // Search filter
  const q = search.trim().toLowerCase()
  const filtered = q
    ? items.filter(i => [i.description, i.cost_code, i.category, i.linked_label, i.notes]
        .some(v => (v ?? '').toLowerCase().includes(q)))
    : items

  // Sort within whatever grouping is applied
  const variance = (i: BudgetItem) => revisedOf(i) - Number(i.actual_amount || 0)
  const sortRows = (rows: BudgetItem[]) => {
    const r = [...rows]
    switch (sortBy) {
      case 'description': r.sort((a, b) => a.description.localeCompare(b.description)); break
      case 'budgeted': r.sort((a, b) => revisedOf(b) - revisedOf(a)); break
      case 'committed': r.sort((a, b) => Number(b.committed_amount || 0) - Number(a.committed_amount || 0)); break
      case 'actual': r.sort((a, b) => Number(b.actual_amount || 0) - Number(a.actual_amount || 0)); break
      case 'variance': r.sort((a, b) => variance(a) - variance(b)); break
    }
    return r
  }

  // When sorting by a non-category key, show one flat list instead of category groups
  const flatSort = sortBy !== 'category'
  const buildGroups = (rows: BudgetItem[]) => {
    if (flatSort) return rows.length ? [{ category: 'All line items', rows: sortRows(rows) }] : []
    const out: { category: string; rows: BudgetItem[] }[] = []
    for (const item of rows) {
      let g = out.find(x => x.category === item.category)
      if (!g) { g = { category: item.category, rows: [] }; out.push(g) }
      g.rows.push(item)
    }
    return out
  }

  // Hard and soft costs live on one budget but read as two different things,
  // so they get their own banded section with its own subtotal. On a job still
  // in planning the soft costs ARE the work, so they lead.
  const filteredHard = filtered.filter(i => i.cost_type !== 'soft')
  const filteredSoft = filtered.filter(i => i.cost_type === 'soft')
  const sectionDefs = {
    hard: { label: 'Construction · hard costs', rows: filteredHard },
    soft: { label: 'Preconstruction & soft costs', rows: filteredSoft },
  }
  const sectionOrder: ('hard' | 'soft')[] = projectStatus === 'planning' ? ['soft', 'hard'] : ['hard', 'soft']
  const sections = sectionOrder
    .map(key => ({ key, ...sectionDefs[key] }))
    .filter(s => s.rows.length > 0)
    .map(s => ({ ...s, groups: buildGroups(s.rows), total: sumOf(s.rows) }))
  const showSectionBands = filteredHard.length > 0 && filteredSoft.length > 0

  // Subcontracts not yet linked to any budget line
  const linkedSubIds = new Set(items.map(i => i.subcontract_id).filter(Boolean))
  const unbudgetedSubs = subOptions.filter(s => !linkedSubIds.has(s.id))
  const unbudgetedTotal = unbudgetedSubs.reduce((s, x) => s + Number(x.contract_amount || 0), 0)

  // The estimate/markup tool is a PRE-AWARD thing, and only for the simple
  // (residential/small-GC) billing flow. Commercial AIA jobs bid formally and
  // bill through pay apps, so a marked-up budget PDF doesn't apply. Once a job
  // is won (active/completed), editing the markup would silently move the billed
  // contractor fee - so we drop to a read-only "view the proposal we sent" link.
  const preAward = projectStatus === 'planning' || projectStatus === null
  const estimateApplies = billingMode !== 'aia' && items.length > 0
  const showEstimateBar = estimateApplies && preAward
  const showProposalLink = estimateApplies && !preAward

  // Revenue comes from one of two places. An explicit sellout wins - on a spec
  // build the sale price has nothing to do with your cost. Otherwise fall back
  // to markup on cost, which is what a cost-plus GC works from.
  const selloutNum = sellout.trim() === '' ? null : Number(sellout) || 0
  const markupRevenue = totalBudgeted * (1 + (Number(markupPct) || 0) / 100)
  const revenue = selloutNum != null ? selloutNum : (Number(markupPct) > 0 ? markupRevenue : null)
  const revenueSource = selloutNum != null ? 'sellout' : 'markup'
  // Profit against committed+actual isn't meaningful until costs land, so this
  // is deliberately projected: revenue against what the job is budgeted to cost.
  const projectedProfit = revenue != null ? revenue - totalBudgeted : null
  const margin = revenue && revenue > 0 && projectedProfit != null ? (projectedProfit / revenue) * 100 : null
  // Actual spend eating into that profit - the number worth watching mid-job.
  const profitToDate = revenue != null ? revenue - totalActual : null

  const statCards = [
    {
      label: 'Total Budget', value: totalBudgeted, color: 'text-ink', bg: 'bg-panel', icon: DollarSign,
      // A budget that grew because of approved change orders should say so.
      note: approvedChanges !== 0
        ? `${money(originalBudget)} original + ${money(approvedChanges)} approved changes`
        : undefined,
    },
    {
      label: 'Committed', value: totalCommitted, color: 'text-info', bg: 'bg-info-tint', icon: TrendingUp,
      note: committedNotBilled > 0 ? `${money(committedNotBilled)} signed, not yet billed` : undefined,
    },
    { label: 'Actual Spent', value: totalActual, color: 'text-success', bg: 'bg-success-tint', icon: CheckCircle2 },
    {
      label: overBudget ? 'Over Budget' : 'Left to spend',
      value: Math.abs(remaining),
      color: overBudget ? 'text-danger' : 'text-warn',
      bg: overBudget ? 'bg-danger-tint' : 'bg-warn-tint',
      icon: overBudget ? TrendingDown : Wallet,
      // The whole point of the fix: this counts contracts you have signed, not
      // just invoices you have received.
      note: 'After signed contracts, not just invoices',
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
          <p className="text-sm text-muted-fg mt-0.5">Line-item cost breakdown - budgeted vs committed vs actual.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => importInputRef.current?.click()} className="gap-1.5">
            <FileSpreadsheet className="h-4 w-4" /> Import Estimate
          </Button>
          <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
            onChange={e => { const file = e.target.files?.[0]; if (file) { setImportOnly(true); setShowTemplate(true); setImportItems(null); importExcel(file) } e.target.value = '' }} />
          <Button variant="outline" onClick={openTemplatePicker} className="gap-1.5"><LayoutTemplate className="h-4 w-4" /> Use Template</Button>
          {items.length > 0 && <Button variant="outline" onClick={() => setShowSave(true)} className="gap-1.5"><Save className="h-4 w-4" /> Save as Template</Button>}
          {items.length > 0 && (
            <Button variant={selectMode ? 'default' : 'outline'} onClick={() => { setSelectMode(v => !v); setSelected(new Set()) }} className="gap-1.5">
              <Pencil className="h-4 w-4" /> {selectMode ? 'Done' : 'Select'}
            </Button>
          )}
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
                    {(() => {
                      const withAmt = importItems.filter(i => i.default_amount != null).length
                      return (
                        <>
                          <p className="text-sm text-ink-soft">
                            {importItems.length} line items found
                            {items.length > 0 && matches > 0 && <span className="text-muted-fg"> - {matches} match existing lines, {fresh} new</span>}
                          </p>
                          {/* Say how many amounts were actually read. A sheet that
                              imports at zero used to look exactly like one that
                              worked, until you opened the budget. */}
                          <p className={cn('text-xs', withAmt === 0 ? 'text-warn' : 'text-muted-fg')}>
                            {withAmt === 0
                              ? 'No amounts could be read from this sheet - the lines will come in blank for you to fill.'
                              : `${withAmt} of ${importItems.length} lines have an amount.`}
                          </p>
                          {withAmt > 0 && (
                            <label className="flex items-center gap-2 text-sm text-ink-soft">
                              <input type="checkbox" className="accent-[#C9F24A]" checked={importAmounts}
                                onChange={e => setImportAmounts(e.target.checked)} />
                              Bring the amounts in too
                              <span className="text-xs text-faint">(uncheck to import the line items only)</span>
                            </label>
                          )}
                        </>
                      )
                    })()}
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
                      {matches > 0 && (
                        <Button size="sm" variant="outline" disabled={applying} onClick={() => applyImportMerge(true)}>
                          {applying ? 'Applying…' : `Skip ${matches} duplicate${matches !== 1 ? 's' : ''}, add ${fresh} new`}
                        </Button>
                      )}
                      {/* Straight onto the budget, without going near a
                          template. On an empty budget this used to be the one
                          thing you could NOT do - the only button saved a
                          template first and applied that, and the template path
                          drops its amounts unless asked to keep them. */}
                      <Button size="sm" disabled={applying} onClick={() => applyImportMerge(false)}>
                        {applying ? 'Applying…'
                          : matches > 0
                            ? `Update ${matches} matching${fresh > 0 ? ` + add ${fresh} new` : ''}`
                            : `Add ${importItems.length} line${importItems.length !== 1 ? 's' : ''} to this budget`}
                      </Button>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" disabled={applying} onClick={saveImportedAsTemplateAndApply}
                        className="text-xs text-accent-fg hover:underline disabled:opacity-50">
                        Add them and save this sheet as a reusable template
                      </button>
                    </div>
                    {items.length > 0 && matches > 0 && (
                      <p className="text-xs text-faint">Neither option deletes anything - lines not in the sheet are left untouched.</p>
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

      {/* Standard soft costs picker */}
      {showSoft && (() => {
        const already = new Set(items.filter(i => i.cost_type === 'soft').map(i => normDesc(i.description)))
        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowSoft(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Add preconstruction &amp; soft costs</h2>
              <button onClick={() => setShowSoft(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-muted-fg">
                Added as blank lines you fill in as numbers firm up. They sit in their own section of the budget, so the trade
                totals stay clean while the job total stays honest.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {SOFT_COST_CATEGORIES.map(c => {
                  const exists = already.has(normDesc(c))
                  return (
                    <label key={c} className={cn('flex items-center gap-2 text-sm', exists ? 'text-faint' : 'text-ink-soft cursor-pointer')}>
                      <input type="checkbox" className="accent-[#C9F24A]" disabled={exists}
                        checked={!exists && softPicks.has(c)}
                        onChange={() => setSoftPicks(s => {
                          const next = new Set(s)
                          if (next.has(c)) next.delete(c); else next.add(c)
                          return next
                        })} />
                      {c}{exists && <span className="text-[10px] uppercase tracking-wide">on budget</span>}
                    </label>
                  )
                })}
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowSoft(false)}>Cancel</Button>
                <Button onClick={addSoftCosts} disabled={addingSoft || SOFT_COST_CATEGORIES.filter(c => softPicks.has(c) && !already.has(normDesc(c))).length === 0}>
                  {addingSoft ? 'Adding…' : 'Add selected'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

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
                <Input placeholder="e.g. New build - full custom" value={tplName} onChange={e => setTplName(e.target.value)} autoFocus />
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
              {s.note && <p className="text-[11px] text-faint mt-1 leading-snug">{s.note}</p>}
            </div>
          )
        })}
      </div>

      {/* Sellout → projected profit. Unlike the markup box below this shows on
          every job at every stage, because "am I still making money on this"
          is the question you ask most once work has started. */}
      {items.length > 0 && (
        <div className="rounded-xl border border-line bg-panel p-4">
          <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1">
                Sellout <span className="text-faint font-normal">· sale price or contract value</span>
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-fg">$</span>
                <Input type="number" min="0" step="1000" value={sellout} placeholder="0"
                  onChange={e => setSellout(e.target.value)} onBlur={saveSellout} className="w-40" />
                {savingSellout && <span className="text-xs text-faint">saving…</span>}
              </div>
              {selloutNum == null && Number(markupPct) > 0 && (
                <p className="mt-1 text-[11px] text-faint">Using cost + {markupPct}% markup until you set one.</p>
              )}
            </div>

            <div>
              <p className="text-xs font-medium text-muted-fg mb-1">Cost</p>
              <p className="text-lg font-semibold text-ink-soft">{money(totalBudgeted)}</p>
              <p className="text-[11px] text-faint">budgeted</p>
            </div>

            {revenue != null ? (
              <>
                <div>
                  <p className="text-xs font-medium text-muted-fg mb-1">Projected profit</p>
                  <p className={cn('text-2xl font-bold', (projectedProfit ?? 0) < 0 ? 'text-danger' : 'text-success')}>
                    {(projectedProfit ?? 0) < 0 ? '-' : ''}{money(Math.abs(projectedProfit ?? 0))}
                  </p>
                  <p className="text-[11px] text-faint">
                    {margin != null ? `${margin.toFixed(1)}% margin` : ''}
                    {revenueSource === 'markup' ? ' · from markup' : ''}
                  </p>
                </div>
                {totalActual > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-fg mb-1">Against actual spend</p>
                    <p className={cn('text-lg font-semibold', (profitToDate ?? 0) < 0 ? 'text-danger' : 'text-ink-soft')}>
                      {(profitToDate ?? 0) < 0 ? '-' : ''}{money(Math.abs(profitToDate ?? 0))}
                    </p>
                    <p className="text-[11px] text-faint">{money(totalActual)} spent so far</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-faint max-w-xs">
                Enter what this job sells for - or what you're contracted at - and your profit tracks itself as the
                budget fills in.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Hard vs soft split. Every job carries costs that aren't a trade -
          plans, permits, builders risk, survey, loan interest - and they belong
          in the same budget so the job total is the real total. */}
      {softItems.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-medium text-muted-fg mb-1">Hard costs · construction</p>
            <p className="text-xl font-bold text-ink">{money(totalHard)}</p>
            <p className="text-xs text-faint mt-0.5">{hardItems.length} line{hardItems.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="rounded-xl border border-info/30 bg-info-tint p-4">
            <p className="text-xs font-medium text-info mb-1">Soft costs · preconstruction &amp; carrying</p>
            <p className="text-xl font-bold text-info">{money(totalSoft)}</p>
            <p className="text-xs text-muted-fg mt-0.5">
              {softItems.length} line{softItems.length !== 1 ? 's' : ''}
              {totalBudgeted > 0 && ` · ${((totalSoft / totalBudgeted) * 100).toFixed(0)}% of budget`}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4 flex flex-col justify-between">
            <div>
              <p className="text-xs font-medium text-muted-fg mb-1">All-in project cost</p>
              <p className="text-xl font-bold text-ink">{money(totalBudgeted)}</p>
            </div>
            <button onClick={() => setShowSoft(true)} className="mt-2 text-xs font-medium text-accent-fg hover:underline text-left">
              Add more soft costs →
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-info/40 bg-info-tint/40 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink-soft">No soft costs on this budget yet</p>
            <p className="text-xs text-muted-fg mt-0.5">
              Land, plans, permits, builders risk, survey, loan interest, contingency - the money spent before and around the trades.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShowSoft(true)} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> Add preconstruction costs
          </Button>
        </div>
      )}

      {/* Won job: no markup editing, just reprint the proposal that was sent. */}
      {showProposalLink && (
        <a href={`/projects/${params.id}/proposal/print`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-fg hover:underline">
          <FileText className="h-4 w-4" /> View proposal
        </a>
      )}

      {/* Estimate → Proposal: markup + client price + generate a client PDF.
          Pre-award only, simple-billing jobs only. */}
      {showEstimateBar && (
        <div className="rounded-xl border border-accent/30 bg-accent-tint/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-5">
              <div>
                <label className="block text-xs font-medium text-muted-fg mb-1">Markup</label>
                <div className="flex items-center gap-1.5">
                  <Input type="number" min="0" step="0.5" value={markupPct}
                    onChange={e => setMarkupPct(e.target.value)}
                    onBlur={saveMarkup}
                    className="w-24" />
                  <span className="text-sm font-medium text-muted-fg">%</span>
                  {savingMarkup && <span className="text-xs text-faint">saving…</span>}
                </div>
                <p className="mt-1 text-[11px] text-faint">Added on top of cost. Also your billed fee.</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-fg mb-1">Cost (internal)</p>
                <p className="text-lg font-semibold text-ink-soft">{money(totalBudgeted)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-fg mb-1">Client price</p>
                <p className="text-2xl font-bold text-accent-fg">{money(totalBudgeted * (1 + (Number(markupPct) || 0) / 100))}</p>
              </div>
            </div>
            <a
              href={`/projects/${params.id}/proposal/print`}
              target="_blank" rel="noreferrer"
              onClick={() => { if (!savingMarkup) saveMarkup() }}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent/90"
            >
              <FileText className="h-4 w-4" /> Generate Proposal
            </a>
          </div>
        </div>
      )}

      {/* Interior / Exterior breakdown */}
      {(spaceTotals.interior > 0 || spaceTotals.exterior > 0 || projectSqft.interior || projectSqft.exterior) && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-info/30 bg-info-tint p-4">
            <p className="text-xs font-medium text-info mb-1">Interior {projectSqft.interior ? `· ${Number(projectSqft.interior).toLocaleString()} sq ft` : ''}</p>
            <p className="text-xl font-bold text-info">{money(spaceTotals.interior)}</p>
            {projectSqft.interior ? <p className="text-xs text-muted-fg mt-0.5">{money(spaceTotals.interior / Number(projectSqft.interior))} / sq ft</p> : null}
          </div>
          <div className="rounded-xl border border-warn/30 bg-warn-tint p-4">
            <p className="text-xs font-medium text-warn mb-1">Exterior {projectSqft.exterior ? `· ${Number(projectSqft.exterior).toLocaleString()} sq ft` : ''}</p>
            <p className="text-xl font-bold text-warn">{money(spaceTotals.exterior)}</p>
            {projectSqft.exterior ? <p className="text-xs text-muted-fg mt-0.5">{money(spaceTotals.exterior / Number(projectSqft.exterior))} / sq ft</p> : null}
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="text-xs font-medium text-muted-fg mb-1">Grand Total{spaceTotals.unassigned > 0 ? ` · ${money(spaceTotals.unassigned)} unassigned` : ''}</p>
            <p className="text-xl font-bold text-ink">{money(spaceTotals.interior + spaceTotals.exterior + spaceTotals.unassigned)}</p>
          </div>
        </div>
      )}

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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <SearchableSelect className="rounded-lg border border-line px-3 py-2 text-sm bg-panel"
              value={form.cost_type} onChange={e => {
                const next = e.target.value === 'soft' ? 'soft' : 'hard'
                const list = categoryOptions(next, knownCategories)
                // Keep the category valid for the list now on screen.
                setForm(f => ({ ...f, cost_type: next, category: list.includes(f.category) ? f.category : list[0] }))
              }}>
              <option value="hard">Hard cost (construction)</option>
              <option value="soft">Soft cost (preconstruction / carrying)</option>
            </SearchableSelect>
            <CategoryPicker
              costType={form.cost_type} known={knownCategories} value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))} />
            <input className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Cost code (optional)"
              value={form.cost_code} onChange={e => setForm({ ...form, cost_code: e.target.value })} />
            <input className="rounded-lg border border-line px-3 py-2 text-sm sm:col-span-2 lg:col-span-1" placeholder="Description *"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <input type="number" className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Budgeted $"
              value={form.budgeted_amount} onChange={e => setForm({ ...form, budgeted_amount: e.target.value })} />
            <SearchableSelect className="rounded-lg border border-line px-3 py-2 text-sm bg-panel"
              value={form.space_type} onChange={e => setForm({ ...form, space_type: e.target.value })}>
              <option value="">Space: unassigned</option>
              <option value="interior">Interior</option>
              <option value="exterior">Exterior</option>
            </SearchableSelect>
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
                <option value="">Not linked - enter manually</option>
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

      {/* Bulk selection bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger-tint px-4 py-2.5">
          <p className="text-sm font-medium text-danger">{selected.size} line{selected.size !== 1 ? 's' : ''} selected</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-muted-fg hover:text-ink-soft px-2 py-1">Clear</button>
            <Button size="sm" variant="destructive" disabled={bulkDeleting} onClick={bulkRemove} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" /> {bulkDeleting ? 'Deleting…' : `Delete ${selected.size} line${selected.size !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </div>
      )}

      {/* Budget table */}
      {items.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Wallet className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No budget lines yet. Add your first cost line to start tracking.</p>
        </div>
      ) : sections.length === 0 ? (
        <div className="bg-panel rounded-xl border border-line p-10 text-center">
          <Search className="h-8 w-8 text-faint mx-auto mb-3" />
          <p className="text-sm text-muted-fg">No line items match “{search}”.</p>
        </div>
      ) : (
        <div className="bg-panel rounded-xl border border-line overflow-hidden">
          {/* header row (desktop) */}
          <div className={cn('hidden md:grid gap-2 px-4 py-2.5 border-b border-line-soft text-xs font-semibold text-faint uppercase tracking-wide items-center',
            selectMode ? 'grid-cols-[1.5rem_1fr_repeat(4,minmax(0,7rem))_3rem]' : 'grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem]')}>
            {selectMode && (
              <input type="checkbox" className="accent-danger" checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))}
                onChange={() => toggleSelectAll(filtered)} title="Select all" />
            )}
            <span>Line Item</span>
            <span className="text-right">Budgeted</span>
            <span className="text-right">Committed</span>
            <span className="text-right">Actual</span>
            <span className="text-right">Variance</span>
            <span />
          </div>

          {sections.map(section => (
          <div key={section.key}>
          {showSectionBands && (
            <div className={cn('flex items-center justify-between gap-2 px-4 py-2.5 border-y border-line',
              section.key === 'soft' ? 'bg-info-tint' : 'bg-muted')}>
              <span className={cn('text-xs font-bold uppercase tracking-wider', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>
                {section.label}
              </span>
              <span className={cn('text-sm font-bold', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>{money(section.total)}</span>
            </div>
          )}
          {section.groups.map(group => {
            const gBudget = group.rows.reduce((s, i) => s + revisedOf(i), 0)
            return (
              <div key={group.category}>
                <div className="bg-surface px-4 py-2 flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    {selectMode && (
                      <input type="checkbox" className="accent-danger" checked={group.rows.every(i => selected.has(i.id))}
                        onChange={() => toggleSelectAll(group.rows)} />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-fg">{group.category}</span>
                  </label>
                  <span className="text-xs font-semibold text-muted-fg">{money(gBudget)}</span>
                </div>
                <div className="divide-y divide-line-soft">
                  {group.rows.map(item => {
                    const revised = revisedOf(item)
                    const changes = Number(item.change_orders_amount || 0)
                    const variance = revised - Number(item.actual_amount || 0)
                    const over = variance < 0
                    const overCommitted = revised > 0 && (Number(item.committed_amount || 0) - revised) >= 1
                    if (editingId === item.id) {
                      return (
                        <div key={item.id} className="px-4 py-3 bg-accent-tint/40 space-y-2">
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                            <Field label="Cost type">
                              <SearchableSelect className="rounded-lg border border-line px-2.5 py-1.5 text-sm bg-panel"
                                value={editForm.cost_type} onChange={e => {
                                  const next = e.target.value === 'soft' ? 'soft' : 'hard'
                                  const list = categoryOptions(next, knownCategories)
                                  setEditForm(f => ({ ...f, cost_type: next, category: list.includes(f.category) ? f.category : list[0] }))
                                }}>
                                <option value="hard">Hard cost (construction)</option>
                                <option value="soft">Soft cost (preconstruction / carrying)</option>
                              </SearchableSelect>
                            </Field>
                            <Field label="Category">
                              <CategoryPicker compact
                                costType={editForm.cost_type} known={knownCategories} value={editForm.category}
                                onChange={v => setEditForm(f => ({ ...f, category: v }))} />
                            </Field>
                            <Field label="Cost code">
                              <input className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="optional"
                                value={editForm.cost_code} onChange={e => setEditForm({ ...editForm, cost_code: e.target.value })} />
                            </Field>
                            <Field label="Description" className="sm:col-span-2 lg:col-span-1">
                              <input className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="What this covers"
                                value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                            </Field>
                            <Field label="Budgeted ($)">
                              <input type="number" className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm" placeholder="0"
                                value={editForm.budgeted_amount} onChange={e => setEditForm({ ...editForm, budgeted_amount: e.target.value })} />
                            </Field>
                            <Field label="Space">
                              <SearchableSelect className="w-full rounded-lg border border-line px-2.5 py-1.5 text-sm bg-panel"
                                value={editForm.space_type} onChange={e => setEditForm({ ...editForm, space_type: e.target.value })}>
                                <option value="">Unassigned</option>
                                <option value="interior">Interior</option>
                                <option value="exterior">Exterior</option>
                              </SearchableSelect>
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
                                <option value="">Not linked - enter manually</option>
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
                      <div key={item.id} className={cn('group md:grid md:gap-2 md:items-center px-4 py-3 hover:bg-surface transition-colors',
                        selectMode ? 'md:grid-cols-[1.5rem_1fr_repeat(4,minmax(0,7rem))_3rem]' : 'md:grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem]',
                        selectMode && selected.has(item.id) && 'bg-danger-tint/40')}>
                        {selectMode && (
                          <div className="flex items-center mb-2 md:mb-0">
                            <input type="checkbox" className="accent-danger" checked={selected.has(item.id)} onChange={() => toggleSelect(item.id)} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink-soft truncate">
                            {item.cost_code && <span className="text-faint font-normal mr-1.5">{item.cost_code}</span>}
                            {item.description}
                            {item.space_type && (
                              <span className={cn('ml-1.5 rounded-full px-1.5 py-0 text-[10px] font-medium align-middle',
                                item.space_type === 'interior' ? 'bg-info-tint text-info' : 'bg-warn-tint text-warn')}>
                                {SPACE_LABELS[item.space_type]}
                              </span>
                            )}
                          </p>
                          {item.linked ? (
                            <a href={`/projects/${params.id}/team`} onClick={e => e.stopPropagation()}
                              className="text-xs text-accent-fg truncate flex items-center gap-1 hover:underline w-fit">
                              <LinkIcon className="h-3 w-3 shrink-0" /> Linked · {item.linked_label}
                            </a>
                          ) : item.notes ? (
                            <p className="text-xs text-faint truncate">{item.notes}</p>
                          ) : null}
                        </div>
                        <div className="flex justify-between md:block md:text-right mt-2 md:mt-0 text-sm">
                          <span className="md:hidden text-xs text-faint">Budgeted</span>
                          {/* Revised, with the change orders spelled out - a
                              budget that grew silently is worse than one that
                              never grew. */}
                          <span className="md:inline-flex md:flex-col md:items-end">
                            <span className="text-ink-soft">{money(revised)}</span>
                            {changes !== 0 && (
                              <span className="ml-1 md:ml-0 text-[11px] text-info"
                                title={`${money(item.budgeted_amount)} original + ${money(changes)} approved change orders`}>
                                incl. {money(changes)} CO
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm">
                          <span className="md:hidden text-xs text-faint">Committed</span>
                          <span
                            title={overCommitted ? `Committed ${money(item.committed_amount)} exceeds budget ${money(revised)} by ${money(Number(item.committed_amount) - revised)}` : undefined}
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
                            {variance === 0 ? '-' : `${over ? '-' : ''}${money(Math.abs(variance))}`}
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
          </div>
          ))}

          {/* totals footer */}
          <div className={cn('hidden md:grid gap-2 px-4 py-3 border-t-2 border-line bg-surface text-sm font-bold text-ink-soft',
            selectMode ? 'grid-cols-[1.5rem_1fr_repeat(4,minmax(0,7rem))_3rem]' : 'grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem]')}>
            {selectMode && <span />}
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

      {/* Materials - receipts assigned to this job (linked ones roll into a line's Actual) */}
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

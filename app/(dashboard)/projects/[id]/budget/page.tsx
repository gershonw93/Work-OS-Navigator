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
import { InfoHint } from '@/components/ui/info-hint'
import { LockedField } from '@/components/ui/locked-field'
import { BudgetLineDetail } from '@/components/projects/budget-line-detail'
import {
  type ContractType, type Profit, CONTRACT_TYPES, CONTRACT_LABEL, CONTRACT_BLURB,
  asContractType, usesMarkup, usesRevenue, profitFor, revenueLabel, revenueHint, revenueAsk,
} from '@/lib/contract-type'

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

/**
 * Projected profit, and where it stands against money already spent.
 *
 * Draws nothing when there is nothing to report. On a fixed-price job that
 * means no contract value entered; on cost-plus it means no rate and no fee
 * earned. Either way an absent panel is the honest answer - this used to fall
 * back to markup-on-cost and print a confident green margin for a job whose
 * price nobody had ever given it.
 */
function ProfitFigures({ profit, totalActual }: { profit: Profit; totalActual: number }) {
  if (profit.projected == null) return null
  const earned = profit.basis === 'markup'
  return (
    <>
      <div>
        <p className="text-xs font-medium text-muted-fg">
          {earned ? 'Your fee' : 'Projected profit'}
          <InfoHint className="ml-1 align-middle" text={earned
            ? 'Your markup across the whole budget, if the job lands where it is budgeted.\n\nOn cost-plus this is the profit - there is no contract value to measure against, because what you are paid IS the fee.'
            : 'What is left after costs, if the job lands on budget.\n\nThe figure you set, less every budget line added up. Approved change orders are already in that cost.'} />
        </p>
        <p className={cn('text-lg font-bold', profit.projected < 0 ? 'text-danger' : 'text-success')}>
          {profit.projected < 0 ? '-' : ''}{money(Math.abs(profit.projected))}
          {profit.projectedMargin != null && (
            <span className="ml-1.5 text-[11px] font-normal text-faint">
              {profit.projectedMargin.toFixed(1)}% margin
            </span>
          )}
        </p>
      </div>
      {totalActual > 0 && profit.toDate != null && (
        <div>
          <p className="text-xs font-medium text-muted-fg">
            {earned ? 'Earned so far' : 'Against actual spend'}
            <InfoHint className="ml-1 align-middle" text={earned
              ? 'The fee on costs actually booked, worked out invoice by invoice.\n\nNot the rate multiplied by what you have spent: an invoice billed at cost earns nothing, and one given its own percent uses that percent. This is the same figure as the fee on Payments & Escrow.'
              : 'Where profit stands against money genuinely spent, rather than against the budget.\n\nThe gap between this and projected profit is what is still to come.'} />
          </p>
          <p className={cn('text-lg font-semibold', profit.toDate < 0 ? 'text-danger' : 'text-ink-soft')}>
            {profit.toDate < 0 ? '-' : ''}{money(Math.abs(profit.toDate))}
            <span className="ml-1.5 text-[11px] font-normal text-faint">of {money(totalActual)} spent</span>
          </p>
        </div>
      )}
    </>
  )
}

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
  // contract it's the contract value. Not asked at all on cost-plus, where the
  // markup IS the pay and there is no such figure.
  const [sellout, setSellout] = useState('')
  const [savingSellout, setSavingSellout] = useState(false)
  // How the job PAYS. Null until answered - which is asked here, once, instead
  // of showing the revenue box and the markup box together and telling the
  // reader to leave one of them empty.
  const [contractType, setContractType] = useState<ContractType | null>(null)
  const [savingContract, setSavingContract] = useState(false)
  /** Cost-plus fee actually earned so far, invoice by invoice. */
  const [markupEarned, setMarkupEarned] = useState(0)
  /** Which line's detail popup is open - what is actually behind the number. */
  const [detailLineId, setDetailLineId] = useState<string | null>(null)
  const [projectStatus, setProjectStatus] = useState<string | null>(null)
  /** Only used to pre-select the contract-type picker. */
  const [hasClient, setHasClient] = useState(false)
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
      setHasClient(!!d.has_client)
      setBillingMode(d.billing_mode ?? 'simple')
      setKnownCategories(d.known_categories ?? [])
      setSellout(d.sellout_amount != null ? String(d.sellout_amount) : '')
      setContractType(asContractType(d.contract_type))
      setMarkupEarned(Number(d.markup_earned) || 0)
    }
    setLoading(false)
  }

  /** Answer "how does this job pay" - asked once, then the screen settles. */
  async function saveContractType(next: ContractType) {
    setSavingContract(true)
    setContractType(next)
    try {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contract_type: next }),
      })
      await load()
    } finally {
      setSavingContract(false)
    }
  }

  // Persist the markup % (as a fraction) on the project. Reuses the payments
  // fee endpoint - markup and the billed contractor fee are the same number.
  async function saveMarkup() { return saveMarkupValue(markupPct) }

  // Takes the value rather than reading state: the locked field hands over the
  // committed draft, and state set in the same tick would still be the old one.
  async function saveMarkupValue(raw: string) {
    setSavingMarkup(true)
    try {
      const token = await getToken()
      const frac = Math.max(0, (Number(raw) || 0) / 100)
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
  async function saveSellout() { return saveSelloutValue(sellout) }

  async function saveSelloutValue(raw: string) {
    setSavingSellout(true)
    try {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellout_amount: raw.trim() === '' ? null : Number(raw) || 0 }),
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
  /**
   * Budget left on a line, counting signed contracts.
   *
   * NOT committed − actual: that is how much of the contract is still to be
   * invoiced, which is a real number but a different question. Variance asks
   * "will this line beat or blow its budget", and the best answer today is the
   * budget less whichever is bigger, what you have signed or what you have
   * already been billed. Same basis as the Left to spend tile, which used to
   * disagree with this column.
   */
  const exposureOf = (i: BudgetItem) => {
    const receipts = Number(i.materials_amount || 0)
    const billed = Number(i.actual_amount || 0) - receipts
    return Math.max(Number(i.committed_amount || 0), billed) + receipts
  }
  const variance = (i: BudgetItem) => revisedOf(i) - exposureOf(i)
  /** Contract signed but not yet invoiced - the money that has no bill yet. */
  const toBill = (i: BudgetItem) =>
    Math.max(0, Number(i.committed_amount || 0) - (Number(i.actual_amount || 0) - Number(i.materials_amount || 0)))
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

  const selloutNum = sellout.trim() === '' ? null : Number(sellout) || 0
  // "Sellout" is developer language - it is what a spec house SELLS for. On a
  // custom home you are not selling anything; you are charging a contract
  // value. Both come off the contract type now rather than off a guess about
  // whether somebody typed a client name.
  const revLabel = revenueLabel(contractType)
  const revHint = revenueHint(contractType)
  const revAsk = revenueAsk(contractType)
  const askContract = items.length > 0 && contractType == null
  const showRevenuePanel = items.length > 0 && usesRevenue(contractType)
  const showMarkupPanel = items.length > 0 && usesMarkup(contractType) && billingMode !== 'aia'

  // Profit, or nothing at all. On cost-plus the fee IS the profit, so it is
  // measured from the markup rather than from a contract value the job does not
  // have; on a fixed-price or spec job it is revenue less cost. If the figure
  // it needs was never entered, every field comes back null and the panel does
  // not draw - which is what stops the app inventing a confident green margin
  // for a job whose price nobody ever told it.
  const profit = profitFor({
    contractType,
    revenue: selloutNum,
    budgetedCost: totalBudgeted,
    actualCost: totalActual,
    markupEarned,
    markupPct: Number(markupPct) || 0,
  })

  // `help` is the hover explainer: what the number means and how it is worked
  // out, in the words someone would use out loud.
  const statCards = [
    {
      label: 'Total Budget', value: totalBudgeted, color: 'text-ink', bg: 'bg-panel', icon: DollarSign,
      // A budget that grew because of approved change orders should say so.
      note: approvedChanges !== 0
        ? `${money(originalBudget)} original + ${money(approvedChanges)} approved changes`
        : undefined,
      help: approvedChanges !== 0
        ? `What this job is budgeted at now.\n\nEvery line's budget added up (${money(originalBudget)}), plus ${money(approvedChanges)} of approved change orders. Rejected and pending change orders are not counted.`
        : 'What this job is budgeted at.\n\nEvery line\'s budget added up. Approved change orders are added on top as they land; nothing pending counts.',
    },
    {
      label: 'Committed', value: totalCommitted, color: 'text-info', bg: 'bg-info-tint', icon: TrendingUp,
      note: committedNotBilled > 0 ? `${money(committedNotBilled)} signed, not yet billed` : undefined,
      help: `What you have promised in signed contracts.\n\nEvery subcontract on the job added up. This is money that is gone whether or not the sub has invoiced yet.${committedNotBilled > 0 ? `\n\n${money(committedNotBilled)} of it has not been invoiced yet - that is the bit that catches people out.` : ''}`,
    },
    {
      label: 'Actual Spent', value: totalActual, color: 'text-success', bg: 'bg-success-tint', icon: CheckCircle2,
      help: 'What has actually been billed to you.\n\nEvery invoice that is approved, sent for payment, or paid - plus material receipts assigned to a line. An invoice sitting in Pending Approval does NOT count yet; approving it is what moves this number.',
    },
    {
      label: overBudget ? 'Over Budget' : 'Left to spend',
      value: Math.abs(remaining),
      color: overBudget ? 'text-danger' : 'text-warn',
      bg: overBudget ? 'bg-danger-tint' : 'bg-warn-tint',
      icon: overBudget ? TrendingDown : Wallet,
      // The whole point of the fix: this counts contracts you have signed, not
      // just invoices you have received.
      note: 'After signed contracts, not just invoices',
      help: `Budget you have not spoken for yet.\n\nTotal budget, less whichever is bigger on each line: what you have signed, or what you have already been billed.\n\nIt is deliberately NOT budget minus invoices. If you have budgeted ${money(totalBudgeted)}, signed ${money(totalCommitted)} and been billed ${money(totalActual)}, the money still free to spend is ${money(Math.max(remaining, 0))} - not ${money(Math.max(totalBudgeted - totalActual, 0))}.`,
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
      {detailLineId && (
        <BudgetLineDetail
          projectId={params.id}
          lineId={detailLineId}
          projectMarkup={Number(markupPct) || 0}
          costPlus={usesMarkup(contractType)}
          onClose={() => setDetailLineId(null)}
          // A rate changed in there moves the fee earned on this screen.
          onChanged={load}
          // Editing the line itself reuses the row's own form rather than
          // building a second one that could drift from it.
          onEdit={() => {
            const item = items.find(i => i.id === detailLineId)
            setDetailLineId(null)
            if (item) startEdit(item)
          }}
        />
      )}

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
                {/* These four are the numbers people argue about. "How is that
                    worked out?" should not require asking someone. */}
                {s.help && <InfoHint text={s.help} align="right" className="ml-auto" />}
              </div>
              <p className={cn('text-2xl font-bold', s.color)}>{money(s.value)}</p>
              {s.note && <p className="text-[11px] text-faint mt-1 leading-snug">{s.note}</p>}
            </div>
          )
        })}
      </div>

      {/* How the job pays → what it earns.
          Asked ONCE. Before this the screen showed the revenue box and the
          markup box together and told you to leave one empty, because it had no
          idea which kind of job this was - and on a cost-plus custom home the
          revenue box is asking a question with no answer. */}
      {askContract ? (
        <div className="rounded-xl border border-dashed border-accent/40 bg-accent-tint/20 p-4">
          <p className="text-sm font-medium text-ink">How does this job pay you?</p>
          <p className="mt-0.5 text-xs text-muted-fg">
            Asked once. It decides whether this screen tracks your markup or a contract value - and it is the
            difference between a real profit figure and a made-up one.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {CONTRACT_TYPES.map(t => (
              <button
                key={t}
                type="button"
                disabled={savingContract}
                onClick={() => saveContractType(t)}
                className="rounded-lg border border-line bg-panel px-3 py-2 text-left transition-colors hover:border-accent hover:bg-accent-tint/40 disabled:opacity-50"
              >
                <span className="block text-sm font-semibold text-ink">{CONTRACT_LABEL[t]}</span>
                <span className="block text-[11px] text-muted-fg">{CONTRACT_BLURB[t]}</span>
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] text-faint">
            {hasClient
              ? 'This job has a client on it, so it is most likely one of the first two.'
              : 'No client is named on this job, which usually means you are building it to sell.'}{' '}
            You can change it later in Edit project.
          </p>
        </div>
      ) : showRevenuePanel || showMarkupPanel ? (
        /* A row, not a panel. This was a bordered card carrying the same weight
           as the stat tiles directly above it, and repeating one of them -
           "Cost / budgeted" is Total Budget under another name. Dropped, along
           with the footnote paragraph, which is now on the hover where the rest
           of the explaining already lives. */
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3 border-y border-line-soft py-3">
          {showMarkupPanel ? (
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1">
                Markup <span className="text-faint font-normal">· your fee on cost</span>
                <InfoHint className="ml-1 align-middle" text={'The percentage you add on top of every cost.\n\nOn a cost-plus job this IS what you are paid, so it is the only revenue figure this screen needs.\n\nIt is the default rate. Any single invoice can be billed at cost or given its own percent on the Invoices tab - a permit fee or a pass-through does not have to follow it - and the fee earned here follows those, not this.'} />
              </label>
              {/* Read-only until you ask to change it. This drives what the
                  client is billed, and as a live input it sat one stray click
                  away from moving on a screen people scroll through to READ. */}
              <LockedField
                ariaLabel="markup percent"
                value={markupPct}
                display={`${Number(markupPct) || 0}%`}
                suffix="%"
                inputClassName="w-20"
                saving={savingMarkup}
                onSave={next => { setMarkupPct(next); saveMarkupValue(next) }}
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-muted-fg mb-1">
                {revLabel} <span className="text-faint font-normal">· {revHint}</span>
                <InfoHint className="ml-1 align-middle" text={
                  (contractType === 'spec'
                    ? 'The sale price - what you expect this to sell for.'
                    : 'Your contract value - the agreed price this client is paying for the job.')
                  + '\n\nProfit is measured against it: as the budget fills in, and again against what has actually been spent.'
                } />
              </label>
              {/* Same reasoning as the markup: this is what profit is measured
                  against, so it does not sit live under the cursor. */}
              <LockedField
                ariaLabel={revLabel.toLowerCase()}
                value={sellout}
                display={selloutNum != null ? money(selloutNum) : 'Not set'}
                prefix="$"
                inputClassName="w-36"
                saving={savingSellout}
                onSave={next => { setSellout(next); saveSelloutValue(next) }}
              />
            </div>
          )}

          <ProfitFigures profit={profit} totalActual={totalActual} />
        </div>
      ) : null}

      {/* Hard vs soft split. Every job carries costs that aren't a trade -
          plans, permits, builders risk, survey, loan interest - and they belong
          in the same budget so the job total is the real total. */}
      {/* Only worth its own row once soft costs carry money. With none, all
          three tiles printed the same figure as Total Budget directly above
          them - three ways of saying one number. */}
      {totalSoft > 0 ? (
        <div className="rounded-xl border border-line bg-panel px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
          <div>
            <p className="text-xs font-medium text-muted-fg">Hard costs · construction</p>
            <p className="text-lg font-bold text-ink">{money(totalHard)}
              <span className="ml-1.5 text-xs font-normal text-faint">{hardItems.length} line{hardItems.length !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-info">Soft costs · preconstruction &amp; carrying</p>
            <p className="text-lg font-bold text-info">{money(totalSoft)}
              <span className="ml-1.5 text-xs font-normal text-muted-fg">
                {totalBudgeted > 0 ? `${((totalSoft / totalBudgeted) * 100).toFixed(0)}% of budget` : `${softItems.length} lines`}
              </span>
            </p>
          </div>
          <button onClick={() => setShowSoft(true)} className="ml-auto text-xs font-medium text-accent-fg hover:underline">
            Add more soft costs →
          </button>
        </div>
      ) : projectStatus === 'planning' ? (
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
      ) : null}

      {/* Secondary ACTIONS. Markup used to sit in this row too, which put a
          persistent project setting next to a button that opens a modal - two
          unrelated things sharing a line for layout reasons rather than because
          they belong together. It now lives with the money it decides: in the
          cost-plus panel above, and in Edit project. */}
      {(totalSoft === 0 && projectStatus !== 'planning') || showProposalLink ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
          {totalSoft === 0 && projectStatus !== 'planning' && (
            <button onClick={() => setShowSoft(true)}
              className="inline-flex items-center gap-1.5 font-medium text-accent-fg hover:underline">
              <Plus className="h-3.5 w-3.5" /> Add preconstruction / soft costs
            </button>
          )}
          {/* Won job: reprint the proposal that was sent. */}
          {showProposalLink && (
            <a href={`/projects/${params.id}/proposal/print`} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-accent-fg hover:underline">
              <FileText className="h-4 w-4" /> View proposal
            </a>
          )}
        </div>
      ) : null}

      {/* Estimate → Proposal: markup + client price + generate a client PDF.
          Pre-award only, simple-billing jobs only. */}
      {showEstimateBar && (
        <div className="rounded-xl border border-accent/30 bg-accent-tint/30 p-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-5">
              {/* On a cost-plus job the rate is already editable in the panel
                  above, where it is the pay rather than a bid input. Two boxes
                  writing the same field on one screen is how it got confusing
                  in the first place. */}
              {showMarkupPanel ? (
                <div>
                  <p className="text-xs font-medium text-muted-fg mb-1">Markup</p>
                  <p className="text-lg font-semibold text-ink-soft">{Number(markupPct) || 0}%</p>
                  <p className="mt-1 text-[11px] text-faint">Set above.</p>
                </div>
              ) : (
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
                  <p className="mt-1 text-[11px] text-faint">Added on top of cost, to price the proposal.</p>
                </div>
              )}
              <div>
                <p className="text-xs font-medium text-muted-fg mb-1">Cost (internal)</p>
                <p className="text-lg font-semibold text-ink-soft">{money(totalBudgeted)}</p>
              </div>
              <div>
                {/* On cost-plus this is not a price - it is what the job is
                    estimated to come to. The proposal says the same. */}
                <p className="text-xs font-medium text-muted-fg mb-1">{showMarkupPanel ? 'Estimated total' : 'Client price'}</p>
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
      {/* Interior/exterior split. The old Grand Total tile here was Total
          Budget a third time - and it disagreed with it, because the split
          ignored approved change orders. Dropped; the unassigned remainder is
          the only part that was not already on screen. */}
      {(spaceTotals.interior > 0 || spaceTotals.exterior > 0) && (
        // A line of text, not a panel. It is a breakdown of a number already on
        // screen, so it should not carry the same weight as one.
        <p className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-sm text-muted-fg">
          <span>
            <span className="font-semibold text-ink-soft">{money(spaceTotals.interior)}</span> interior
            {projectSqft.interior
              ? <span className="text-faint"> · {money(spaceTotals.interior / Number(projectSqft.interior))}/sq ft</span>
              : null}
          </span>
          <span>
            <span className="font-semibold text-ink-soft">{money(spaceTotals.exterior)}</span> exterior
            {projectSqft.exterior
              ? <span className="text-faint"> · {money(spaceTotals.exterior / Number(projectSqft.exterior))}/sq ft</span>
              : null}
          </span>
          {spaceTotals.unassigned > 0 && (
            <span className="text-faint">{money(spaceTotals.unassigned)} not assigned to a space</span>
          )}
        </p>
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
            {/* Same explainers as the tiles, on the columns they describe. */}
            <span className="text-right inline-flex items-center justify-end gap-1">
              Budgeted
              <InfoHint align="right" text={'What this line is budgeted at.\n\nWhat you estimated, plus any approved change orders that landed on it. A line that grew shows "incl. $X CO" underneath, so the budget never changes silently.'} />
            </span>
            <span className="text-right inline-flex items-center justify-end gap-1">
              Committed
              <InfoHint align="right" text={'What you have signed for on this line.\n\nThe contract amount of the subcontract linked to it. On an unlinked line it is whatever you typed. Turns red when it is more than the line is budgeted at.'} />
            </span>
            <span className="text-right inline-flex items-center justify-end gap-1">
              Actual
              <InfoHint align="right" text={'What has actually been billed on this line.\n\nInvoices from the linked sub that are approved, sent for payment or paid, plus any material receipts assigned here. An invoice awaiting approval does not count yet.'} />
            </span>
            <span className="text-right inline-flex items-center justify-end gap-1">
              Variance
              <InfoHint align="right" text={'Budget left on this line.\n\nBudgeted less whichever is bigger: what you have signed, or what you have already been billed. Green is under, red is over.\n\nIt is NOT committed minus actual - that is how much of the contract is still to be invoiced, which is on the hover over the number itself.'} />
            </span>
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
                    // Counts the signed contract, not only what has been billed.
                    const variance = revised - exposureOf(item)
                    const stillToBill = toBill(item)
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
                      <div key={item.id}
                        // The whole row opens the line. In select mode it toggles
                        // the tick instead, which is what a click means there.
                        // Buttons and links inside stop the event themselves.
                        onClick={() => selectMode ? toggleSelect(item.id) : setDetailLineId(item.id)}
                        className={cn('group cursor-pointer md:grid md:gap-2 md:items-center px-4 py-3 hover:bg-surface transition-colors',
                        selectMode ? 'md:grid-cols-[1.5rem_1fr_repeat(4,minmax(0,7rem))_3rem]' : 'md:grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem]',
                        selectMode && selected.has(item.id) && 'bg-danger-tint/40')}>
                        {selectMode && (
                          <div className="flex items-center mb-2 md:mb-0">
                            <input type="checkbox" className="accent-danger" checked={selected.has(item.id)}
                              onClick={e => e.stopPropagation()} onChange={() => toggleSelect(item.id)} />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="block max-w-full truncate text-sm font-medium text-ink-soft group-hover:text-accent-fg">
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
                          <span
                            title={
                              `Budget ${money(revised)} less ${money(exposureOf(item))} committed-or-billed` +
                              (stillToBill > 0 ? ` · ${money(stillToBill)} of the contract is signed but not yet invoiced` : '')
                            }
                            className={variance === 0 ? 'text-faint' : over ? 'text-danger' : 'text-success'}>
                            {variance === 0 ? '-' : `${over ? '-' : ''}${money(Math.abs(variance))}`}
                          </span>
                        </div>
                        <div className="flex justify-end gap-1 mt-2 md:mt-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); startEdit(item) }} className="p-1.5 rounded-lg text-faint hover:bg-muted hover:text-muted-fg">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={e => { e.stopPropagation(); remove(item.id) }} className="p-1.5 rounded-lg text-faint hover:bg-danger-tint hover:text-danger">
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

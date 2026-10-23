'use client'

import { StatTile, type PillTone } from '@/components/bills/detail-parts'
import { useEffect, useMemo, useRef, useState } from 'react'
import { autoFocusOnDesktop } from '@/lib/auto-focus'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { createClient } from '@/lib/supabase/client'
import { Wallet, DollarSign, CheckCircle2, TrendingDown, TrendingUp, Plus, Trash2, Pencil, X, Check, Link as LinkIcon, AlertTriangle, LayoutTemplate, Save, FileSpreadsheet, FolderInput, Search, ShoppingCart, FileText, ChevronDown, ChevronRight, Square, CheckSquare } from 'lucide-react'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { cn } from '@/lib/utils'
import { Button, buttonClasses } from '@/components/ui/button'
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
import { contractAmountLabel } from '@/lib/contract-amount'
import { usePermissions } from '@/lib/use-permissions'

import { formatDate } from '@/lib/dates'
import { timeAgo, absoluteTime } from '@/lib/time-ago'
import { useNotice } from '@/components/ui/notice'
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
/** What the cost-plus fee was actually earned on, so the screen can say so. */
interface FeeBasis {
  /** Cost of accepted bills the fee was computed over. */
  bills: number
  /** Cost of material receipts it was computed over - 0 when materials are at cost. */
  materials: number
  on_materials: boolean
}

function ProfitFigures(
  { profit, totalActual, feeBasis, materialsSpentHint = 0 }:
  { profit: Profit; totalActual: number; feeBasis?: FeeBasis | null; materialsSpentHint?: number },
) {
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
            {/* NAME THE BASIS. This said "of {totalActual} spent", which is
                bills PLUS materials - while the fee itself is earned per bill,
                and on materials only when the job says so. Two different
                totals in one sentence reads as a bug whether or not the
                arithmetic is right, and a reviewer called it exactly that. */}
            <span className="ml-1.5 text-[11px] font-normal text-faint">
              {earned && feeBasis
                ? `on ${money(feeBasis.bills)} in bills${feeBasis.on_materials && feeBasis.materials > 0 ? ` + ${money(feeBasis.materials)} materials` : ''}`
                : `of ${money(totalActual)} spent`}
            </span>
          </p>
          {earned && feeBasis && !feeBasis.on_materials && materialsSpentHint > 0 && (
            // Say the quiet part. Materials earning no fee is a real choice
            // some contracts make and others do not, and somebody whose
            // contract DOES mark up materials should find that out here rather
            // than at the end of the job.
            <p className="mt-0.5 text-[11px] text-faint">
              Materials are at cost on this job - no fee. Change it in project settings.
            </p>
          )}
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
  created_at?: string | null
  /** Touched by a trigger on every update (migration 130). */
  updated_at?: string | null
  subcontract_id: string | null
  linked: boolean
  linked_label: string | null
  space_type: 'interior' | 'exterior' | null
  cost_type?: 'hard' | 'soft' | null
}

interface SubOption {
  id: string
  label: string
  contract_amount: number | null
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
        <input autoFocus={autoFocusOnDesktop()} className={cls} placeholder="Name your category, e.g. Craning"
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

/**
 * A line's variance as one chip, for the COLLAPSED phone row.
 *
 * The phone used to print every line fully expanded - four label/value rows,
 * a pencil, a trash can and the linked sub - so a thirty-line budget was a
 * scroll of a hundred and fifty numbers with no way to see which line was in
 * trouble. Collapsed, a row is its name, what it has cost, and this: red when
 * the line is over, quiet when it is not. Colour only where it means something.
 */
function VarianceChip({ variance }: { variance: number }) {
  if (variance === 0) return null
  const over = variance < 0
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium',
      over ? 'bg-danger-tint text-danger' : 'bg-surface text-muted-fg')}>
      {over ? `Over ${money(Math.abs(variance))}` : `${money(variance)} left`}
    </span>
  )
}

export default function BudgetPage({ params }: { params: { id: string } }) {
  const notify = useNotice()
  const supabase = createClient()
  const guardDelete = useDeleteGuard()
  const vc = useViewerContext(params.id)
  // Costs and margin are separate permissions. Running a job's budget and
  // seeing what the company makes on it are different questions, and a project
  // manager needs the first without automatically getting the second. While
  // these were one permission there was no way to grant one without the other.
  //
  // The server does not rely on this: /api/projects/[id]/budget withholds the
  // markup and the contract value from anyone without it, so hiding the panel
  // is the presentation of that refusal, not the refusal itself.
  const { can: canDo, loading: permLoading } = usePermissions()
  const canSeeMargin = !permLoading && canDo('margin', 'view')
  const [items, setItems] = useState<BudgetItem[]>([])
  const [totals, setTotals] = useState<BudgetTotals | null>(null)
  // Money that is inside the totals and on no line. Kept as its own state
  // because it is not a budget line and must not be edited like one - the fix
  // is to file it against a line, not to type over it.
  const [unlinkedSubs, setUnlinkedSubs] = useState<{ id: string; label: string; contract_amount: number }[]>([])
  const [unassignedReceipts, setUnassignedReceipts] = useState<{ id: string; label: string; amount: number; purchase_date: string | null }[]>([])
  // Approved change orders that land on no line. Same category of money as the
  // two above: inside the totals, on no row, and fixable from here.
  const [unlinkedChangeOrders, setUnlinkedChangeOrders] = useState<{ id: string; label: string; amount: number }[]>([])
  const [filing, setFiling] = useState<string | null>(null)
  const [feeBasis, setFeeBasis] = useState<FeeBasis | null>(null)
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
  /**
   * Why the last add or edit was refused.
   *
   * Both handlers used to read `if (res.ok) { ... }` with no else, so a
   * rejected save did NOTHING visible - the button stopped spinning and the
   * row sat there unchanged. A refusal nobody can see is worse than no
   * refusal: the person believes it saved.
   */
  const [lineError, setLineError] = useState<string | null>(null)
  const [assigningSubId, setAssigningSubId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('category')
  const [filter, setFilter] = useState<'all' | 'over' | 'interior' | 'exterior'>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  // PHONE ONLY. Which lines are open, and which categories are folded away.
  // Lines start CLOSED and categories start OPEN: the list is scannable by
  // default, and a category is folded only because somebody chose to.
  const [openLines, setOpenLines] = useState<Set<string>>(new Set())
  const [foldedCats, setFoldedCats] = useState<Set<string>>(new Set())
  const toggleIn = (set: (f: (s: Set<string>) => Set<string>) => void, id: string) =>
    set(s => { const next = new Set(s); if (next.has(id)) next.delete(id); else next.add(id); return next })

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

  /**
   * File a stray contract or receipt against a budget line.
   *
   * Both directions of the same fix: a subcontract is linked by setting
   * `subcontract_id` on the LINE (which is where that link lives), and a
   * receipt by setting `budget_line_id` on the receipt. Once filed, the money
   * stops being counted twice and stops sitting on a row of its own.
   */
  async function fileAgainstLine(kind: 'sub' | 'receipt' | 'change_order', id: string, lineId: string) {
    if (!lineId) return
    setFiling(id)
    const token = await getToken()
    const url = kind === 'sub'
      ? `/api/projects/${params.id}/budget/${lineId}`
      : kind === 'change_order'
        ? `/api/projects/${params.id}/change-orders/${id}`
        : `/api/materials/${id}`
    const body = kind === 'sub'
      ? { subcontract_id: id }
      : kind === 'change_order'
        ? { budget_line_item_id: lineId }
        : { budget_line_id: lineId }
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    setFiling(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({} as any))
      notify(d?.error ?? 'Could not file that against the line.')
      return
    }
    load()
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setItems(d.items ?? [])
      setTotals(d.totals ?? null)
      setUnlinkedSubs(d.unlinked_subcontracts ?? [])
      setUnassignedReceipts(d.unassigned_receipts ?? [])
      setUnlinkedChangeOrders(d.unlinked_change_orders ?? [])
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
      setFeeBasis(d.fee_basis ?? null)
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
  /**
   * Does the fee apply to material receipts on this job?
   *
   * Reloads rather than patching state locally: turning this on changes the
   * fee EARNED, which several tiles on this screen show. Setting the checkbox
   * and leaving those stale would be the exact class of disagreement this
   * whole change exists to end.
   */
  async function saveFeeOnMaterials(next: boolean) {
    setSavingMarkup(true)
    try {
      const token = await getToken()
      await fetch(`/api/projects/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ fee_on_materials: next }),
      })
      await load()
    } finally {
      setSavingMarkup(false)
    }
  }

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
    else notify((await res.json().catch(() => ({}))).error ?? 'Could not assign')
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
      if (d.skipped > 0) notify(`${d.skipped} line${d.skipped !== 1 ? 's' : ''} skipped - already on this budget.`, { tone: 'info' })
      setShowTemplate(false); load()
    }
    else notify((await res.json().catch(() => ({}))).error ?? 'Could not apply')
  }

  async function importExcel(file: File) {
    setImporting(true)
    const token = await getToken()
    const form = new FormData(); form.append('file', file)
    const res = await fetch('/api/budget-templates/import', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })
    setImporting(false)
    if (res.ok) { const d = await res.json(); setImportItems(d.items ?? []); setImportName(d.suggested_name ?? 'Imported template') }
    else notify((await res.json().catch(() => ({}))).error ?? 'Could not read file')
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
      if (d.skipped > 0) notify(`${d.skipped} duplicate line${d.skipped !== 1 ? 's' : ''} skipped.`, { tone: 'info' })
      setShowTemplate(false); setImportItems(null); load()
    }
    else notify((await res.json().catch(() => ({}))).error ?? 'Could not apply')
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
    } else { setApplying(false); notify('Could not save template') }
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
    if (res.ok) { setShowSave(false); setTplName(''); notify('Saved as template', { tone: 'success' }) }
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
    else notify((await res.json().catch(() => ({}))).error ?? 'Could not add soft costs')
  }

  // One way out for the X, the backdrop, Cancel and Escape - three copies of
  // the same three lines is how one of them stops clearing the error.
  function closeAdd() { setAdding(false); setForm({ ...blankForm }); setLineError(null) }
  useEffect(() => {
    if (!adding) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeAdd() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [adding]) // eslint-disable-line react-hooks/exhaustive-deps

  async function addLine() {
    if (!form.description.trim()) return
    setSaving(true)
    setLineError(null)
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
      return
    }
    const body = await res.json().catch(() => ({} as any))
    setLineError(body?.error ?? `That did not save (${res.status}).`)
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
    setLineError(null)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(editForm),
    })
    setSaving(false)
    if (res.ok) { setEditingId(null); load(); return }
    const body = await res.json().catch(() => ({} as any))
    setLineError(body?.error ?? `That did not save (${res.status}).`)
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
  // Committed money sitting in contracts no budget line points at. Part of the
  // total, but invisible in the rows below - which is how the headline ends up
  // bigger than the list adds to, with nothing on screen to explain it.
  const committedUnlinked = totals?.committed_unlinked ?? 0
  const committedOnLines = Math.max(0, totalCommitted - committedUnlinked)
  // The two halves of Actual Spent. A reviewer had to reverse-engineer why
  // Actual Spent and the Bills figure differed by $220k; both of these were
  // hiding inside one number.
  const billedOnly = totals?.billed ?? Math.max(0, totalActual - (totals?.materials ?? 0))
  const materialsSpent = totals?.materials ?? 0
  // Typed straight into a line's Actual, on a line with no subcontract and no
  // invoice split. A third source of money in this total, and on a real job it
  // was more than half of it.
  const enteredByHand = totals?.entered ?? 0
  const spentParts = [
    billedOnly > 0 ? `${money(billedOnly)} in bills` : null,
    enteredByHand > 0 ? `${money(enteredByHand)} entered by hand` : null,
    materialsSpent > 0 ? `${money(materialsSpent)} materials` : null,
  ].filter(Boolean)
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
  // Search, then the segmented filter. Over is the same sum the Left column
  // prints, so the count on the button and the rows under it cannot disagree.
  const filtered = items
    .filter(i => !q || [i.description, i.cost_code, i.category, i.linked_label, i.notes]
      .some(v => (v ?? '').toLowerCase().includes(q)))
    .filter(i => filter === 'all' ? true
      : filter === 'over' ? variance(i) < 0
      : i.space_type === filter)
  /** Contract signed but not yet invoiced - the money that has no bill yet. */
  const toBill = (i: BudgetItem) =>
    Math.max(0, Number(i.committed_amount || 0) - (Number(i.actual_amount || 0) - Number(i.materials_amount || 0)))
  /** Newest first; a line with no timestamp sinks rather than floating to the top. */
  const editedAt = (i: BudgetItem) => {
    const t = Date.parse(i.updated_at ?? i.created_at ?? '')
    return Number.isNaN(t) ? 0 : t
  }
  const editedLabel = (i: BudgetItem) => {
    const at = i.updated_at ?? i.created_at
    return at ? <span className="block truncate text-xs text-faint" title={absoluteTime(at)}>Edited {timeAgo(at)}</span> : null
  }
  const sortRows = (rows: BudgetItem[]) => {
    const r = [...rows]
    switch (sortBy) {
      case 'description': r.sort((a, b) => a.description.localeCompare(b.description)); break
      case 'budgeted': r.sort((a, b) => revisedOf(b) - revisedOf(a)); break
      case 'committed': r.sort((a, b) => Number(b.committed_amount || 0) - Number(a.committed_amount || 0)); break
      case 'actual': r.sort((a, b) => Number(b.actual_amount || 0) - Number(a.actual_amount || 0)); break
      case 'variance': r.sort((a, b) => variance(a) - variance(b)); break
      case 'edited': r.sort((a, b) => editedAt(b) - editedAt(a)); break
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
      label: 'Total Budget', value: totalBudgeted, tone: 'muted' as PillTone, alarm: undefined as PillTone | undefined, icon: DollarSign,
      // A budget that grew because of approved change orders should say so.
      note: approvedChanges !== 0
        ? `${money(originalBudget)} original + ${money(approvedChanges)} approved changes`
        : undefined,
      help: approvedChanges !== 0
        ? `What this job is budgeted at now.\n\nEvery line's budget added up (${money(originalBudget)}), plus ${money(approvedChanges)} of approved change orders. Rejected and pending change orders are not counted.`
        : 'What this job is budgeted at.\n\nEvery line\'s budget added up. Approved change orders are added on top as they land; nothing pending counts.',
    },
    {
      label: 'Committed', value: totalCommitted, tone: 'info' as PillTone, alarm: undefined as PillTone | undefined, icon: TrendingUp,
      // WHERE THE NUMBER COMES FROM, when the rows below do not add up to it.
      // A contract nobody linked to a budget line is in this total and on no
      // row, so the card read $160,000 over a list adding to $80,000 with no
      // way to find out why.
      note: committedUnlinked > 0
        ? `${money(committedOnLines)} on lines + ${money(committedUnlinked)} not linked`
        : committedNotBilled > 0 ? `${money(committedNotBilled)} signed, not yet billed` : undefined,
      help: `What you have promised in signed contracts.\n\nEvery subcontract on the job added up, plus anything typed into Committed on a line that has no contract behind it.${committedUnlinked > 0 ? `\n\n${money(committedUnlinked)} of this is in subcontracts that are not linked to any budget line, which is why the rows below add up to less than this figure.\n\nIf that contract is the SAME money as a Committed amount you typed onto a line, it is being counted twice - link the subcontract to that line on Subs & Team and the duplicate goes away.` : ''}${committedNotBilled > 0 ? `\n\n${money(committedNotBilled)} has not been invoiced yet - that is the bit that catches people out.` : ''}`,
    },
    {
      label: 'Actual Spent', value: totalActual, tone: 'success' as PillTone, alarm: undefined as PillTone | undefined, icon: CheckCircle2,
      // ON SCREEN, not in the tooltip. Two things were hiding in this total -
      // material receipts, and bills in the two accepted statuses beyond
      // "approved" - and somebody comparing it to the Bills tab had to guess
      // at both. A total whose parts cannot be recovered from the screen reads
      // as a bug even when the arithmetic is right.
      note: spentParts.length > 1 ? spentParts.join(' + ') : 'Approved, released and paid bills',
      help: `What has actually landed on the budget. THREE things add into it, which is why the split is printed under the number.\n\nBILLS - every invoice approved, sent for payment, or paid. One still in Pending Approval does not count; approving it is what moves this. If this looks bigger than your Bills tab, that tab is filtered to one status and this counts all three.\n\nENTERED BY HAND - an Actual typed straight onto a budget line that has no subcontract and no invoice split. Perfectly valid, and easy to forget is in here.\n\nMATERIALS - receipts assigned to a line. A receipt with no line is on the Materials tab but not on this number.`,
    },
    {
      label: overBudget ? 'Over Budget' : 'Left to spend',
      value: Math.abs(remaining),
      tone: (overBudget ? 'danger' : 'warn') as PillTone,
      // Over budget is the one figure here whose colour is the message.
      alarm: (overBudget ? 'danger' : undefined) as PillTone | undefined,
      icon: overBudget ? TrendingDown : Wallet,
      // The whole point of the fix: this counts contracts you have signed, not
      // just invoices you have received.
      //
      // It is NOT budget minus committed, and the difference is the first thing
      // anybody checking the maths notices. So show the subtraction that was
      // actually done rather than asserting a total and hiding the working in a
      // tooltip nobody hovers.
      // Says WHY the subtracted figure is not simply Committed. Printing the
      // two side by side with no reason - which is what the first version of
      // this note did - replaced "unexplained" with "two numbers and no
      // explanation", which is barely an improvement.
      note: `${money(totalBudgeted)} − ${money(totalBudgeted - remaining)}, using actual where it exceeds committed`,
      help: `Budget you have not spoken for yet.\n\nTotal budget, less whichever is bigger on each line: what you have signed, or what you have already been billed.\n\nIt is deliberately NOT budget minus invoices. If you have budgeted ${money(totalBudgeted)}, signed ${money(totalCommitted)} and been billed ${money(totalActual)}, the money still free to spend is ${money(Math.max(remaining, 0))} - not ${money(Math.max(totalBudgeted - totalActual, 0))}.`,
    },
  ]

  // The inline edit form, rendered by the desktop table AND the phone list.
  // A function returning markup, not a component: declared as a component in
  // here it would be a new type on every render and throw away what was typed.
  const renderEditForm = (item: BudgetItem) => (
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
              {subOptions.filter(s => !linkedSubIds.has(s.id) || s.id === item.subcontract_id).map(s => <option key={s.id} value={s.id}>{s.label} · {contractAmountLabel(s.contract_amount)}</option>)}
            </SearchableSelect>
          </Field>
        )}
        <div className="flex gap-2 justify-end">
          {lineError && (
            <p role="alert" className="mr-auto text-xs text-danger">{lineError}</p>
          )}
          <button onClick={() => { setEditingId(null); setLineError(null) }} className="inline-flex items-center gap-1 text-xs text-muted-fg px-2 py-1.5 rounded-lg hover:bg-muted">
            <X className="h-3.5 w-3.5" /> Cancel
          </button>
          <button onClick={() => saveEdit(item.id)} disabled={saving}
            className="inline-flex items-center gap-1 text-xs text-accent-ink bg-accent hover:bg-accent px-2.5 py-1.5 rounded-lg">
            <Check className="h-3.5 w-3.5" /> Save
          </button>
        </div>
      </div>
  )

  if (loading) return <div className="text-sm text-faint py-12 text-center">Loading…</div>

  // Sub's own job → budget IS the quote line items (no committed/actual rollup).
  if (!vc.loading && vc.companyType === 'subcontractor' && vc.owns) {
    return <QuoteLineItems projectId={params.id} mode="budget" />
  }

  // ── What a line or a group of lines says in the Left column ──────────────
  // Left = budget less whichever is bigger, signed or billed (`variance`), and
  // the bar is how much of the budget that has used. Amber from 85%, red over:
  // colour only where it means something.
  const leftOf = (rows: BudgetItem[]) => {
    const budget = rows.reduce((s, i) => s + revisedOf(i), 0)
    const used = rows.reduce((s, i) => s + exposureOf(i), 0)
    const left = budget - used
    const pct = budget > 0 ? used / budget : used > 0 ? 1 : 0
    return {
      left, over: left < 0,
      barW: `${Math.min(pct, 1) * 100}%`,
      barC: left < 0 ? 'bg-danger-solid' : pct > 0.85 ? 'bg-warn' : 'bg-accent-fg',
    }
  }
  const leftCell = (rows: BudgetItem[], bold = true) => {
    const l = leftOf(rows)
    return (
      <div className="min-w-0 text-right">
        <div className={cn('whitespace-nowrap tabular-nums', bold ? 'font-semibold' : 'font-medium', l.over ? 'text-danger' : 'text-ink')}>
          {l.over ? `Over ${money(Math.abs(l.left))}` : l.left === 0 ? '-' : money(l.left)}
        </div>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className={l.barC} style={{ width: l.barW }} />
        </div>
      </div>
    )
  }
  const COLS = selectMode
    ? 'grid-cols-[1.5rem_minmax(0,1fr)_repeat(3,minmax(0,6.5rem))_minmax(0,8rem)_2.75rem]'
    : 'grid-cols-[minmax(0,1fr)_repeat(3,minmax(0,6.5rem))_minmax(0,8rem)_2.75rem]'

  /** One line in the desktop table. A function returning markup, not a component - see renderEditForm. */
  const renderLine = (item: BudgetItem, opts: { child: boolean; title: string; sub: string | null }) => {
    if (editingId === item.id) return renderEditForm(item)
    const revised = revisedOf(item)
    const changes = Number(item.change_orders_amount || 0)
    const stillToBill = toBill(item)
    const overCommitted = revised > 0 && (Number(item.committed_amount || 0) - revised) >= 1
    return (
      <div key={item.id}
        // The whole row opens the line. In select mode it toggles the tick
        // instead, which is what a click means there. Buttons and links
        // inside stop the event themselves.
        onClick={() => selectMode ? toggleSelect(item.id) : setDetailLineId(item.id)}
        className={cn('group grid cursor-pointer items-start gap-3 px-5 py-3.5 transition-colors hover:bg-surface', COLS,
          opts.child && 'bg-surface/60 pl-12',
          selectMode && selected.has(item.id) && 'bg-danger-tint/40')}>
        {selectMode && (
          <input type="checkbox" className="mt-1 accent-danger" checked={selected.has(item.id)}
            onClick={e => e.stopPropagation()} onChange={() => toggleSelect(item.id)} aria-label={`Select ${item.description}`} />
        )}
        <div className="flex min-w-0 items-start gap-3">
          <span className="w-9 shrink-0 pt-0.5 text-xs tabular-nums text-muted-fg">{item.cost_code ?? ''}</span>
          <div className="min-w-0">
            <p className={cn('truncate text-[15px] text-ink group-hover:text-accent-fg', opts.child ? 'font-medium' : 'font-semibold')}>{opts.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-fg">
              {item.linked && <span className="rounded-[5px] bg-surface px-1.5 py-0.5 font-semibold text-ink-soft">Sub</span>}
              {opts.sub && <span className="min-w-0 truncate">{opts.sub}</span>}
              {item.space_type && <span>{opts.sub ? '· ' : ''}{SPACE_LABELS[item.space_type]}</span>}
              {item.linked && (
                <a href={`/projects/${params.id}/team`} onClick={e => e.stopPropagation()}
                  className="inline-flex min-w-0 items-center gap-1 text-accent-fg hover:underline">
                  · <span className="truncate">{item.linked_label}</span>
                </a>
              )}
            </div>
            {sortBy === 'edited' && editedLabel(item)}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          {/* Revised, with the change orders spelled out - a budget that grew
              silently is worse than one that never grew. */}
          <div className="font-semibold text-ink">{money(revised)}</div>
          {changes !== 0 && (
            <div className="mt-0.5 text-xs font-medium text-info" title={`${money(item.budgeted_amount)} original + ${money(changes)} approved change orders`}>
              incl. {money(changes)} CO
            </div>
          )}
        </div>
        <div className="text-right text-sm tabular-nums">
          <span
            title={overCommitted ? `Committed ${money(item.committed_amount)} exceeds budget ${money(revised)} by ${money(Number(item.committed_amount) - revised)}` : undefined}
            className={cn('inline-flex items-center justify-end gap-1', overCommitted ? 'font-semibold text-danger' : 'text-ink-soft')}>
            {overCommitted && <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
            {money(item.committed_amount)}
          </span>
        </div>
        <div className="text-right text-sm tabular-nums text-ink-soft"
          title={stillToBill > 0 ? `${money(stillToBill)} of the contract is signed but not yet invoiced` : undefined}>
          {money(item.actual_amount)}
        </div>
        {leftCell([item], !opts.child)}
        {/* ONE primary action per row (the row itself opens it); the rest
            behind the dots. */}
        <div onClick={e => e.stopPropagation()} className="flex justify-end">
          <RowMenu label={`More for ${item.description}`}>
            {close => (
              <>
                <MenuItem onClick={() => { close(); setDetailLineId(item.id) }}><FileText className="h-3.5 w-3.5" /> Details</MenuItem>
                <MenuItem onClick={() => { close(); startEdit(item) }}><Pencil className="h-3.5 w-3.5" /> Edit line</MenuItem>
                {/* Not one tap: `remove` goes through the delete guard, which
                    asks first (and wants the delete key when protection is on). */}
                <MenuItem danger onClick={() => { close(); remove(item.id) }}><Trash2 className="h-3.5 w-3.5" /> Delete line</MenuItem>
              </>
            )}
          </RowMenu>
        </div>
      </div>
    )
  }

  const overCount = items.filter(i => variance(i) < 0).length
  const hasInterior = items.some(i => i.space_type === 'interior')
  const hasExterior = items.some(i => i.space_type === 'exterior')
  const FILTERS = [
    { key: 'all' as const, label: 'All', show: true },
    { key: 'over' as const, label: `Over (${overCount})`, show: overCount > 0 || filter === 'over' },
    { key: 'exterior' as const, label: 'Exterior', show: hasExterior || filter === 'exterior' },
    { key: 'interior' as const, label: 'Interior', show: hasInterior || filter === 'interior' },
  ].filter(f => f.show)
  const unfiledCount = unlinkedSubs.length + unassignedReceipts.length + unlinkedChangeOrders.length
  const unfiledTotal = unlinkedSubs.reduce((s, x) => s + Number(x.contract_amount || 0), 0)
    + unassignedReceipts.reduce((s, x) => s + Number(x.amount || 0), 0)
    + unlinkedChangeOrders.reduce((s, x) => s + Number(x.amount || 0), 0)
  const spentPct = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0
  const committedPct = totalBudgeted > 0 ? Math.max(0, Math.min((totalCommitted - totalActual) / totalBudgeted * 100, 100 - Math.min(spentPct, 100))) : 0
  const [tBudget, tCommitted, tSpent, tLeft] = statCards

  return (
    <div className="flex flex-col gap-4 lg:gap-5 lg:p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight text-ink lg:text-[30px] lg:leading-tight">Budget</h1>
        <input ref={importInputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
          onChange={e => { const file = e.target.files?.[0]; if (file) { setImportOnly(true); setShowTemplate(true); setImportItems(null); importExcel(file) } e.target.value = '' }} />
        {/* ONE action, and the rest behind More - on every width. Adding a line
            is the thing done daily; importing, templates and Select are set-up. */}
        <div className="flex items-center gap-2" data-budget-toolbar>
          {showProposalLink && (
            // Won job: reprint the proposal that was sent.
            <a href={`/projects/${params.id}/proposal/print`} target="_blank" rel="noreferrer"
              className={cn(buttonClasses('outline', 'lg'), 'hidden h-11 rounded-[10px] px-4 lg:inline-flex')}>
              <FileText className="h-4 w-4" /> View proposal
            </a>
          )}
          {selectMode && (
            <Button variant="default" onClick={() => { setSelectMode(false); setSelected(new Set()) }}>Done</Button>
          )}
          <Button size="lg" onClick={() => setAdding(true)} aria-label="Add Line" className="h-11 w-11 gap-1.5 rounded-[10px] px-0 lg:w-auto lg:px-5">
            <Plus className="h-5 w-5 lg:h-4 lg:w-4" /> <span className="hidden lg:inline">Add Line</span>
          </Button>
          <RowMenu label="More budget actions" triggerClassName="bg-panel h-11 w-11 p-0 lg:h-11 lg:w-11 lg:p-0 rounded-[10px] border border-muted2">
            {close => (
              <>
                <MenuItem onClick={() => { close(); importInputRef.current?.click() }}>
                  <FileSpreadsheet className="h-4 w-4" /> Import Estimate
                </MenuItem>
                <MenuItem onClick={() => { close(); openTemplatePicker() }}>
                  <LayoutTemplate className="h-4 w-4" /> Use Template
                </MenuItem>
                {items.length > 0 && (
                  <MenuItem onClick={() => { close(); setShowSave(true) }}>
                    <Save className="h-4 w-4" /> Save as Template
                  </MenuItem>
                )}
                {items.length > 0 && !selectMode && (
                  <MenuItem onClick={() => { close(); setSelectMode(true); setSelected(new Set()) }}>
                    <Pencil className="h-4 w-4" /> Select lines
                  </MenuItem>
                )}
                {showProposalLink && (
                  <MenuItem newTab href={`/projects/${params.id}/proposal/print`} onClick={close}>
                    <FileText className="h-4 w-4" /> View proposal
                  </MenuItem>
                )}
              </>
            )}
          </RowMenu>
        </div>
      </div>

      {/* Use Template modal */}
      {showTemplate && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => setShowTemplate(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-lg overflow-y-auto" onClick={e => e.stopPropagation()}>
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
                    <div className="row-even lg:flex lg:flex-wrap gap-2 justify-end">
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
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => setShowSoft(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-md overflow-y-auto" onClick={e => e.stopPropagation()}>
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
              <div className="row-even lg:flex gap-2 justify-end">
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
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => setShowSave(false)}>
          <div className="bg-panel rounded-xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-line-soft flex items-center justify-between">
              <h2 className="font-semibold text-ink">Save as template</h2>
              <button onClick={() => setShowSave(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1.5">
                <Label>Template name</Label>
                <Input placeholder="e.g. New build - full custom" value={tplName} onChange={e => setTplName(e.target.value)} autoFocus={autoFocusOnDesktop()} />
              </div>
              <p className="text-xs text-faint">Saves these {items.length} line items (with amounts) as a reusable template for future jobs.</p>
              <div className="row-even lg:flex gap-2 justify-end">
                <Button variant="secondary" onClick={() => setShowSave(false)}>Cancel</Button>
                <Button onClick={saveCurrentAsTemplate} disabled={savingTpl || !tplName.trim()}>{savingTpl ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* How does this job pay you? Asked ONCE, before anything else on this
          screen can say what the job earns. */}
      {canSeeMargin && askContract && (
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
      )}

      {/* Estimate → Proposal: markup + client price + generate a client PDF.
          Pre-award only, simple-billing jobs only. */}
      {showEstimateBar && (
        <div className="rounded-2xl border border-accent/30 bg-accent-tint/30 p-5 lg:p-6">
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


      {/* Unbudgeted subcontracts hint */}
      {unbudgetedSubs.length > 0 && (
        <div className="rounded-2xl border border-warn/30 bg-warn-tint px-5 py-4 flex items-start gap-3">
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
                  <span className="text-sm text-ink-soft truncate">{s.label} <span className="text-faint">· {contractAmountLabel(s.contract_amount)}</span></span>
                  <Button size="sm" disabled={assigningSubId === s.id} onClick={() => assignSubToBudget(s)} className="shrink-0">
                    {assigningSubId === s.id ? 'Adding…' : <><Plus className="h-3.5 w-3.5" /> Assign</>}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}


      {/* Add form - a DIALOG, on the phone and the desktop alike. It used to be
          a card below the header, the four tiles and the markup row: two
          screens down on a phone, so "Add Line" looked like it did nothing.
          A column (header / scrolling form / pinned footer) so Add Line stays
          reachable with the keyboard up - the shape the harness measures. */}
      {adding && (
        <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={closeAdd}>
        <div className="flex max-h-full w-full max-w-2xl min-w-0 flex-col overflow-hidden rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
          <div className="flex shrink-0 items-center justify-between border-b border-line-soft py-1 pl-5 pr-1">
            <h2 className="font-semibold text-ink">New Budget Line</h2>
            <button type="button" onClick={closeAdd} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-lg text-faint hover:bg-surface hover:text-ink"><X className="h-5 w-5" /></button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
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
              autoFocus={autoFocusOnDesktop()}
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
                {subOptions.filter(s => !linkedSubIds.has(s.id)).map(s => <option key={s.id} value={s.id}>{s.label} · {contractAmountLabel(s.contract_amount)}</option>)}
              </SearchableSelect>
            </div>
          )}
          {lineError && (
            <p role="alert" className="text-xs text-danger">{lineError}</p>
          )}
          </div>
          <div className="row-even lg:flex shrink-0 justify-end gap-2 border-t border-line-soft px-5 py-4">
            <Button variant="outline" onClick={closeAdd}>Cancel</Button>
            <Button onClick={addLine} disabled={saving || !form.description.trim()}>{saving ? 'Saving…' : 'Add Line'}</Button>
          </div>
        </div>
        </div>
      )}


      {/* TWO COLUMNS on a desktop: the lines, and what they add up to. On a
          phone the columns dissolve (`contents`) and the cards take their
          order from `order-*` - the headline first, the lines, then the rest. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
          {items.length > 0 && (
            <div className="order-4 flex flex-col gap-2.5 lg:order-none lg:flex-row lg:flex-wrap lg:items-center">
              <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[10px] border border-muted2 bg-panel px-3 text-muted-fg lg:min-w-[220px]">
                <Search className="h-4 w-4 shrink-0" />
                <input type="search" placeholder="Search line items" aria-label="Search line items" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint" />
              </label>
              <div className="scroll-fade flex items-center gap-2 overflow-x-auto lg:shrink-0 lg:overflow-visible">
                <div role="group" aria-label="Filter lines" className="flex shrink-0 gap-1.5 lg:gap-0.5 lg:rounded-[10px] lg:bg-muted lg:p-[3px]">
                  {FILTERS.map(f => (
                    <button key={f.key} type="button" aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}
                      className={cn('h-9 shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13px] lg:rounded-lg lg:px-3',
                        filter === f.key
                          ? 'bg-ink font-semibold text-panel lg:bg-panel lg:text-ink lg:shadow-sm'
                          : 'border border-muted2 bg-panel font-medium text-ink-soft lg:border-0 lg:bg-transparent')}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="w-48 shrink-0">
                <SearchableSelect aria-label="Sort by" className="h-9 w-full rounded-[10px] border border-muted2 bg-panel px-3 text-sm" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="category">Sort: category</option>
                  <option value="description">Description (A-Z)</option>
                  <option value="budgeted">Budgeted (high → low)</option>
                  <option value="committed">Committed (high → low)</option>
                  <option value="actual">Spent (high → low)</option>
                  <option value="variance">Left (over first)</option>
                  <option value="edited">Last edited (newest first)</option>
                </SearchableSelect>
                </div>
              </div>
            </div>
          )}

          <div className="order-4 contents lg:order-none">
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


          </div>

          {/* Budget table */}
          {items.length === 0 ? (
            <div className="order-4 rounded-2xl border border-line bg-panel p-10 text-center lg:order-none">
              <Wallet className="mx-auto mb-3 h-8 w-8 text-faint" />
              <p className="text-sm text-muted-fg">No budget lines yet. Add your first cost line to start tracking.</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="order-4 rounded-2xl border border-line bg-panel p-10 text-center lg:order-none">
              <Search className="mx-auto mb-3 h-8 w-8 text-faint" />
              <p className="text-sm text-muted-fg">No line items match{search ? ` “${search}”` : ' this filter'}.</p>
            </div>
          ) : (
            <>
            {/* DESKTOP: one table. A category with one line reads as one row -
                the category is its title and the line its description; one
                with several is a row of its own that folds its lines under it.
                NOT overflow-hidden: a row's ... menu would be clipped off the
                last row, so the children that touch an edge round themselves. */}
            <div className="hidden lg:block bg-panel rounded-2xl border border-line">
              <div className={cn('grid gap-3 rounded-t-2xl border-b border-line px-5 py-3 text-xs font-semibold text-muted-fg', COLS)}>
                {selectMode && (
                  <input type="checkbox" className="accent-danger" checked={filtered.length > 0 && filtered.every(i => selected.has(i.id))}
                    onChange={() => toggleSelectAll(filtered)} aria-label="Select all" title="Select all" />
                )}
                <span>Cost code</span>
                {/* Same explainers as the headline figures, on the columns they describe. */}
                <span className="inline-flex items-center justify-end gap-1">
                  Budgeted
                  <InfoHint align="right" text={'What this line is budgeted at.\n\nWhat you estimated, plus any approved change orders that landed on it. A line that grew shows "incl. $X CO" underneath, so the budget never changes silently.'} />
                </span>
                <span className="inline-flex items-center justify-end gap-1">
                  Committed
                  <InfoHint align="right" text={'What you have signed for on this line.\n\nThe contract amount of the subcontract linked to it. On an unlinked line it is whatever you typed. Turns red when it is more than the line is budgeted at.'} />
                </span>
                <span className="inline-flex items-center justify-end gap-1">
                  Spent
                  <InfoHint align="right" text={'What has actually been billed on this line.\n\nInvoices from the linked sub that are approved, sent for payment or paid, plus any material receipts assigned here. An invoice awaiting approval does not count yet.'} />
                </span>
                <span className="inline-flex items-center justify-end gap-1">
                  Left
                  <InfoHint align="right" text={'Budget left on this line.\n\nBudgeted less whichever is bigger: what you have signed, or what you have already been billed. The bar is how much of the line that has used - amber from 85%, red once it is over.\n\nIt is NOT committed minus actual - that is how much of the contract is still to be invoiced, which is on the hover over Spent.'} />
                </span>
                <span><span className="sr-only">Actions</span></span>
              </div>

              {sections.map(section => (
              <div key={section.key}>
              {showSectionBands && (
                <div className={cn('flex items-center justify-between gap-2 border-b border-line px-5 py-2.5',
                  section.key === 'soft' ? 'bg-info-tint' : 'bg-surface')}>
                  <span className={cn('text-xs font-bold uppercase tracking-wider', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>
                    {section.label}
                  </span>
                  <span className={cn('text-sm font-bold tabular-nums', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>{money(section.total)}</span>
                </div>
              )}
              <div className="divide-y divide-line-soft">
              {section.groups.map(group => {
                const one = group.rows.length === 1 && !flatSort
                if (flatSort) {
                  return group.rows.map(item => renderLine(item, { child: false, title: item.description, sub: item.category }))
                }
                if (one) {
                  const item = group.rows[0]
                  return renderLine(item, { child: false, title: group.category, sub: item.description })
                }
                const catKey = `desk:${section.key}:${group.category}`
                const folded = foldedCats.has(catKey)
                const sum = (f: (i: BudgetItem) => number) => group.rows.reduce((s, i) => s + f(i), 0)
                return (
                  <div key={group.category} className="divide-y divide-line-soft">
                    <div className={cn('grid items-start gap-3 px-5 py-3.5', COLS)}>
                      {selectMode && (
                        <input type="checkbox" className="mt-1 accent-danger" checked={group.rows.every(i => selected.has(i.id))}
                          onChange={() => toggleSelectAll(group.rows)} aria-label={`Select every ${group.category} line`} />
                      )}
                      <button type="button" onClick={() => toggleIn(setFoldedCats, catKey)} aria-expanded={!folded}
                        className="flex min-w-0 items-start gap-3 text-left">
                        <span className="flex w-9 shrink-0 items-center gap-1 pt-0.5 text-xs tabular-nums text-muted-fg">
                          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', !folded && 'rotate-90')} />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-[15px] font-semibold text-ink">{group.category}</span>
                          <span className="mt-1 block text-xs text-muted-fg">{group.rows.length} lines</span>
                        </span>
                      </button>
                      <div className="text-right text-sm font-semibold tabular-nums text-ink">{money(sum(revisedOf))}</div>
                      <div className="text-right text-sm tabular-nums text-ink-soft">{money(sum(i => Number(i.committed_amount || 0)))}</div>
                      <div className="text-right text-sm tabular-nums text-ink-soft">{money(sum(i => Number(i.actual_amount || 0)))}</div>
                      {leftCell(group.rows)}
                      <span />
                    </div>
                    {!folded && group.rows.map(item => renderLine(item, { child: true, title: item.description, sub: null }))}
                  </div>
                )
              })}
              </div>
              </div>
              ))}

              {/* totals footer */}
              <div className={cn('grid gap-3 rounded-b-2xl border-t border-line bg-surface px-5 py-4 text-sm font-bold tabular-nums text-ink', COLS)}>
                {selectMode && <span />}
                <span>Total</span>
                <span className="text-right">{money(totalBudgeted)}</span>
                <span className={cn('text-right', (totalCommitted - totalBudgeted) >= 1 ? 'text-danger' : '')}
                  title={(totalCommitted - totalBudgeted) >= 1 ? `Committed exceeds budget by ${money(totalCommitted - totalBudgeted)}` : undefined}>
                  {money(totalCommitted)}
                </span>
                <span className="text-right">{money(totalActual)}</span>
                <span className={cn('text-right', overBudget ? 'text-danger' : 'text-accent-fg')}>
                  {overBudget ? `Over ${money(Math.abs(remaining))}` : money(remaining)}
                </span>
                <span />
              </div>
            </div>

            {/* PHONE: a card per category - its name, what is left, a bar and
                the three figures - with its lines COLLAPSED under it to a name,
                what each has cost and its variance. Tap a line for the rest; tap
                a category to fold it away. Delete lives inside the opened line,
                never one tap from the list. */}
            <div className="order-5 flex flex-col gap-3 lg:hidden" data-budget-phone-list>
              {sections.map(section => (
                <div key={section.key} className="flex flex-col gap-3">
                  {showSectionBands && (
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className={cn('min-w-0 truncate text-xs font-bold uppercase tracking-wider', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>
                        {section.label}
                      </span>
                      <span className={cn('shrink-0 text-sm font-bold tabular-nums', section.key === 'soft' ? 'text-info' : 'text-ink-soft')}>{money(section.total)}</span>
                    </div>
                  )}
                  {section.groups.map(group => {
                    const catKey = `${section.key}:${group.category}`
                    const folded = foldedCats.has(catKey)
                    const gl = leftOf(group.rows)
                    const sum = (f: (i: BudgetItem) => number) => group.rows.reduce((s, i) => s + f(i), 0)
                    // A category of ONE line is that line: the card opens it,
                    // rather than holding a child row that repeats the card.
                    const only = group.rows.length === 1 ? group.rows[0] : null
                    const code = only ? only.cost_code : null
                    return (
                      <div key={group.category} className={cn('overflow-hidden rounded-2xl border border-line bg-panel', only && selectMode && selected.has(only.id) && 'bg-danger-tint/40')}>
                        <button type="button"
                          onClick={() => only
                            ? (selectMode ? toggleSelect(only.id) : toggleIn(setOpenLines, only.id))
                            : toggleIn(setFoldedCats, catKey)}
                          aria-expanded={only ? (selectMode ? undefined : openLines.has(only.id)) : !folded}
                          aria-pressed={only && selectMode ? selected.has(only.id) : undefined}
                          className="flex w-full flex-col gap-2.5 px-4 py-3.5 text-left">
                          <span className="flex w-full items-start justify-between gap-3">
                            <span className="min-w-0">
                              <span className="block truncate text-xs text-muted-fg">
                                {code && <span className="tabular-nums">{code} · </span>}
                                {group.rows.length === 1 ? group.rows[0].description : `${group.rows.length} lines`}
                              </span>
                              <span className="mt-0.5 block truncate text-base font-semibold text-ink">{group.category}</span>
                            </span>
                            <span className="shrink-0 text-right">
                              <span className={cn('block text-[11px] font-semibold', gl.over ? 'text-danger' : 'text-muted-fg')}>{gl.over ? 'OVER' : 'LEFT'}</span>
                              <span className={cn('block text-base font-bold tabular-nums', gl.over ? 'text-danger' : 'text-ink')}>{money(Math.abs(gl.left))}</span>
                            </span>
                          </span>
                          <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"><span className={gl.barC} style={{ width: gl.barW }} /></span>
                          <span className="grid w-full grid-cols-3 gap-1.5 text-xs text-muted-fg">
                            <span>Budget<span className="block text-[13px] font-semibold tabular-nums text-ink">{money(sum(revisedOf))}</span></span>
                            <span>Committed<span className="block text-[13px] font-semibold tabular-nums text-ink">{money(sum(i => Number(i.committed_amount || 0)))}</span></span>
                            <span>Spent<span className="block text-[13px] font-semibold tabular-nums text-ink">{money(sum(i => Number(i.actual_amount || 0)))}</span></span>
                          </span>
                        </button>
                        {!folded && (!only || openLines.has(only.id)) && !(only && selectMode) && (
                          <div className="divide-y divide-line-soft border-t border-line-soft">
                            {group.rows.map(item => {
                              if (editingId === item.id) return renderEditForm(item)
                              const open = openLines.has(item.id)
                              const revised = revisedOf(item)
                              const changes = Number(item.change_orders_amount || 0)
                              const v = variance(item)
                              const overCommitted = revised > 0 && (Number(item.committed_amount || 0) - revised) >= 1
                              const picked = selectMode && selected.has(item.id)
                              return (
                                <div key={item.id} className={cn('bg-surface/60', open && !selectMode && 'bg-surface', picked && 'bg-danger-tint/40')}>
                                  {!only && <button type="button"
                                    onClick={() => selectMode ? toggleSelect(item.id) : toggleIn(setOpenLines, item.id)}
                                    aria-expanded={selectMode ? undefined : open}
                                    aria-pressed={selectMode ? picked : undefined}
                                    className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left">
                                    {selectMode && (picked
                                      ? <CheckSquare className="h-5 w-5 shrink-0 text-danger" />
                                      : <Square className="h-5 w-5 shrink-0 text-faint" />)}
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium text-ink">{item.description}</span>
                                      <span className="block truncate text-xs text-muted-fg">
                                        {[item.cost_code, item.linked ? item.linked_label : null, item.space_type ? SPACE_LABELS[item.space_type] : null].filter(Boolean).join(' · ')}
                                      </span>
                                      {sortBy === 'edited' && editedLabel(item)}
                                    </span>
                                    <span className="shrink-0 text-right">
                                      <span className="block text-sm font-semibold tabular-nums text-ink">{money(item.actual_amount)}</span>
                                      <VarianceChip variance={v} />
                                    </span>
                                    {!selectMode && (open
                                      ? <ChevronDown className="h-4 w-4 shrink-0 text-faint" />
                                      : <ChevronRight className="h-4 w-4 shrink-0 text-faint" />)}
                                  </button>}
                                  {open && !selectMode && (
                                    <div className={cn('space-y-3 px-4 pb-4', only && 'pt-3')}>
                                      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                                        <div>
                                          <dt className="text-xs text-faint">Budgeted</dt>
                                          <dd className="text-ink-soft">
                                            {money(revised)}
                                            {changes !== 0 && <span className="ml-1 text-[11px] text-info">incl. {money(changes)} CO</span>}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-xs text-faint">Committed</dt>
                                          <dd className={cn('inline-flex items-center gap-1', overCommitted ? 'font-semibold text-danger' : 'text-ink-soft')}>
                                            {overCommitted && <AlertTriangle className="h-3 w-3 shrink-0" />}
                                            {money(item.committed_amount)}
                                          </dd>
                                        </div>
                                        <div>
                                          <dt className="text-xs text-faint">Spent</dt>
                                          <dd className="text-ink-soft">{money(item.actual_amount)}</dd>
                                        </div>
                                        <div>
                                          <dt className="text-xs text-faint">Left</dt>
                                          <dd className={cn('font-medium', v === 0 ? 'text-faint' : v < 0 ? 'text-danger' : 'text-success')}>
                                            {v === 0 ? '-' : `${v < 0 ? '-' : ''}${money(Math.abs(v))}`}
                                          </dd>
                                        </div>
                                      </dl>
                                      {(item.linked || item.notes) && (
                                        <div className="space-y-1 text-xs">
                                          {item.linked && (
                                            <a href={`/projects/${params.id}/team`}
                                              className="flex w-fit max-w-full items-center gap-1 text-accent-fg hover:underline">
                                              <LinkIcon className="h-3 w-3 shrink-0" /> <span className="truncate">Linked · {item.linked_label}</span>
                                            </a>
                                          )}
                                          {item.notes && <p className="text-faint">{item.notes}</p>}
                                        </div>
                                      )}
                                      <div className="row-even gap-2">
                                        <Button variant="outline" onClick={() => setDetailLineId(item.id)}>Details</Button>
                                        <Button variant="outline" onClick={() => startEdit(item)} className="gap-1.5"><Pencil className="h-4 w-4" /> Edit</Button>
                                      </div>
                                      <button type="button" onClick={() => remove(item.id)}
                                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-danger">
                                        <Trash2 className="h-4 w-4" /> Delete this line
                                      </button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center justify-between gap-2 rounded-2xl border border-line bg-panel px-4 py-3.5 text-sm font-bold text-ink">
                <span>Total</span>
                <span className="tabular-nums">{money(totalBudgeted)}</span>
              </div>
            </div>
            </>
          )}

          {/* Soft costs: a quiet way in when there are none yet. */}
          {totalSoft === 0 && projectStatus !== 'planning' && (
            <button type="button" onClick={() => setShowSoft(true)}
              className="order-6 inline-flex min-h-11 items-center justify-center gap-1.5 self-stretch rounded-[12px] border border-dashed border-muted2 text-sm font-semibold text-accent-fg hover:underline lg:order-none lg:self-start lg:border-0 lg:px-1">
              <Plus className="h-4 w-4" /> Add preconstruction / soft costs
            </button>
          )}
          {totalSoft === 0 && projectStatus === 'planning' && (
            <div className="order-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-info/40 bg-info-tint/40 px-5 py-4 lg:order-none">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-soft">No soft costs on this budget yet</p>
                <p className="mt-0.5 text-xs text-muted-fg">
                  Land, plans, permits, builders risk, survey, loan interest, contingency - the money spent before and around the trades.
                </p>
              </div>
              <Button variant="outline" onClick={() => setShowSoft(true)} className="shrink-0 gap-1.5">
                <Plus className="h-4 w-4" /> Add preconstruction costs
              </Button>
            </div>
          )}
        </div>

        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          {/* THE HEADLINE: what is still free to spend, and what it is made of.
              The four tiles' figures and their explainers, in one card. */}
          {totalBudgeted > 0 && (
            <section className="order-1 flex flex-col gap-3.5 rounded-2xl border border-line bg-panel p-5 lg:order-none">
              <div>
                <div className="flex items-center gap-1.5 text-[13px] font-medium text-muted-fg">
                  {overBudget ? 'Over budget' : 'Left to spend'}
                  {tLeft.help && <InfoHint text={tLeft.help} />}
                </div>
                <div className={cn('text-[32px] font-bold leading-tight tracking-tight tabular-nums', overBudget ? 'text-danger' : 'text-accent-fg')}>
                  {money(Math.abs(remaining))}
                </div>
                <div className="text-xs text-muted-fg">of {money(totalBudgeted)} total budget</div>
              </div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img"
                aria-label={`${spentPct.toFixed(1)}% spent, ${(spentPct + committedPct).toFixed(1)}% committed`}>
                <div className={overBudget ? 'bg-danger-solid' : 'bg-accent-fg'} style={{ width: `${Math.min(spentPct, 100)}%` }} />
                <div className="bg-info/40" style={{ width: `${committedPct}%` }} />
              </div>
              <div className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-fg">
                    <span className={cn('h-2.5 w-2.5 rounded-sm', overBudget ? 'bg-danger-solid' : 'bg-accent-fg')} />
                    Spent · {spentPct.toFixed(1)}%
                    {tSpent.help && <InfoHint text={tSpent.help} />}
                  </span>
                  <b className="tabular-nums text-ink">{money(totalActual)}</b>
                </div>
                {tSpent.note && <div className="-mt-1.5 pl-[18px] text-xs text-muted-fg">{tSpent.note}</div>}
                <div className="flex justify-between gap-2">
                  <span className="flex items-center gap-2 text-muted-fg">
                    <span className="h-2.5 w-2.5 rounded-sm bg-info/40" />
                    Committed
                    {tCommitted.help && <InfoHint text={tCommitted.help} />}
                  </span>
                  <b className="tabular-nums text-ink">{money(totalCommitted)}</b>
                </div>
                {tCommitted.note && <div className="-mt-1.5 pl-[18px] text-xs text-muted-fg">{tCommitted.note}</div>}
                <div className="flex justify-between gap-2 border-t border-line-soft pt-2.5">
                  <span className="flex items-center gap-1.5 text-muted-fg">
                    Total budget
                    {tBudget.help && <InfoHint text={tBudget.help} />}
                  </span>
                  <b className="tabular-nums text-ink">{money(totalBudgeted)}</b>
                </div>
                {tBudget.note && <div className="-mt-1.5 text-xs text-muted-fg">{tBudget.note}</div>}
                <div className="text-xs text-muted-fg">{tLeft.note}</div>
              </div>
            </section>
          )}

          {/* What the job earns: the markup (or the contract value) and the
              profit it makes. Same permission as before - the server withholds
              the figures from anybody without `margin`. */}
          {canSeeMargin && !askContract && (showRevenuePanel || showMarkupPanel) && (
            <section className="order-2 flex flex-col gap-3 rounded-2xl border border-line bg-panel p-5 lg:order-none">
              <h2 className="text-[15px] font-semibold text-ink">{showMarkupPanel ? 'Your fee' : 'What the job earns'}</h2>
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
              <div className="grid grid-cols-2 gap-3">
                <ProfitFigures profit={profit} totalActual={totalActual} feeBasis={feeBasis} materialsSpentHint={materialsSpent} />
              </div>
            </section>
          )}

          {/* MONEY THAT IS IN THE TOTALS AND ON NO LINE ABOVE.
              Committed read $160,000 while the rows added to $80,000, because a
              subcontract nobody had linked to a budget line was in the total and
              on no row - and Left to spend quietly left it out again. A scanned
              receipt with no line did the same to Actual Spent. Both are now
              visible, both are counted, and both can be filed from here. */}
          {(unlinkedSubs.length > 0 || unassignedReceipts.length > 0 || unlinkedChangeOrders.length > 0) && (
            <section id="not-on-a-line" className="order-3 scroll-mt-4 rounded-2xl border border-warn/40 bg-panel lg:order-none">
              <div className="flex items-start gap-2.5 rounded-t-2xl bg-warn-tint/50 px-5 py-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                <div className="min-w-0">
                  <h2 className="text-[15px] font-semibold text-ink">Not on a budget line</h2>
                  <p className="mt-0.5 text-xs text-muted-fg">
                    {unfiledCount} item{unfiledCount !== 1 ? 's' : ''}, {money(unfiledTotal)}, counted in the totals but on
                    no line, so the rows do not add up to the headline. File each one and the numbers close up - a
                    contract filed against a line you already typed a Committed amount on stops being counted twice.
                  </p>
                </div>
              </div>
              <div className="divide-y divide-warn/20 border-t border-warn/20">
                {unlinkedSubs.map(sc => (
                  <div key={sc.id} className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{sc.label}</p>
                      <p className="text-xs text-muted-fg">{money(sc.contract_amount)} · Subcontract, counted in Committed</p>
                    </div>
                    <select
                      disabled={filing === sc.id}
                      defaultValue=""
                      aria-label="File against a budget line"
                      onChange={e => fileAgainstLine('sub', sc.id, e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-muted2 bg-panel px-2.5 text-sm text-ink lg:h-9 lg:w-auto lg:max-w-[9rem]"
                    >
                      <option value="">File against a line…</option>
                      {items.map(l => (
                        <option key={l.id} value={l.id}>{[l.cost_code, l.description].filter(Boolean).join(' · ')}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {unlinkedChangeOrders.map(co => (
                  <div key={co.id} className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{co.label}</p>
                      <p className="text-xs text-muted-fg">{money(co.amount)} · Approved change order, counted in Total Budget</p>
                    </div>
                    <select
                      disabled={filing === co.id}
                      defaultValue=""
                      aria-label="File against a budget line"
                      onChange={e => fileAgainstLine('change_order', co.id, e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-muted2 bg-panel px-2.5 text-sm text-ink lg:h-9 lg:w-auto lg:max-w-[9rem]"
                    >
                      <option value="">File against a line…</option>
                      {items.map(l => (
                        <option key={l.id} value={l.id}>{[l.cost_code, l.description].filter(Boolean).join(' · ')}</option>
                      ))}
                    </select>
                  </div>
                ))}
                {unassignedReceipts.map(r => (
                  <div key={r.id} className="flex flex-col gap-2 px-5 py-3 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{r.label}</p>
                      <p className="text-xs text-muted-fg">
                        {money(r.amount)} · Receipt, counted in Spent{r.purchase_date ? ` · ${formatDate(r.purchase_date)}` : ''}
                      </p>
                    </div>
                    <select
                      disabled={filing === r.id}
                      defaultValue=""
                      aria-label="File against a budget line"
                      onChange={e => fileAgainstLine('receipt', r.id, e.target.value)}
                      className="h-11 w-full rounded-[10px] border border-muted2 bg-panel px-2.5 text-sm text-ink lg:h-9 lg:w-auto lg:max-w-[9rem]"
                    >
                      <option value="">File against a line…</option>
                      {items.map(l => (
                        <option key={l.id} value={l.id}>{[l.cost_code, l.description].filter(Boolean).join(' · ')}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(spaceTotals.interior > 0 || spaceTotals.exterior > 0) && (
            // Interior/exterior split. The old Grand Total tile here was Total
            // Budget a third time - and it disagreed with it, because the split
            // ignored approved change orders. The unassigned remainder is the
            // only part that was not already on screen.
            <section className="order-7 flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-5 lg:order-none">
              <h2 className="text-[15px] font-semibold text-ink">By space</h2>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-fg">Interior{projectSqft.interior ? <span className="text-xs"> · {money(spaceTotals.interior / Number(projectSqft.interior))}/sq ft</span> : null}</span>
                <b className="tabular-nums text-ink">{money(spaceTotals.interior)}</b>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-fg">Exterior{projectSqft.exterior ? <span className="text-xs"> · {money(spaceTotals.exterior / Number(projectSqft.exterior))}/sq ft</span> : null}</span>
                <b className="tabular-nums text-ink">{money(spaceTotals.exterior)}</b>
              </div>
              {spaceTotals.unassigned > 0 && (
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-muted-fg">Not assigned to a space</span>
                  <b className="tabular-nums text-ink">{money(spaceTotals.unassigned)}</b>
                </div>
              )}
            </section>
          )}

          {/* Hard vs soft split. Only worth a card once soft costs carry money -
              with none, it is Total Budget a second time. */}
          {totalSoft > 0 && (
            <section className="order-7 flex flex-col gap-2.5 rounded-2xl border border-line bg-panel p-5 lg:order-none">
              <h2 className="text-[15px] font-semibold text-ink">Hard and soft costs</h2>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-fg">Construction · {hardItems.length} line{hardItems.length !== 1 ? 's' : ''}</span>
                <b className="tabular-nums text-ink">{money(totalHard)}</b>
              </div>
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-info">Preconstruction &amp; carrying</span>
                <b className="tabular-nums text-info">{money(totalSoft)}</b>
              </div>
              <p className="text-xs text-muted-fg">
                {totalBudgeted > 0 ? `Soft costs are ${((totalSoft / totalBudgeted) * 100).toFixed(0)}% of the budget.` : `${softItems.length} soft-cost lines.`}
              </p>
              <button type="button" onClick={() => setShowSoft(true)}
                className="inline-flex min-h-11 items-center self-start text-sm font-semibold text-accent-fg hover:underline lg:min-h-0">
                Add more soft costs →
              </button>
            </section>
          )}

          {/* Materials - receipts on this job (filed ones roll into a line's Spent). */}
          {materials.length > 0 && (() => {
            const materialsOwed = materials.reduce((s: number, m: any) => s + (m.client_paid ? 0 : Number(m.amount ?? 0)), 0)
            // ONE line for the receipts with no budget line, not a label on each.
            // They are listed, with a picker each, in the "Not on a budget line"
            // card - this points there.
            const unfiledReceipts = materials.filter((m: any) => !m.budget_line_id).length
            const SHOWN = 6
            return (
            <section className="order-8 rounded-2xl border border-line bg-panel lg:order-none">
              <div className="flex flex-col gap-2.5 px-5 pb-3 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="inline-flex items-center gap-1.5 text-[15px] font-semibold text-ink"><ShoppingCart className="h-4 w-4 text-muted-fg" /> Materials</h2>
                  <a href="/materials" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-accent-fg hover:underline lg:min-h-0">View all</a>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-xs text-muted-fg">Spent</div><div className="text-lg font-bold tabular-nums text-ink">{money(materialsTotal)}</div></div>
                  <div><div className="text-xs text-muted-fg">Owed by client</div><div className={cn('text-lg font-bold tabular-nums', materialsOwed > 0 ? 'text-warn' : 'text-ink')}>{money(materialsOwed)}</div></div>
                </div>
              </div>
              {unfiledReceipts > 0 && (
                <button type="button"
                  onClick={() => document.getElementById('not-on-a-line')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="flex min-h-11 w-full items-center justify-between gap-2 border-t border-line-soft px-5 py-2 text-left text-sm lg:min-h-0">
                  <span className="min-w-0 text-warn">
                    {unfiledReceipts} receipt{unfiledReceipts !== 1 ? 's have' : ' has'} no budget line yet
                  </span>
                  <span className="shrink-0 font-medium text-accent-fg">Assign {unfiledReceipts !== 1 ? 'them' : 'it'} →</span>
                </button>
              )}
              <div className="divide-y divide-line-soft border-t border-line-soft">
                {materials.slice(0, SHOWN).map((m: any) => (
                  <div key={m.id} className="flex items-center gap-2.5 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-semibold text-ink">{m.store_name || 'Material purchase'}</p>
                      <p className="truncate text-xs text-muted-fg">
                        {[m.category, m.purchase_date && formatDate(m.purchase_date)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[13px] font-semibold tabular-nums text-ink">{money(m.amount)}</p>
                      {m.client_paid
                        ? <span className="text-[11px] font-semibold text-success">Paid</span>
                        : <span className="text-[11px] font-semibold text-warn">Owed</span>}
                      {m.receipt_url && <a href={m.receipt_url} target="_blank" rel="noreferrer" className="ml-1.5 text-[11px] text-accent-fg hover:underline">Receipt</a>}
                    </div>
                  </div>
                ))}
              </div>
              {materials.length > SHOWN && (
                <a href="/materials" className="flex min-h-11 items-center justify-center rounded-b-2xl border-t border-line-soft text-[13px] font-medium text-accent-fg hover:underline">
                  {materials.length - SHOWN} more on the Materials tab
                </a>
              )}
            </section>
            )
          })()}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Wallet, DollarSign, CheckCircle2, TrendingDown, TrendingUp, Plus, Trash2, Pencil, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

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
}

const CATEGORIES = [
  'General Conditions', 'Site Work', 'Concrete', 'Masonry', 'Metals',
  'Wood & Plastics', 'Thermal & Moisture', 'Doors & Windows', 'Finishes',
  'Specialties', 'Equipment', 'Furnishings', 'Mechanical/HVAC', 'Plumbing',
  'Electrical', 'Permits & Fees', 'Contingency', 'General',
]

const money = (n: number) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const blankForm = {
  cost_code: '', category: 'General', description: '',
  budgeted_amount: '', committed_amount: '', actual_amount: '', notes: '',
}

export default function BudgetPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [items, setItems] = useState<BudgetItem[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ ...blankForm })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ...blankForm })

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/budget`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setItems((await res.json()).items ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

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

  async function remove(id: string) {
    if (!confirm('Delete this budget line?')) return
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/budget/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  const totalBudgeted = items.reduce((s, i) => s + Number(i.budgeted_amount || 0), 0)
  const totalCommitted = items.reduce((s, i) => s + Number(i.committed_amount || 0), 0)
  const totalActual = items.reduce((s, i) => s + Number(i.actual_amount || 0), 0)
  const remaining = totalBudgeted - totalActual
  const overBudget = remaining < 0

  // Group by category, preserving order
  const grouped: { category: string; rows: BudgetItem[] }[] = []
  for (const item of items) {
    let g = grouped.find(x => x.category === item.category)
    if (!g) { g = { category: item.category, rows: [] }; grouped.push(g) }
    g.rows.push(item)
  }

  const statCards = [
    { label: 'Total Budget', value: totalBudgeted, color: 'text-slate-900', bg: 'bg-white', icon: DollarSign },
    { label: 'Committed', value: totalCommitted, color: 'text-blue-700', bg: 'bg-blue-50', icon: TrendingUp },
    { label: 'Actual Spent', value: totalActual, color: 'text-green-700', bg: 'bg-green-50', icon: CheckCircle2 },
    {
      label: overBudget ? 'Over Budget' : 'Remaining',
      value: Math.abs(remaining),
      color: overBudget ? 'text-red-700' : 'text-amber-700',
      bg: overBudget ? 'bg-red-50' : 'bg-amber-50',
      icon: overBudget ? TrendingDown : Wallet,
    },
  ]

  if (loading) return <div className="text-sm text-slate-400 py-12 text-center">Loading…</div>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Budget</h1>
          <p className="text-sm text-slate-500 mt-0.5">Line-item cost breakdown — budgeted vs committed vs actual.</p>
        </div>
        <Button onClick={() => setAdding(v => !v)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add Line
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className={cn('rounded-xl border border-slate-200 p-4', s.bg)}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', s.color)} />
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
              </div>
              <p className={cn('text-2xl font-bold', s.color)}>{money(s.value)}</p>
            </div>
          )
        })}
      </div>

      {/* Spend progress */}
      {totalBudgeted > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-slate-700">Budget Used</p>
            <p className={cn('text-sm', overBudget ? 'text-red-600 font-semibold' : 'text-slate-500')}>
              {((totalActual / totalBudgeted) * 100).toFixed(1)}% spent
            </p>
          </div>
          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
            <div className={cn('h-full transition-all', overBudget ? 'bg-red-500' : 'bg-green-500')}
              style={{ width: `${Math.min((totalActual / totalBudgeted) * 100, 100)}%` }} />
            <div className="h-full bg-blue-300 transition-all"
              style={{ width: `${Math.min(Math.max((totalCommitted - totalActual) / totalBudgeted * 100, 0), 100 - Math.min((totalActual / totalBudgeted) * 100, 100))}%` }} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" />Spent {money(totalActual)}</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-blue-300" />Committed {money(totalCommitted)}</span>
            {!overBudget && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-200" />Remaining {money(remaining)}</span>}
          </div>
        </div>
      )}

      {/* Add form */}
      {adding && (
        <div className="bg-white rounded-xl border border-orange-200 p-4 sm:p-5 space-y-3">
          <p className="text-sm font-semibold text-slate-700">New Budget Line</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Cost code (optional)"
              value={form.cost_code} onChange={e => setForm({ ...form, cost_code: e.target.value })} />
            <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
              value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input className="rounded-lg border border-slate-200 px-3 py-2 text-sm col-span-2 sm:col-span-1" placeholder="Description *"
              value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            <input type="number" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Budgeted $"
              value={form.budgeted_amount} onChange={e => setForm({ ...form, budgeted_amount: e.target.value })} />
            <input type="number" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Committed $"
              value={form.committed_amount} onChange={e => setForm({ ...form, committed_amount: e.target.value })} />
            <input type="number" className="rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Actual $"
              value={form.actual_amount} onChange={e => setForm({ ...form, actual_amount: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => { setAdding(false); setForm({ ...blankForm }) }}>Cancel</Button>
            <Button onClick={addLine} disabled={saving || !form.description.trim()}>{saving ? 'Saving…' : 'Add Line'}</Button>
          </div>
        </div>
      )}

      {/* Budget table */}
      {items.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
          <Wallet className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No budget lines yet. Add your first cost line to start tracking.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* header row (desktop) */}
          <div className="hidden md:grid grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] gap-2 px-4 py-2.5 border-b border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wide">
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
                <div className="bg-slate-50 px-4 py-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.category}</span>
                  <span className="text-xs font-semibold text-slate-500">{money(gBudget)}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {group.rows.map(item => {
                    const variance = Number(item.budgeted_amount || 0) - Number(item.actual_amount || 0)
                    const over = variance < 0
                    if (editingId === item.id) {
                      return (
                        <div key={item.id} className="px-4 py-3 bg-orange-50/40 space-y-2">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            <input className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Cost code"
                              value={editForm.cost_code} onChange={e => setEditForm({ ...editForm, cost_code: e.target.value })} />
                            <select className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm bg-white"
                              value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <input className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm col-span-2 sm:col-span-1" placeholder="Description"
                              value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
                            <input type="number" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Budgeted"
                              value={editForm.budgeted_amount} onChange={e => setEditForm({ ...editForm, budgeted_amount: e.target.value })} />
                            <input type="number" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Committed"
                              value={editForm.committed_amount} onChange={e => setEditForm({ ...editForm, committed_amount: e.target.value })} />
                            <input type="number" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm" placeholder="Actual"
                              value={editForm.actual_amount} onChange={e => setEditForm({ ...editForm, actual_amount: e.target.value })} />
                          </div>
                          <div className="flex gap-2 justify-end">
                            <button onClick={() => setEditingId(null)} className="inline-flex items-center gap-1 text-xs text-slate-500 px-2 py-1.5 rounded-lg hover:bg-slate-100">
                              <X className="h-3.5 w-3.5" /> Cancel
                            </button>
                            <button onClick={() => saveEdit(item.id)} disabled={saving}
                              className="inline-flex items-center gap-1 text-xs text-white bg-orange-500 hover:bg-orange-600 px-2.5 py-1.5 rounded-lg">
                              <Check className="h-3.5 w-3.5" /> Save
                            </button>
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={item.id} className="group md:grid md:grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] md:gap-2 md:items-center px-4 py-3 hover:bg-slate-50 transition-colors">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">
                            {item.cost_code && <span className="text-slate-400 font-normal mr-1.5">{item.cost_code}</span>}
                            {item.description}
                          </p>
                          {item.notes && <p className="text-xs text-slate-400 truncate">{item.notes}</p>}
                        </div>
                        <div className="flex justify-between md:block md:text-right mt-2 md:mt-0 text-sm">
                          <span className="md:hidden text-xs text-slate-400">Budgeted</span>
                          <span className="text-slate-700">{money(item.budgeted_amount)}</span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm">
                          <span className="md:hidden text-xs text-slate-400">Committed</span>
                          <span className="text-slate-600">{money(item.committed_amount)}</span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm">
                          <span className="md:hidden text-xs text-slate-400">Actual</span>
                          <span className="text-slate-600">{money(item.actual_amount)}</span>
                        </div>
                        <div className="flex justify-between md:block md:text-right text-sm font-medium">
                          <span className="md:hidden text-xs text-slate-400">Variance</span>
                          <span className={over ? 'text-red-600' : 'text-green-600'}>
                            {over ? '-' : ''}{money(Math.abs(variance))}
                          </span>
                        </div>
                        <div className="flex justify-end gap-1 mt-2 md:mt-0 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                          <button onClick={() => startEdit(item)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => remove(item.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600">
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
          <div className="hidden md:grid grid-cols-[1fr_repeat(4,minmax(0,7rem))_3rem] gap-2 px-4 py-3 border-t-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-800">
            <span>Total</span>
            <span className="text-right">{money(totalBudgeted)}</span>
            <span className="text-right">{money(totalCommitted)}</span>
            <span className="text-right">{money(totalActual)}</span>
            <span className={cn('text-right', overBudget ? 'text-red-600' : 'text-green-600')}>
              {overBudget ? '-' : ''}{money(Math.abs(remaining))}
            </span>
            <span />
          </div>
        </div>
      )}
    </div>
  )
}

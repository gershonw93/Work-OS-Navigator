'use client'

import { Plus, X, ChevronDown, ChevronRight, Check, Ban } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ScopeItem {
  id: string
  item: string
  included: boolean
  qty: number | null
  unit_price: number | null
}

export interface ScopeCategory {
  id: string
  category: string
  items: ScopeItem[]
}

interface ScopeBuildProps {
  value: ScopeCategory[]
  onChange: (v: ScopeCategory[]) => void
}

function uid() { return Math.random().toString(36).slice(2) }

export function scopeTotal(cats: ScopeCategory[]) {
  return cats.flatMap(c => c.items)
    .filter(i => i.included && i.qty && i.unit_price)
    .reduce((sum, i) => sum + (i.qty! * i.unit_price!), 0)
}

export function ScopeBuilder({ value, onChange }: ScopeBuildProps) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  function addCategory() {
    onChange([...value, { id: uid(), category: '', items: [] }])
  }

  function updateCategoryName(catId: string, name: string) {
    onChange(value.map(c => c.id === catId ? { ...c, category: name } : c))
  }

  function removeCategory(catId: string) {
    onChange(value.filter(c => c.id !== catId))
  }

  function addItem(catId: string) {
    onChange(value.map(c => c.id === catId
      ? { ...c, items: [...c.items, { id: uid(), item: '', included: true, qty: null, unit_price: null }] }
      : c))
  }

  function updateItem(catId: string, itemId: string, patch: Partial<ScopeItem>) {
    onChange(value.map(c => c.id === catId
      ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, ...patch } : i) }
      : c))
  }

  function removeItem(catId: string, itemId: string) {
    onChange(value.map(c => c.id === catId
      ? { ...c, items: c.items.filter(i => i.id !== itemId) }
      : c))
  }

  function toggleCollapse(catId: string) {
    setCollapsed(prev => ({ ...prev, [catId]: !prev[catId] }))
  }

  const grandTotal = scopeTotal(value)
  const totalIncluded = value.flatMap(c => c.items).filter(i => i.included).length
  const totalExcluded = value.flatMap(c => c.items).filter(i => !i.included).length

  return (
    <div className="space-y-2">
      {value.map(cat => {
        const catTotal = cat.items
          .filter(i => i.included && i.qty && i.unit_price)
          .reduce((s, i) => s + i.qty! * i.unit_price!, 0)

        return (
          <div key={cat.id} className="rounded-lg border border-line overflow-hidden">
            {/* Category header */}
            <div className="flex items-center gap-2 px-3 py-2.5 bg-surface border-b border-line">
              <button type="button" onClick={() => toggleCollapse(cat.id)} className="text-faint hover:text-muted-fg shrink-0">
                {collapsed[cat.id] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <input
                type="text"
                placeholder="Category (e.g. First Floor)"
                value={cat.category}
                onChange={e => updateCategoryName(cat.id, e.target.value)}
                className="flex-1 bg-transparent text-sm font-semibold text-ink-soft placeholder:text-faint focus:outline-none min-w-0"
              />
              <div className="flex items-center gap-3 shrink-0">
                {catTotal > 0 && (
                  <span className="text-xs font-semibold text-muted-fg">${catTotal.toLocaleString()}</span>
                )}
                <span className="text-xs text-faint">{cat.items.length} item{cat.items.length !== 1 ? 's' : ''}</span>
                <button type="button" onClick={() => removeCategory(cat.id)} className="text-faint hover:text-danger transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Column headers */}
            {!collapsed[cat.id] && cat.items.length > 0 && (
              <div className="grid grid-cols-[28px_1fr_80px_100px_90px_60px_20px] gap-2 px-3 py-1.5 bg-surface/50 border-b border-line-soft">
                <div />
                <p className="text-xs font-medium text-faint">Description</p>
                <p className="text-xs font-medium text-faint">Qty</p>
                <p className="text-xs font-medium text-faint">Unit Price</p>
                <p className="text-xs font-medium text-faint text-right">Total</p>
                <div />
                <div />
              </div>
            )}

            {/* Items */}
            {!collapsed[cat.id] && (
              <div className="divide-y divide-line-soft">
                {cat.items.map(item => {
                  const lineTotal = item.qty && item.unit_price ? item.qty * item.unit_price : null
                  return (
                    <div key={item.id} className={cn('grid grid-cols-[28px_1fr_80px_100px_90px_60px_20px] gap-2 items-center px-3 py-2',
                      !item.included && 'bg-danger-tint/30')}>

                      {/* Included/excluded toggle */}
                      <button
                        type="button"
                        onClick={() => updateItem(cat.id, item.id, { included: !item.included })}
                        className={cn('h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                          item.included ? 'bg-success-solid border-success text-white' : 'bg-danger-tint border-danger/40 text-danger'
                        )}
                        title={item.included ? 'Included - click to exclude' : 'Excluded - click to include'}
                      >
                        {item.included ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                      </button>

                      {/* Description */}
                      <input
                        type="text"
                        placeholder="e.g. Recessed spotlights"
                        value={item.item}
                        onChange={e => updateItem(cat.id, item.id, { item: e.target.value })}
                        className={cn('text-sm focus:outline-none bg-transparent min-w-0',
                          item.included ? 'text-ink-soft' : 'text-faint line-through'
                        )}
                      />

                      {/* Qty */}
                      <input
                        type="number"
                        placeholder="Qty"
                        min="0"
                        value={item.qty ?? ''}
                        onChange={e => updateItem(cat.id, item.id, { qty: e.target.value ? parseFloat(e.target.value) : null })}
                        disabled={!item.included}
                        className="text-sm text-center border border-line rounded px-1.5 py-1 w-full focus:outline-none focus:border-accent disabled:opacity-30 disabled:bg-surface"
                      />

                      {/* Unit price */}
                      <div className="relative">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-faint">$</span>
                        <input
                          type="number"
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          value={item.unit_price ?? ''}
                          onChange={e => updateItem(cat.id, item.id, { unit_price: e.target.value ? parseFloat(e.target.value) : null })}
                          disabled={!item.included}
                          className="text-sm border border-line rounded px-1.5 py-1 pl-5 w-full focus:outline-none focus:border-accent disabled:opacity-30 disabled:bg-surface"
                        />
                      </div>

                      {/* Line total */}
                      <p className={cn('text-sm font-medium text-right', item.included ? 'text-ink-soft' : 'text-faint')}>
                        {lineTotal != null ? `$${lineTotal.toLocaleString()}` : '-'}
                      </p>

                      {/* Status label */}
                      <span className={cn('text-xs font-medium shrink-0', item.included ? 'text-success' : 'text-danger')}>
                        {item.included ? 'In' : 'Ex'}
                      </span>

                      {/* Remove */}
                      <button type="button" onClick={() => removeItem(cat.id, item.id)} className="text-faint hover:text-danger transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}

                <div className="px-3 py-2">
                  <button type="button" onClick={() => addItem(cat.id)}
                    className="flex items-center gap-1.5 text-xs text-faint hover:text-accent-fg transition-colors">
                    <Plus className="h-3.5 w-3.5" /> Add line item
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <button
        type="button"
        onClick={addCategory}
        className="flex items-center gap-2 w-full rounded-lg border-2 border-dashed border-line px-4 py-2.5 text-sm text-faint hover:border-accent hover:text-accent-fg transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Category
      </button>

      {/* Summary row */}
      {(totalIncluded > 0 || totalExcluded > 0) && (
        <div className="flex items-center justify-between px-1 pt-1">
          <div className="flex items-center gap-4 text-xs text-muted-fg">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success-solid" />
              {totalIncluded} included
            </span>
            {totalExcluded > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-400" />
                {totalExcluded} excluded
              </span>
            )}
          </div>
          {grandTotal > 0 && (
            <div className="text-right">
              <p className="text-xs text-faint">Scope total</p>
              <p className="text-base font-bold text-ink-soft">${grandTotal.toLocaleString()}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

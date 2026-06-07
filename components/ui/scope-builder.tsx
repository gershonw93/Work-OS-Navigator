'use client'

import { Plus, X, ChevronDown, ChevronRight, Check, Ban } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface ScopeItem {
  id: string
  item: string
  included: boolean
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
      ? { ...c, items: [...c.items, { id: uid(), item: '', included: true }] }
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

  return (
    <div className="space-y-3">
      {value.map(cat => (
        <div key={cat.id} className="rounded-lg border border-slate-200 overflow-hidden">
          {/* Category header */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border-b border-slate-200">
            <button type="button" onClick={() => toggleCollapse(cat.id)} className="text-slate-400 hover:text-slate-600">
              {collapsed[cat.id] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <input
              type="text"
              placeholder="Category name (e.g. First Floor)"
              value={cat.category}
              onChange={e => updateCategoryName(cat.id, e.target.value)}
              className="flex-1 bg-transparent text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <span className="text-xs text-slate-400 shrink-0">{cat.items.length} item{cat.items.length !== 1 ? 's' : ''}</span>
            <button type="button" onClick={() => removeCategory(cat.id)} className="text-slate-300 hover:text-red-400 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Items */}
          {!collapsed[cat.id] && (
            <div className="divide-y divide-slate-50">
              {cat.items.map(item => (
                <div key={item.id} className="flex items-center gap-2.5 px-3 py-2">
                  {/* Included / Excluded toggle */}
                  <button
                    type="button"
                    onClick={() => updateItem(cat.id, item.id, { included: !item.included })}
                    className={cn('h-6 w-6 rounded-full flex items-center justify-center shrink-0 transition-colors border',
                      item.included
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'bg-red-50 border-red-300 text-red-400'
                    )}
                    title={item.included ? 'Included — click to exclude' : 'Excluded — click to include'}
                  >
                    {item.included ? <Check className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                  </button>

                  <input
                    type="text"
                    placeholder="Line item (e.g. Main panel installation)"
                    value={item.item}
                    onChange={e => updateItem(cat.id, item.id, { item: e.target.value })}
                    className={cn('flex-1 text-sm focus:outline-none bg-transparent',
                      item.included ? 'text-slate-800' : 'text-slate-400 line-through'
                    )}
                  />

                  <span className={cn('text-xs shrink-0 font-medium', item.included ? 'text-green-600' : 'text-red-400')}>
                    {item.included ? 'Included' : 'Excluded'}
                  </span>

                  <button type="button" onClick={() => removeItem(cat.id, item.id)} className="text-slate-200 hover:text-red-400 transition-colors shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}

              <div className="px-3 py-2">
                <button
                  type="button"
                  onClick={() => addItem(cat.id)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-orange-500 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" /> Add line item
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      <button
        type="button"
        onClick={addCategory}
        className="flex items-center gap-2 w-full rounded-lg border-2 border-dashed border-slate-200 px-4 py-2.5 text-sm text-slate-400 hover:border-orange-300 hover:text-orange-500 transition-colors"
      >
        <Plus className="h-4 w-4" /> Add Category
      </button>

      {value.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {value.flatMap(c => c.items).filter(i => i.included).length} included
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            {value.flatMap(c => c.items).filter(i => !i.included).length} excluded
          </span>
        </div>
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { Check, X, Plus, Lightbulb, Scale, ArrowLeftRight } from 'lucide-react'
import {
  PACKAGE_TYPES, MATERIAL_BY_LABEL, comparabilityNote, scopeForTrade,
  type MaterialBy, type PackageType, type TradeScope,
} from '@/lib/trade-scopes'

export interface ScopeValue {
  package_type: PackageType
  material_by: MaterialBy
  included: string[]
  excluded: string[]
  ask_for: string[]
}

export const EMPTY_SCOPE: ScopeValue = {
  package_type: 'turnkey', material_by: 'sub', included: [], excluded: [], ask_for: [],
}

type ListKey = 'included' | 'excluded' | 'ask_for'

const LIST_META: Record<ListKey, { label: string; short: string; tone: 'in' | 'out' | 'ask' }> = {
  included: { label: 'Included in this package', short: 'Included', tone: 'in' },
  excluded: { label: 'Not included', short: 'Not included', tone: 'out' },
  ask_for: { label: 'What we need back', short: 'Need back', tone: 'ask' },
}

/**
 * A small editable list of one-line points.
 *
 * The template gets you 90% there and the last 10% is always the same two
 * moves: fix the wording, or realise a line belongs in the other list. Both
 * used to mean delete-and-retype, which is why nobody bothered and packages
 * went out with the defaults unedited.
 */
function PointList({
  listKey, hint, points, onChange, onMove,
}: {
  listKey: ListKey
  hint?: string
  points: string[]
  onChange: (next: string[]) => void
  /** Send this line to one of the other lists, keeping its text. */
  onMove: (index: number, to: ListKey) => void
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [editText, setEditText] = useState('')
  const [moving, setMoving] = useState<number | null>(null)

  const { label, tone } = LIST_META[listKey]
  const dot = tone === 'in' ? 'text-success' : tone === 'out' ? 'text-danger' : 'text-accent-fg'
  const others = (Object.keys(LIST_META) as ListKey[]).filter(k => k !== listKey)

  function add() {
    const v = draft.trim()
    if (!v) return
    onChange([...points, v])
    setDraft('')
  }

  function startEdit(i: number) {
    setEditing(i); setEditText(points[i]); setMoving(null)
  }

  function commitEdit() {
    if (editing == null) return
    const v = editText.trim()
    // An emptied line means they wanted it gone.
    onChange(v ? points.map((p, j) => (j === editing ? v : p)) : points.filter((_, j) => j !== editing))
    setEditing(null)
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {hint && <p className="text-[11px] text-faint -mt-1">{hint}</p>}
      <div className="space-y-1">
        {points.map((p, i) => (
          <div key={i} className="rounded-lg border border-line bg-surface">
            <div className="group flex items-start gap-2 px-2.5 py-1.5">
              <span className={cn('mt-0.5 shrink-0', dot)}>
                {tone === 'out' ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
              </span>

              {editing === i ? (
                <Input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                    if (e.key === 'Escape') { e.preventDefault(); setEditing(null) }
                  }}
                  className="h-7 flex-1 min-w-0 text-sm" />
              ) : (
                <button type="button" onClick={() => startEdit(i)}
                  className="flex-1 min-w-0 text-left text-sm text-ink-soft hover:text-ink"
                  title="Click to edit">
                  {p}
                </button>
              )}

              {editing !== i && (
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setMoving(moving === i ? null : i)}
                    className={cn('rounded p-0.5', moving === i ? 'text-accent-fg' : 'text-faint hover:text-ink')}
                    aria-label={`Move "${p}" to another list`} title="Move to another list">
                    <ArrowLeftRight className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => onChange(points.filter((_, j) => j !== i))}
                    className="text-faint hover:text-danger" aria-label={`Remove ${p}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {moving === i && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-line-soft px-2.5 py-1.5">
                <span className="text-[11px] text-faint">Move to</span>
                {others.map(k => (
                  <button key={k} type="button"
                    onClick={() => { onMove(i, k); setMoving(null) }}
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-ink-soft hover:border-accent hover:bg-accent-tint hover:text-accent-fg">
                    {LIST_META[k].short}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
          placeholder="Add a line…" className="h-8 text-sm" />
        <button type="button" onClick={add}
          className="shrink-0 rounded-lg border border-line px-2.5 text-muted-fg hover:bg-muted">
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/**
 * The scope questions that go out with an RFQ.
 *
 * Every bidder answering the same questions is what makes bids comparable -
 * not quantities. Most jobs never get a takeoff, so this has to work with
 * nothing but a set of plans, and it does.
 *
 * Picking a trade loads that trade's defaults, which the company can then edit
 * per package without touching their template.
 */
export function ScopeBuilder({
  trade, value, onChange, itemCount = 0,
}: {
  trade: string | null
  value: ScopeValue
  onChange: (next: ScopeValue) => void
  itemCount?: number
}) {
  const supabase = createClient()
  const [scopes, setScopes] = useState<TradeScope[]>([])
  const [loadedFor, setLoadedFor] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/trade-scopes', {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      })
      if (res.ok) setScopes((await res.json()).scopes ?? [])
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load the trade's template the first time that trade is chosen. Never
  // clobber edits already made on this package.
  useEffect(() => {
    if (!trade || trade === loadedFor) return
    const fromServer = scopes.find(s => s.trade.toLowerCase() === trade.toLowerCase())
    const tpl = fromServer ?? scopeForTrade(trade)
    if (!tpl) return
    setLoadedFor(trade)
    onChange({
      package_type: tpl.package_type,
      material_by: tpl.material_by,
      included: [...tpl.included],
      excluded: [...tpl.excluded],
      ask_for: [...tpl.ask_for],
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trade, scopes])

  const tpl = trade ? (scopes.find(s => s.trade.toLowerCase() === trade.toLowerCase()) ?? scopeForTrade(trade)) : null
  const set = (patch: Partial<ScopeValue>) => onChange({ ...value, ...patch })

  /**
   * Move a line from one list to another in a single update.
   *
   * Both arrays change at once, so this cannot go through `set` twice - the
   * second call would be built on the pre-move value and drop the removal.
   */
  const move = (from: ListKey) => (index: number, to: ListKey) => {
    const text = value[from][index]
    if (text == null) return
    onChange({
      ...value,
      [from]: value[from].filter((_, j) => j !== index),
      [to]: [...value[to], text],
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-surface p-4">
      <div>
        <p className="text-sm font-semibold text-ink">What are they pricing?</p>
        <p className="text-xs text-muted-fg mt-0.5">
          This goes out with the request. Every bidder answers the same questions, which is what lets you
          compare them.
        </p>
        {/* Where these lines came from. Otherwise they read as rules handed
            down rather than a starting point you're meant to edit. */}
        {tpl && (
          <p className="text-[11px] text-faint mt-1.5">
            Filled in from the <span className="font-medium text-muted-fg">{tpl.trade}</span> template.
            Click any line to edit it, or move it between lists. Trades that work the same way
            (plumbing and electrical, say) start out looking alike - that&apos;s the trade, not a mistake.
          </p>
        )}
      </div>

      {tpl?.note && (
        <p className="flex items-start gap-2 rounded-lg bg-accent-tint px-3 py-2 text-xs text-accent-fg">
          <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {tpl.note}
        </p>
      )}

      {/* The fork everything hangs off */}
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Package</Label>
          <div className="grid gap-1.5">
            {PACKAGE_TYPES.map(p => (
              <button key={p.key} type="button" onClick={() => set({ package_type: p.key })}
                className={cn('rounded-lg border px-3 py-2 text-left transition-colors',
                  value.package_type === p.key
                    ? 'border-accent bg-accent-tint text-accent-fg'
                    : 'border-line bg-panel text-ink-soft hover:bg-muted')}>
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block text-[11px] text-muted-fg">{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Who supplies the material?</Label>
          <div className="grid gap-1.5">
            {(['sub', 'gc', 'na'] as MaterialBy[]).map(m => (
              <button key={m} type="button" onClick={() => set({ material_by: m })}
                className={cn('rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors',
                  value.material_by === m
                    ? 'border-accent bg-accent-tint text-accent-fg'
                    : 'border-line bg-panel text-ink-soft hover:bg-muted')}>
                {MATERIAL_BY_LABEL[m]}
              </button>
            ))}
          </div>
          {value.material_by === 'gc' && (
            <p className="text-[11px] text-warn">
              You&apos;re buying the material, so ask them for the list of what to order.
            </p>
          )}
        </div>
      </div>

      <PointList listKey="included" points={value.included}
        onChange={v => set({ included: v })} onMove={move('included')} />
      <PointList listKey="excluded" hint="The gaps that turn into change orders when left unsaid."
        points={value.excluded} onChange={v => set({ excluded: v })} onMove={move('excluded')} />
      <PointList listKey="ask_for" hint="Besides a price."
        points={value.ask_for} onChange={v => set({ ask_for: v })} onMove={move('ask_for')} />

      <p className="flex items-start gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-xs text-muted-fg">
        <Scale className="h-3.5 w-3.5 shrink-0 mt-0.5 text-faint" />
        {comparabilityNote(value.package_type, itemCount > 0)}
      </p>
    </div>
  )
}

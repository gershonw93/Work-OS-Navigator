'use client'

import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Group, PermitStage } from '@/lib/permit-rounds'
import { GROUP_STYLE, StepBar } from './permit-panel'

// ─────────────────────────────────────────────────────────────────────────────
// The Permits list, in the three groups that answer "what do I do": YOUR MOVE
// (most urgent first), WITH THE CITY (waiting longest first) and ISSUED
// (collapsed - nothing to do). Each row says the next step in words, draws the
// four steps as a bar, says how long, and carries one button. The grouping and
// every sentence come from `permitStage`; this file only lays them out.
// ─────────────────────────────────────────────────────────────────────────────

export interface ListRow {
  id: string
  type: string
  meta: string
  st: PermitStage
}

const GROUPS: { g: Group; label: string; sub: string; empty: string }[] = [
  { g: 'you', label: 'Your move', sub: 'Most urgent first', empty: 'Nothing needs you right now.' },
  { g: 'city', label: 'With the city', sub: 'Waiting longest first', empty: 'Nothing out for review.' },
  { g: 'iss', label: 'Issued', sub: 'Nothing to do', empty: 'Nothing issued yet.' },
]

function Row({ r, first, selected, compact, canEdit, onOpen, onAnswer }: {
  r: ListRow; first: boolean; selected: boolean; compact: boolean; canEdit: boolean
  onOpen: () => void; onAnswer: () => void
}) {
  const st = r.st
  const btn = st.stage === 'draft' ? 'Apply' : st.stage === 'fix' ? 'Fix it' : st.stage === 'renew' ? 'Renew' : st.stage === 'city' ? 'Their answer' : ''
  return (
    <div className={cn('group relative grid min-h-[60px] items-center gap-x-3 gap-y-0.5 px-4 py-2.5 lg:gap-x-4 lg:px-[18px]',
      'grid-cols-[minmax(0,1fr)_auto]',
      compact ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_118px]' : 'lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.5fr)_92px_140px_112px]',
      selected ? 'bg-accent-tint' : 'hover:bg-surface')}>
      <button type="button" onClick={onOpen}
        className="min-w-0 text-left after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-info">
        <span className="block truncate text-[15px] font-semibold text-ink">{r.type}</span>
        <span className="block truncate text-[12.5px] text-muted-fg">{r.meta}</span>
      </button>
      <div className={cn('col-span-2 row-start-2 min-w-0 text-sm lg:col-span-1 lg:row-start-auto',
        st.group === 'you' ? 'font-semibold text-ink' : st.group === 'iss' ? 'text-muted-fg' : 'text-ink-soft')}>
        {st.next}
      </div>
      {!compact && <div className="hidden lg:block"><StepBar st={st} /></div>}
      <div className={cn('row-start-1 text-right text-[13px] lg:row-start-auto',
        st.timeTone === 'bad' ? 'font-semibold text-danger' : st.timeTone === 'warn' ? 'font-semibold text-warn' : 'text-muted-fg')}>
        {st.time}
      </div>
      {!compact && (
        <div className="hidden justify-end lg:flex">
          {canEdit && btn && (
            <button type="button" onClick={st.stage === 'city' ? onAnswer : onOpen}
              className={cn('relative z-[1] inline-flex min-h-[34px] items-center whitespace-nowrap rounded-lg border px-3 text-[13px] font-semibold',
                first && st.group === 'you' ? 'border-accent bg-accent text-accent-ink hover:bg-accent/90' : 'border-line bg-panel text-ink hover:bg-surface',
                // "Their answer" shows on hover from lg up; it is in reach on
                // every row through the panel anyway.
                st.stage === 'city' && 'opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100')}>
              {btn}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function PermitList({ rows, openId, compact, canEdit, filtering, onOpen, onAnswer }: {
  rows: ListRow[]
  openId: string | null
  /** The panel is open beside the list: drop the bar and the buttons, which the panel now carries. */
  compact: boolean
  canEdit: boolean
  /** A search is on: Issued opens so a match there is not hidden behind a collapsed header. */
  filtering: boolean
  onOpen: (id: string) => void
  onAnswer: (id: string) => void
}) {
  const [showIssued, setShowIssued] = useState(false)
  return (
    <div className="space-y-4 lg:space-y-6">
      {GROUPS.map(({ g, label, sub, empty }) => {
        const mine = rows.filter(r => r.st.group === g)
        const collapsible = g === 'iss'
        const open = !collapsible || showIssued || filtering
        const head = (
          <>
            {collapsible && <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-90')} aria-hidden="true" />}
            <span className="text-[15px] font-bold text-ink">{label}</span>
            <span className={cn('inline-flex h-[22px] min-w-6 items-center whitespace-nowrap justify-center rounded-full px-[7px] text-xs font-bold', GROUP_STYLE[g].pill)}>{mine.length}</span>
            <span className="ml-auto text-[12.5px] text-muted-fg lg:ml-0 lg:text-[13px]">{sub}</span>
          </>
        )
        return (
          <section key={g}>
            {collapsible ? (
              <button type="button" aria-expanded={open} onClick={() => setShowIssued(v => !v)}
                className="sticky top-0 z-[5] flex min-h-11 w-full items-center gap-2 bg-surface text-left lg:static lg:bg-transparent">
                {head}
              </button>
            ) : (
              <div className="sticky top-0 z-[5] mb-1 flex min-h-10 items-center gap-2 bg-surface lg:static lg:mb-2 lg:min-h-0 lg:bg-transparent">{head}</div>
            )}
            {open && (
              <div className={cn('divide-y divide-line-soft rounded-2xl border border-line bg-panel lg:rounded-xl', collapsible && 'mt-2')}>
                {mine.length === 0 && <p className="px-4 py-4 text-sm text-muted-fg">{empty}</p>}
                {mine.map((r, i) => (
                  <Row key={r.id} r={r} first={i === 0} selected={r.id === openId} compact={compact} canEdit={canEdit}
                    onOpen={() => onOpen(r.id)} onAnswer={() => onAnswer(r.id)} />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

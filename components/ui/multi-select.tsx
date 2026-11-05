'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronsUpDown, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { autoFocusOnDesktop } from '@/lib/auto-focus'

/**
 * A dropdown with checkboxes - the SearchableSelect trigger and panel, picking
 * many. Asked for in so many words ("i want a normal dropdown with
 * checkboxes") over a wall of chips that took half the dialog.
 *
 * Ticking does NOT close it: picking several is the point, so it closes on
 * Done, Escape, or a press outside. The search box doubles as the way to add
 * one that is not listed (`onCreate`), offered only when what is typed
 * matches nothing already there - a picker must not offer to add what it is
 * already showing you.
 */
export function MultiSelect({ options, value, onChange, onCreate, placeholder = 'Select…', createLabel = 'Add' }: {
  options: string[]
  value: string[]
  onChange: (next: string[]) => void
  /** Present = the search box can add an option that is not listed. */
  onCreate?: (name: string) => void
  placeholder?: string
  createLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function place() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const below = spaceBelow > 320 || spaceBelow > r.top
    const vw = window.innerWidth
    if (vw <= 640) { setRect({ top: below ? r.bottom + 4 : r.top - 4, left: 8, width: vw - 16, below }); return }
    const width = Math.min(Math.max(r.width, 240), vw - 16)
    let left = r.left
    if (left + width > vw - 8) left = vw - 8 - width
    if (left < 8) left = 8
    setRect({ top: below ? r.bottom + 4 : r.top - 4, left, width, below })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const handler = () => place()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => { window.removeEventListener('scroll', handler, true); window.removeEventListener('resize', handler) }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => { if (open) setQuery('') }, [open])

  const q = query.trim().toLowerCase()
  const shown = q ? options.filter(o => o.toLowerCase().includes(q)) : options
  const typed = query.trim().replace(/\s+/g, ' ')
  const canCreate = !!onCreate && !!typed && !options.some(o => o.toLowerCase() === typed.toLowerCase())

  const toggle = (o: string) => onChange(value.includes(o) ? value.filter(x => x !== o) : [...value, o])
  function create() {
    if (!canCreate || !onCreate) return
    onCreate(typed)
    setQuery('')
  }

  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setOpen(o => !o)}
        data-select-trigger="" aria-haspopup="listbox" aria-expanded={open}
        className="flex h-9 w-full items-center rounded-md border border-muted2 bg-panel px-3 py-1 text-left text-sm text-ink transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent">
        <span className="flex w-full min-w-0 items-center justify-between gap-2">
          <span className={cn('truncate', !value.length && 'text-faint')}>{value.length ? value.join(', ') : placeholder}</span>
          <span className="flex shrink-0 items-center gap-1.5">
            {value.length > 1 && <span className="whitespace-nowrap rounded-full bg-accent-tint px-1.5 text-xs font-medium text-accent-fg">{value.length}</span>}
            <ChevronsUpDown className="h-4 w-4 text-faint" />
          </span>
        </span>
      </button>

      {open && rect && typeof document !== 'undefined' && createPortal(
        <div ref={panelRef} data-overlay role="listbox" aria-multiselectable="true"
          style={{ position: 'fixed', top: rect.below ? rect.top : undefined, bottom: rect.below ? undefined : window.innerHeight - rect.top, left: rect.left, width: rect.width, zIndex: 9999 }}
          className="overflow-hidden rounded-lg border border-line bg-panel shadow-xl">
          <div className="flex items-center gap-2 border-b border-line-soft px-2.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input autoFocus={autoFocusOnDesktop()} value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (canCreate) create(); else if (shown.length === 1) toggle(shown[0]) } }}
              placeholder={onCreate ? 'Search, or type a new one…' : 'Search…'} style={{ fontSize: 16 }}
              className="w-full bg-transparent py-2 text-ink placeholder:text-faint focus:outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {shown.map(o => {
              const on = value.includes(o)
              return (
                <button key={o} type="button" role="option" aria-selected={on} onClick={() => toggle(o)}
                  className="flex min-h-10 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm text-ink-soft hover:bg-muted hover:text-ink">
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                    on ? 'border-accent bg-accent text-accent-ink' : 'border-muted2 bg-panel')}>
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 truncate">{o}</span>
                </button>
              )
            })}
            {canCreate && (
              <button type="button" onClick={create}
                className="flex min-h-10 w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm font-medium text-accent-fg hover:bg-muted">
                <Plus className="h-4 w-4 shrink-0" /><span className="min-w-0 truncate">{createLabel} &ldquo;{typed}&rdquo;</span>
              </button>
            )}
            {!shown.length && !canCreate && <div className="px-3 py-2 text-sm text-faint">No matches</div>}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line-soft px-3 py-2">
            <span className="text-xs text-muted-fg">{value.length ? `${value.length} picked` : 'None picked'}</span>
            <button type="button" onClick={() => setOpen(false)} className="min-h-9 rounded-md bg-accent px-3 text-sm font-medium text-accent-ink">Done</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

'use client'

import { cn } from '@/lib/utils'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import {
  Children,
  ReactNode,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SearchableSelectProps {
  value?: string
  defaultValue?: string
  onChange?: (e: { target: { value: string }; currentTarget: { value: string } }) => void
  /** Provide options directly, or pass <option> children. */
  options?: SelectOption[]
  children?: ReactNode
  className?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  name?: string
  id?: string
  /** Alphabetically sort by label (default true). */
  sort?: boolean
  /** Show the search box (default true). */
  searchable?: boolean
  onClick?: (e: React.MouseEvent) => void
  style?: React.CSSProperties
}

// Flatten React children (incl. arrays/fragments) into <option> descriptors.
function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = []
  Children.forEach(children, child => {
    if (!isValidElement(child)) return
    if (child.type === 'option') {
      const p: any = child.props
      const label = (typeof p.children === 'string'
        ? p.children
        : Array.isArray(p.children)
          ? p.children.filter((c: any) => typeof c === 'string').join('')
          : String(p.children ?? '')).trim()
      // Native <option> uses its text as the value when value is omitted.
      const value = p.value !== undefined && p.value !== null ? String(p.value) : label
      out.push({ value, label, disabled: p.disabled })
    } else if (child.props && (child.props as any).children) {
      out.push(...optionsFromChildren((child.props as any).children))
    }
  })
  return out
}

const triggerClasses =
  'flex h-9 w-full items-center justify-between gap-2 rounded-md border border-muted2 bg-panel px-3 py-1 text-sm text-ink ' +
  'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent disabled:cursor-not-allowed disabled:opacity-50 transition-colors'

export function SearchableSelect({
  value,
  defaultValue,
  onChange,
  options,
  children,
  className,
  placeholder = 'Select…',
  disabled,
  required,
  name,
  sort = true,
  searchable = true,
  onClick,
  style,
}: SearchableSelectProps) {
  const [internal, setInternal] = useState(defaultValue ?? '')
  const current = value !== undefined ? value : internal

  const baseOptions = useMemo(
    () => options ?? optionsFromChildren(children),
    [options, children]
  )
  const ordered = useMemo(() => {
    const list = [...baseOptions]
    if (sort) {
      list.sort((a, b) => {
        // Keep a leading empty/placeholder option first
        if (a.value === '' && b.value !== '') return -1
        if (b.value === '' && a.value !== '') return 1
        return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' })
      })
    }
    return list
  }, [baseOptions, sort])

  const selected = baseOptions.find(o => o.value === current)
  // A leading empty-value option acts as the placeholder label.
  const placeholderOption = baseOptions.find(o => o.value === '')
  const displayLabel = selected && selected.value !== ''
    ? selected.label
    : (placeholderOption?.label || placeholder)

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; below: boolean } | null>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = ordered.filter(o => o.value !== '' || !q) // hide empty placeholder while searching
    if (!q) return list
    return list.filter(o => o.label.toLowerCase().includes(q))
  }, [ordered, query])

  function place() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - r.bottom
    const below = spaceBelow > 280 || spaceBelow > r.top
    setRect({ top: below ? r.bottom + 4 : r.top - 4, left: r.left, width: r.width, below })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const handler = () => place()
    window.addEventListener('scroll', handler, true)
    window.addEventListener('resize', handler)
    return () => {
      window.removeEventListener('scroll', handler, true)
      window.removeEventListener('resize', handler)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) {
      setQuery('')
      const idx = visible.findIndex(o => o.value === current)
      setActiveIdx(idx >= 0 ? idx : 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function commit(opt: SelectOption) {
    if (opt.disabled) return
    if (value === undefined) setInternal(opt.value)
    onChange?.({ target: { value: opt.value }, currentTarget: { value: opt.value } })
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault(); setOpen(true); return
    }
    if (!open) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, visible.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (visible[activeIdx]) commit(visible[activeIdx]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        disabled={disabled}
        style={style}
        onClick={e => { onClick?.(e); if (!disabled) setOpen(o => !o) }}
        onKeyDown={onKeyDown}
        className={cn(triggerClasses, className)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate text-left', (!selected || selected.value === '') && 'text-faint')}>
          {displayLabel}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-faint" />
      </button>
      {name && <input type="hidden" name={name} value={current} required={required} />}

      {open && rect && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: rect.below ? rect.top : undefined,
            bottom: rect.below ? undefined : window.innerHeight - rect.top,
            left: rect.left,
            width: rect.width,
            zIndex: 9999,
          }}
          className="rounded-lg border border-line bg-panel shadow-xl overflow-hidden"
        >
          {searchable && (
            <div className="flex items-center gap-2 border-b border-line-soft px-2.5">
              <Search className="h-3.5 w-3.5 text-faint shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={e => { setQuery(e.target.value); setActiveIdx(0) }}
                onKeyDown={onKeyDown}
                placeholder="Search…"
                className="w-full bg-transparent py-2 text-sm text-ink placeholder:text-faint focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto py-1">
            {visible.length === 0 ? (
              <div className="px-3 py-2 text-sm text-faint">No matches</div>
            ) : (
              visible.map((opt, i) => (
                <button
                  type="button"
                  key={opt.value + i}
                  disabled={opt.disabled}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => commit(opt)}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors',
                    opt.disabled && 'opacity-40 cursor-not-allowed',
                    i === activeIdx ? 'bg-muted text-ink' : 'text-ink-soft'
                  )}
                >
                  <span className="truncate">{opt.label}</span>
                  {opt.value === current && <Check className="h-4 w-4 shrink-0 text-accent-fg" />}
                </button>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

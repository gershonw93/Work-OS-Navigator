'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Loader2, X, CornerDownLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type Hit = { id: string; title: string; subtitle?: string | null; href: string }
type Group = { key: string; label: string; items: Hit[] }

// Global search in the top bar. Type anything (a job name, a line item, a
// receipt store, a customer, an invoice number...) and jump straight to it.
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const reqId = useRef(0)

  // Flat list of hits, in render order, for keyboard navigation.
  const flat: Hit[] = groups.flatMap(g => g.items)

  const runSearch = useCallback(async (query: string) => {
    const term = query.trim()
    if (term.length < 2) { setGroups([]); setLoading(false); return }
    const mine = ++reqId.current
    setLoading(true)
    try {
      const { data: { session } } = await createClient().auth.getSession()
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      })
      if (mine !== reqId.current) return // a newer keystroke won
      const data = res.ok ? await res.json() : { groups: [] }
      setGroups(data.groups ?? [])
      setActive(0)
    } catch {
      if (mine === reqId.current) setGroups([])
    } finally {
      if (mine === reqId.current) setLoading(false)
    }
  }, [])

  // Debounce the query.
  useEffect(() => {
    const t = setTimeout(() => runSearch(q), 180)
    return () => clearTimeout(t)
  }, [q, runSearch])

  // Cmd/Ctrl+K focuses the search; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function go(hit: Hit) {
    setOpen(false)
    setQ('')
    setGroups([])
    router.push(hit.href)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, flat.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && flat[active]) { e.preventDefault(); go(flat[active]) }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  const showPanel = open && q.trim().length >= 2
  // Assign each hit a stable flat index so hover/highlight line up with keys.
  let counter = 0
  const indexed = groups.map(g => ({ ...g, items: g.items.map(hit => ({ hit, i: counter++ })) }))

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
        <input
          ref={inputRef}
          value={q}
          onChange={e => { setQ(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search jobs, line items, receipts, people…"
          className="w-full rounded-lg border border-line bg-surface pl-9 pr-16 py-2 text-sm text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent/30"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {loading && <Loader2 className="h-3.5 w-3.5 text-faint animate-spin" />}
          {q ? (
            <button onClick={() => { setQ(''); setGroups([]); inputRef.current?.focus() }} aria-label="Clear search" className="text-faint hover:text-ink">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden lg:inline-flex items-center rounded border border-line bg-panel px-1.5 text-[10px] font-medium text-faint">⌘K</kbd>
          )}
        </div>
      </div>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-line bg-panel shadow-2xl z-50">
          {flat.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted-fg">
              {loading ? 'Searching…' : `No results for “${q.trim()}”`}
            </p>
          ) : (
            <div className="py-1.5">
              {indexed.map(group => (
                <div key={group.key} className="py-1">
                  <p className="px-4 pt-1.5 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-faint">{group.label}</p>
                  {group.items.map(({ hit, i }) => {
                    const isActive = i === active
                    return (
                      <button
                        key={hit.id}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(hit)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-4 py-2 text-left',
                          isActive ? 'bg-muted' : 'hover:bg-muted/60',
                        )}
                      >
                        <div className="min-w-0">
                          <p className="text-sm text-ink truncate">{hit.title}</p>
                          {hit.subtitle && <p className="text-xs text-muted-fg truncate">{hit.subtitle}</p>}
                        </div>
                        {isActive && <CornerDownLeft className="h-3.5 w-3.5 text-faint shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

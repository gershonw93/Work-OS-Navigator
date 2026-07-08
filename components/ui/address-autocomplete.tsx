'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { MapPin } from 'lucide-react'

// Address autocomplete via our /api/geo proxy (Google Places when a key is set,
// Photon/OSM otherwise). onPick fires with the chosen suggestion so callers can
// fetch structured parts + coordinates.
interface Suggestion { id: string; label: string; lat?: number; lng?: number }

export function AddressAutocomplete({
  value, onChange, onPick, placeholder, required, id, className,
}: {
  value: string
  onChange: (v: string) => void
  onPick?: (s: Suggestion) => void
  placeholder?: string
  required?: boolean
  id?: string
  className?: string
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [open, setOpen] = useState(false)
  const [hi, setHi] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const skipNext = useRef(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (skipNext.current) { skipNext.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    const q = value.trim()
    if (q.length < 3) { setSuggestions([]); setOpen(false); return }
    timer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geo/autocomplete?q=${encodeURIComponent(q)}`)
        if (!res.ok) return
        const d = await res.json()
        setSuggestions(d.suggestions ?? [])
        setOpen((d.suggestions ?? []).length > 0)
        setHi(-1)
      } catch { /* best-effort */ }
    }, 300)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [value])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(s: Suggestion) {
    skipNext.current = true
    setOpen(false)
    if (onPick) onPick(s)
    else onChange(s.label)
  }

  return (
    <div ref={wrapRef} className="relative">
      <Input
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={className}
        autoComplete="off"
        onKeyDown={e => {
          if (!open) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setHi(h => Math.min(h + 1, suggestions.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
          else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); pick(suggestions[hi]) }
          else if (e.key === 'Escape') setOpen(false)
        }}
      />
      {open && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-line bg-panel shadow-lg">
          {suggestions.map((s, i) => (
            <button key={s.id} type="button"
              onMouseDown={e => { e.preventDefault(); pick(s) }}
              onMouseEnter={() => setHi(i)}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${i === hi ? 'bg-surface text-ink' : 'text-ink-soft'}`}>
              <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

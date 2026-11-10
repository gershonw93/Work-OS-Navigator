'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MapPin, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { foldArea, type Area } from '@/lib/permit-jurisdiction'

/**
 * Townships and counties a Directory card is the authority for, picked from a
 * map search - "it should use the google maps api and just search for
 * townships or counties and auto populate". Picked, never typed, so the name
 * is the one a job's address will be matched against.
 *
 * The results list sits IN the flow under the box rather than floating over
 * it: this lives in a dialog whose middle scrolls, and a floating panel there
 * would be clipped by that scroller.
 */
export function AreaPicker({ value, onChange }: { value: Area[]; onChange: (next: Area[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Area[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const asked = useRef('')

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) { setResults([]); setState('idle'); return }
    setState('loading')
    const t = setTimeout(async () => {
      asked.current = text
      try {
        const { data: { session } } = await createClient().auth.getSession()
        const res = await fetch(`/api/geo/areas?q=${encodeURIComponent(text)}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
        const json = await res.json().catch(() => ({}))
        if (asked.current !== text) return // a later search is the one that counts
        if (!res.ok) { setState('failed'); return }
        setResults(json.areas ?? []); setState('ready')
      } catch {
        if (asked.current === text) setState('failed')
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const key = (a: Area) => `${a.kind}|${foldArea(a.name)}|${a.state ?? ''}`
  const held = new Set(value.map(key))
  const add = (a: Area) => { if (!held.has(key(a))) onChange([...value, a]); setQ(''); setResults([]) }
  const label = (a: Area) => `${a.name}${a.kind === 'county' && !/county/i.test(a.name) ? ' County' : ''}${a.state ? `, ${a.state}` : ''}`

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map(a => (
            <span key={key(a)} className="inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface py-1 pl-2.5 pr-1 text-sm text-ink">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-faint" />
              <span className="truncate">{label(a)}</span>
              <span className="text-xs text-faint">{a.kind === 'county' ? 'County' : 'Town'}</span>
              <button type="button" onClick={() => onChange(value.filter(x => key(x) !== key(a)))} aria-label={`Remove ${label(a)}`} title="Remove"
                className="flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-panel hover:text-ink">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a township or county, e.g. Toms River"
        className="w-full rounded-lg border border-muted2 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent" />
      {state === 'loading' && <p className="flex items-center gap-1.5 text-xs text-muted-fg"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching...</p>}
      {state === 'failed' && <p className="text-xs text-danger">Could not search right now. Try again in a moment.</p>}
      {state === 'ready' && (
        results.length ? (
          <div className="divide-y divide-line-soft rounded-lg border border-line">
            {results.map(a => (
              <button key={key(a)} type="button" onClick={() => add(a)} disabled={held.has(key(a))}
                className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface disabled:opacity-50">
                <Plus className="h-4 w-4 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate">{label(a)}</span>
                <span className="shrink-0 text-xs text-faint">{a.kind === 'county' ? 'County' : 'Town'}{held.has(key(a)) ? ' - added' : ''}</span>
              </button>
            ))}
          </div>
        ) : <p className="text-xs text-muted-fg">No township or county by that name.</p>
      )}
    </div>
  )
}

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
 *
 * PICKING ONE DOES NOT CLOSE THE LIST - "i cant select one and select the
 * next". A pick marks its row added and leaves the rest to tap. And it asks
 * the map what is AROUND the pick ("suggest surrounding ones"): a building
 * department usually covers its neighbours, so they are offered under
 * "Nearby", one tap each or all at once.
 */

async function ask(qs: string): Promise<{ ok: boolean; areas: Area[] }> {
  const { data: { session } } = await createClient().auth.getSession()
  const res = await fetch(`/api/geo/areas?${qs}`, { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, areas: json.areas ?? [] }
}

const key = (a: Area) => `${a.kind}|${foldArea(a.name)}|${a.state ?? ''}`
const label = (a: Area) => `${a.name}${a.kind === 'county' && !/county/i.test(a.name) ? ' County' : ''}${a.state ? `, ${a.state}` : ''}`

function AreaRow({ a, added, onPick }: { a: Area; added: boolean; onPick: (a: Area) => void }) {
  return (
    <button type="button" onClick={() => onPick(a)} disabled={added}
      className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:bg-surface disabled:opacity-50">
      <Plus className="h-4 w-4 shrink-0 text-faint" />
      <span className="min-w-0 flex-1 truncate">{label(a)}</span>
      <span className="shrink-0 text-xs text-faint">{a.kind === 'county' ? 'County' : 'Town'}{added ? ' - added' : ''}</span>
    </button>
  )
}

export function AreaPicker({ value, onChange }: { value: Area[]; onChange: (next: Area[]) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Area[]>([])
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle')
  const asked = useRef('')
  const [near, setNear] = useState<{ of: Area; state: 'loading' | 'ready' | 'failed'; areas: Area[] } | null>(null)
  const nearFor = useRef('')

  useEffect(() => {
    const text = q.trim()
    if (text.length < 2) { setResults([]); setState('idle'); return }
    setState('loading')
    const t = setTimeout(async () => {
      asked.current = text
      try {
        const r = await ask(`q=${encodeURIComponent(text)}`)
        if (asked.current !== text) return // a later search is the one that counts
        if (!r.ok) { setState('failed'); return }
        setResults(r.areas); setState('ready')
      } catch {
        if (asked.current === text) setState('failed')
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q])

  const held = new Set(value.map(key))

  const loadNearby = async (a: Area) => {
    const k = key(a)
    nearFor.current = k
    setNear({ of: a, state: 'loading', areas: [] })
    try {
      const r = await ask(`near=${encodeURIComponent(JSON.stringify(a))}`)
      if (nearFor.current !== k) return // a later pick is the one that counts
      setNear({ of: a, state: r.ok ? 'ready' : 'failed', areas: r.areas })
    } catch {
      if (nearFor.current === k) setNear({ of: a, state: 'failed', areas: [] })
    }
  }

  // From the search: add it, keep the list, and look around it.
  const pick = (a: Area) => {
    if (held.has(key(a))) return
    onChange([...value, a])
    void loadNearby(a)
  }
  // From Nearby: add it and leave the suggestions where they are, so the next is one tap.
  const addNear = (a: Area) => { if (!held.has(key(a))) onChange([...value, a]) }
  // "Add all" takes the NEIGHBOURS only. The county a township sits in is
  // offered first, but on a township's card it claims every town in the county
  // - one tap each, never swept in with the rest.
  const nearLeft = near?.areas.filter(a => !held.has(key(a)) && a.kind === near.of.kind) ?? []

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
            {results.map(a => <AreaRow key={key(a)} a={a} added={held.has(key(a))} onPick={pick} />)}
          </div>
        ) : <p className="text-xs text-muted-fg">No township or county by that name.</p>
      )}
      {near && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-medium text-muted-fg">Near {label(near.of)}</p>
            {near.state === 'ready' && nearLeft.length > 1 && (
              <button type="button" onClick={() => onChange([...value, ...nearLeft])}
                className="shrink-0 whitespace-nowrap text-xs font-medium text-accent hover:underline">Add all {nearLeft.length}</button>
            )}
          </div>
          {near.state === 'loading' && <p className="flex items-center gap-1.5 text-xs text-muted-fg"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking around it...</p>}
          {near.state === 'failed' && <p className="text-xs text-muted-fg">Could not look up what is around it. Search them by name.</p>}
          {near.state === 'ready' && (near.areas.length ? (
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {near.areas.map(a => <AreaRow key={key(a)} a={a} added={held.has(key(a))} onPick={addNear} />)}
            </div>
          ) : <p className="text-xs text-muted-fg">Nothing found around it. Search them by name.</p>)}
        </div>
      )}
    </div>
  )
}

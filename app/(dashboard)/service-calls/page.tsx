'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronRight, Plus, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNotice } from '@/components/ui/notice'
import { NewCallDialog } from '@/components/service-calls/new-call-dialog'
import { callFetch, callWindow } from '@/lib/service-calls-client'
import { callLabel, STATUS_LABEL, type CallStatus } from '@/lib/service-calls'
import { cn } from '@/lib/utils'

// Service calls: one card, a row per call, the open ones first. A call opens on
// its own page (not inline under the list), so tapping the third row never
// scrolls you away from what you tapped.

type Row = { id: string; call_number: number; customer_name: string; site_address: string; issue: string; status: string; priority: string; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null }

export default function ServiceCallsPage() {
  const router = useRouter()
  const notice = useNotice()
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [problem, setProblem] = useState('')
  const [calls, setCalls] = useState<Row[]>([])
  const [crew, setCrew] = useState<{ id: string; name: string }[]>([])
  const [crewView, setCrewView] = useState(false)
  const [filter, setFilter] = useState<'open' | 'all'>('open')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await callFetch(`/api/service-calls${filter === 'open' ? '?status=open' : ''}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not load the calls.'); setState('failed'); return }
      setCalls(json.calls ?? [])
      setCrew(json.crew ?? [])
      setCrewView(!!json.crewView)
      setState('ready')
    } catch {
      setProblem('Could not load the calls.')
      setState('failed')
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  const name = (id: string | null) => crew.find(c => c.id === id)?.name ?? null

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Service calls</h1>
          <p className="text-sm text-muted-fg mt-0.5">{crewView ? 'The calls you are on.' : 'Calls from your customers, and who is on each.'}</p>
        </div>
        {!crewView && state === 'ready' && (
          <Button onClick={() => setAdding(true)} className="self-start sm:self-auto"><Plus className="h-4 w-4" /> New call</Button>
        )}
      </div>

      <div className="scroll-fade flex gap-2 overflow-x-auto pb-1">
        {(['open', 'all'] as const).map(k => (
          <button key={k} type="button" onClick={() => { setState('loading'); setFilter(k) }} aria-pressed={filter === k}
            className={cn('shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium',
              filter === k ? 'bg-accent-tint border-accent/40 text-accent-fg' : 'bg-panel border-line text-muted-fg hover:text-ink-soft')}>
            {k === 'open' ? 'Open' : 'All'}
          </button>
        ))}
      </div>

      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>{problem} The calls are unchanged - this screen just could not read them.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}
      {state === 'ready' && !calls.length && (
        <div className="rounded-2xl border border-line bg-panel p-8 text-center space-y-2">
          <Wrench className="h-8 w-8 text-faint mx-auto" aria-hidden />
          <p className="text-sm font-semibold text-ink">{filter === 'open' ? 'No open calls' : 'No calls yet'}</p>
          <p className="text-sm text-muted-fg">{crewView ? 'When the office puts you on a call it shows up here.' : 'Take a call from a customer and it shows up here.'}</p>
        </div>
      )}
      {state === 'ready' && calls.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
          {calls.map(c => (
            <Link key={c.id} href={`/service-calls/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface transition-colors">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{callLabel(c.call_number)}</span>
                  <Badge variant={c.status === 'done' ? 'success' : c.status === 'new' ? 'muted' : 'info'}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</Badge>
                  {c.priority === 'urgent' && <Badge variant="danger">Urgent</Badge>}
                </div>
                <p className="text-sm text-ink truncate mt-0.5">{c.issue}</p>
                <p className="text-xs text-muted-fg truncate">{c.customer_name} - {c.site_address}</p>
                <p className="text-xs text-muted-fg truncate">
                  {callWindow(c.scheduled_start, c.scheduled_end) ?? 'Not booked'}{name(c.assigned_to) ? ` - ${name(c.assigned_to)}` : ''}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-faint shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      )}

      {adding && (
        <NewCallDialog crew={crew} onClose={() => setAdding(false)}
          onCreated={(id, warning) => {
            setAdding(false)
            if (warning) notice(`Saved. ${warning}`, { tone: 'info' })
            router.push(`/service-calls/${id}`)
          }} />
      )}
    </div>
  )
}

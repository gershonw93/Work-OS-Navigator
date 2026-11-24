'use client'

import { useEffect, useState } from 'react'
import { Wrench } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { callFetch, callWindow } from '@/lib/service-calls-client'
import { callLabel } from '@/lib/service-calls'

// THE GC'S VIEW of the service calls a sub has tied to this job: who is doing
// them, where they stand, when. Nothing else reaches this card - the route
// builds each row with `gcView` (lib/service-calls.ts), so the sub's customer,
// notes, photos and crew stay the sub's.
//
// Renders NOTHING until it has calls to show, and nothing if the read failed:
// it is an addition to the Overview, not a section that has to explain an
// absence. The route is GC-only (`ownedProject`), so a sub never reaches it.

type GcCall = { id: string; number: number; company: string | null; status: string; status_label: string; scheduled_start: string | null; scheduled_end: string | null }

export function JobServiceCalls({ projectId }: { projectId: string }) {
  const [calls, setCalls] = useState<GcCall[]>([])
  useEffect(() => {
    let live = true
    ;(async () => {
      try {
        const res = await callFetch(`/api/projects/${projectId}/service-calls`)
        if (!res.ok) return
        const json = await res.json()
        if (live) setCalls(json.calls ?? [])
      } catch { /* an addition, not a record - nothing to say */ }
    })()
    return () => { live = false }
  }, [projectId])

  if (!calls.length) return null
  return (
    <div className="rounded-2xl border border-line bg-panel">
      <div className="flex items-center gap-2 px-4 pt-4">
        <Wrench className="h-4 w-4 text-faint" aria-hidden />
        <p className="text-sm font-semibold text-ink">Service calls from your subs</p>
      </div>
      <ul className="divide-y divide-line-soft">
        {calls.map(c => (
          <li key={c.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{callLabel(c.number)}</span>
              <Badge variant={c.status === 'done' || c.status === 'invoiced' ? 'success' : 'info'}>{c.status_label}</Badge>
            </div>
            <p className="text-muted-fg mt-0.5">{c.company ?? 'A sub'}{callWindow(c.scheduled_start, c.scheduled_end) ? ` - ${callWindow(c.scheduled_start, c.scheduled_end)}` : ''}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

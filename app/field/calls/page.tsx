'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { callFetch, callWindow } from '@/lib/service-calls-client'
import { callLabel, STATUS_LABEL, type CallStatus } from '@/lib/service-calls'
import { getViewAsUser } from '@/lib/use-permissions'
import { useScreenAccess, ScreenAccessNotice } from '@/components/ui/screen-access'

// Field Mode: the calls assigned to me, soonest first. The server only ever
// returns a crew member's own calls (lib/service-calls-server.ts), so there is
// no "everybody's" view here to hide.

type Row = { id: string; assigned_to: string | null; call_number: number; customer_name: string; site_address: string; issue: string; status: string; priority: string; scheduled_start: string | null; scheduled_end: string | null }

const soonest = (a: Row, b: Row) => {
  // An unbooked call goes LAST: an empty start sorts before every real one.
  if (!a.scheduled_start) return 1
  if (!b.scheduled_start) return -1
  return a.scheduled_start.localeCompare(b.scheduled_start)
}

export default function FieldCallsPage() {
  const { access, perms } = useScreenAccess('service-calls')
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [calls, setCalls] = useState<Row[]>([])
  // A PREVIEW ASKS THE SERVER AS THE ADMIN, so the answer is every call the
  // company has. Previewing a PERSON narrows it to theirs, as the server does
  // for them; previewing a ROLE has nobody to narrow to, so it lists nothing
  // and says so rather than showing the admin's whole board as a crew view.
  const previewUser = perms.previewing ? getViewAsUser() : null
  const roleOnlyPreview = perms.previewing && !previewUser

  const load = useCallback(async () => {
    try {
      const res = await callFetch('/api/service-calls?status=open')
      if (!res.ok) { setState('failed'); return }
      const json = await res.json()
      const mine = ((json.calls ?? []) as Row[]).filter(c => !previewUser || c.assigned_to === previewUser)
      setCalls(roleOnlyPreview ? [] : mine.sort(soonest))
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [previewUser, roleOnlyPreview])
  useEffect(() => { if (access === 'yes') load() }, [load, access])

  if (access !== 'yes') return <ScreenAccessNotice access={access} what="Calls" />

  return (
    <div className="p-6 space-y-4 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold text-ink">My calls</h1>
      {roleOnlyPreview && (
        <p className="rounded-xl border border-warn/30 bg-warn-tint px-3 py-2 text-sm text-warn">
          A preview of a role has nobody signed in, so no calls are listed. Each crew member sees only the calls assigned to them - preview a teammate to see theirs.
        </p>
      )}
      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>Could not load your calls. They are unchanged - this screen just could not read them.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}
      {state === 'ready' && !calls.length && (
        <div className="rounded-2xl border border-line bg-panel p-8 text-center space-y-2">
          <Wrench className="h-8 w-8 text-faint mx-auto" aria-hidden />
          <p className="text-sm font-semibold text-ink">No calls right now</p>
          <p className="text-sm text-muted-fg">When the office puts you on a call it shows up here.</p>
        </div>
      )}
      {state === 'ready' && calls.length > 0 && (
        <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
          {calls.map(c => (
            <Link key={c.id} href={`/field/calls/${c.id}`} className="flex items-center gap-3 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{callLabel(c.call_number)}</span>
                  <Badge variant={c.status === 'scheduled' ? 'info' : 'warning'}>{STATUS_LABEL[c.status as CallStatus] ?? c.status}</Badge>
                  {c.priority === 'urgent' && <Badge variant="danger">Urgent</Badge>}
                </div>
                <p className="text-base text-ink truncate mt-0.5">{c.issue}</p>
                <p className="text-sm text-muted-fg truncate">{c.site_address}</p>
                <p className="text-sm text-muted-fg">{callWindow(c.scheduled_start, c.scheduled_end) ?? 'No time yet'}</p>
              </div>
              <ChevronRight className="h-5 w-5 text-faint shrink-0" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

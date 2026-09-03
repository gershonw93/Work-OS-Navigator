'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Loader2, Users, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Who gets told when something happens.
 *
 * The other half of the screen above it. That one answers "what do I want to
 * hear about"; this answers "who hears about it at all" - and until now nothing
 * did. `notify()` takes user ids, so the choice was hand-rolled at twenty call
 * sites, four of which resolved to EVERY profile at the company. Ten office
 * staff, ten notifications, every time somebody marked work ready.
 *
 * Only events with a company-side audience appear here. A task assignment goes
 * to the person it was assigned to and that is not a policy anybody should be
 * able to change - the API refuses those too, so this is not the only thing
 * standing between somebody and a broken assignee notification.
 */

interface RoutedEvent {
  key: string
  label: string
  description: string
  group: string
  status: 'live' | 'planned'
  alsoTold: string | null
  configured: boolean
  roles: string[]
  userIds: string[]
  defaultPermission: [string, string] | null
  defaultUserIds: string[]
}

interface Member { id: string; full_name: string | null; email: string | null; role: string | null }

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  manager: 'Manager',
  project_manager: 'Project manager',
  office_staff: 'Office',
  field_supervisor: 'Supervisor',
  worker: 'Field worker',
  read_only: 'Read only',
}
const ROLE_ORDER = Object.keys(ROLE_LABELS)

export function NotificationRouting() {
  const supabase = createClient()
  const [events, setEvents] = useState<RoutedEvent[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const authHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` }
  }, [supabase])

  const load = useCallback(async () => {
    const res = await fetch('/api/settings/notification-routing', { headers: await authHeaders() })
    // Loading, empty and failed are three different facts. A failed load here
    // used to be the kind of thing that renders as "nothing configured", which
    // is a confident wrong answer about who is being told what.
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.error ?? `Could not load this (${res.status}).`)
      setLoading(false)
      return
    }
    const d = await res.json()
    setEvents(d.events ?? [])
    setMembers(d.members ?? [])
    setError(null)
    setLoading(false)
  }, [authHeaders])

  useEffect(() => { load() }, [load])

  async function save(ev: RoutedEvent, roles: string[], userIds: string[]) {
    setSaving(ev.key)
    const res = await fetch('/api/settings/notification-routing', {
      method: 'PUT', headers: await authHeaders(),
      body: JSON.stringify({ type: ev.key, roles, userIds }),
    })
    setSaving(null)
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setError(d?.error ?? 'That did not save.')
      return
    }
    setError(null)
    load()
  }

  async function reset(ev: RoutedEvent) {
    setSaving(ev.key)
    await fetch('/api/settings/notification-routing', {
      method: 'PUT', headers: await authHeaders(),
      body: JSON.stringify({ type: ev.key, reset: true }),
    })
    setSaving(null)
    load()
  }

  const nameOf = (id: string) => {
    const m = members.find(x => x.id === id)
    return m?.full_name || m?.email || 'somebody who has left'
  }

  if (loading) return <p className="py-8 text-center text-sm text-faint">Loading…</p>

  if (error && !events.length) {
    return (
      <div className="py-8 text-center">
        <p className="text-sm font-medium text-danger">Could not load who gets told.</p>
        <p className="mt-1 text-xs text-muted-fg">{error}</p>
      </div>
    )
  }

  const groups = Array.from(new Set(events.map(e => e.group)))

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-fg">
        Who on your team hears about each of these. Everyone still controls which of their own
        notifications they want above — this decides who is told in the first place.
      </p>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      {groups.map(group => (
        <div key={group} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-faint">{group}</h4>
          <div className="overflow-hidden rounded-xl border border-line divide-y divide-line-soft">
            {events.filter(e => e.group === group).map(ev => {
              const isOpen = open === ev.key
              const summary = ev.configured
                ? [...ev.roles.map(r => ROLE_LABELS[r] ?? r), ...ev.userIds.map(nameOf)].join(', ')
                : ev.defaultUserIds.length
                  ? `${ev.defaultUserIds.length} ${ev.defaultUserIds.length === 1 ? 'person' : 'people'} — ${ev.defaultUserIds.slice(0, 3).map(nameOf).join(', ')}${ev.defaultUserIds.length > 3 ? '…' : ''}`
                  : 'Nobody — set this up'

              return (
                <div key={ev.key} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : ev.key)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink-soft">
                        {ev.label}
                        {ev.status === 'planned' && (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-fg">
                            Coming soon
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-fg">{ev.description}</p>
                      <p className={cn('mt-1 text-xs', ev.configured ? 'text-ink-soft' : 'text-faint')}>
                        <Users className="mr-1 inline h-3 w-3" />
                        {summary}
                        {!ev.configured && ev.defaultUserIds.length > 0 && ' (default)'}
                      </p>
                      {/* The half this screen does not decide. A tester assigned
                          an inspection to one person and could not tell whether
                          that replaced the four named above, added to them, or
                          overlapped - because nothing here said. It adds. */}
                      {ev.alsoTold && (
                        <p className="mt-0.5 text-xs text-faint">
                          Always told as well: {ev.alsoTold}.
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 text-xs font-medium text-accent-fg">
                      {isOpen ? 'Close' : 'Change'}
                    </span>
                  </button>

                  {isOpen && (
                    <Editor
                      ev={ev}
                      members={members}
                      saving={saving === ev.key}
                      onSave={(roles, ids) => save(ev, roles, ids)}
                      onReset={() => reset(ev)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function Editor({
  ev, members, saving, onSave, onReset,
}: {
  ev: RoutedEvent
  members: Member[]
  saving: boolean
  onSave: (roles: string[], userIds: string[]) => void
  onReset: () => void
}) {
  const [roles, setRoles] = useState<string[]>(ev.roles)
  const [ids, setIds] = useState<string[]>(ev.userIds)

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v])

  const rolesPresent = ROLE_ORDER.filter(r => members.some(m => m.role === r))
  const empty = !roles.length && !ids.length

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-line-soft bg-surface p-3">
      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-soft">By role</p>
        <div className="flex flex-wrap gap-1.5">
          {rolesPresent.map(r => (
            <button
              key={r} type="button" onClick={() => toggle(roles, setRoles, r)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                roles.includes(r)
                  ? 'border-accent bg-accent-tint text-accent-fg'
                  : 'border-line bg-panel text-muted-fg hover:text-ink')}
            >
              {ROLE_LABELS[r] ?? r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold text-ink-soft">Specific people</p>
        <div className="flex flex-wrap gap-1.5">
          {members.map(m => (
            <button
              key={m.id} type="button" onClick={() => toggle(ids, setIds, m.id)}
              className={cn('rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                ids.includes(m.id)
                  ? 'border-accent bg-accent-tint text-accent-fg'
                  : 'border-line bg-panel text-muted-fg hover:text-ink')}
            >
              {m.full_name || m.email}
            </button>
          ))}
        </div>
      </div>

      {/* Said before they press it, not after it is refused. "Nobody" is almost
          always a mistake and it is the kind that fails silently forever. */}
      {empty && (
        <p className="text-xs text-warn">
          Pick at least one role or person. Leaving it empty would stop this notification
          without saying so.
        </p>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {ev.configured ? (
          <button
            type="button" onClick={onReset} disabled={saving}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-fg hover:text-ink"
          >
            <RotateCcw className="h-3 w-3" /> Back to the default
          </button>
        ) : <span />}
        <button
          type="button" onClick={() => onSave(roles, ids)} disabled={saving || empty}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink disabled:opacity-50"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          Save
        </button>
      </div>
    </div>
  )
}

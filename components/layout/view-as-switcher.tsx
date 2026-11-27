'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Eye, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions, VIEW_AS_KEY, VIEW_AS_USER_KEY, getViewAs, getViewAsUser } from '@/lib/use-permissions'

export const PREVIEW_ROLES = [
  { value: '', label: 'Admin (you)' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'office_staff', label: 'Office Staff' },
  { value: 'field_supervisor', label: 'Field Supervisor' },
  { value: 'worker', label: 'Field Worker' },
  { value: 'read_only', label: 'Worker' },
]

export function roleLabel(value: string) {
  if (value === 'admin') return 'Admin'
  return PREVIEW_ROLES.find(r => r.value === value)?.label ?? value
}

export function setViewAs(value: string) {
  if (value) localStorage.setItem(VIEW_AS_KEY, value)
  else localStorage.removeItem(VIEW_AS_KEY)
  localStorage.removeItem(VIEW_AS_USER_KEY)
  window.location.reload()
}

export function setViewAsUser(userId: string) {
  if (userId) localStorage.setItem(VIEW_AS_USER_KEY, userId)
  else localStorage.removeItem(VIEW_AS_USER_KEY)
  localStorage.removeItem(VIEW_AS_KEY)
  window.location.reload()
}

export function clearAllPreviews() {
  localStorage.removeItem(VIEW_AS_KEY)
  localStorage.removeItem(VIEW_AS_USER_KEY)
  window.location.reload()
}

interface Teammate {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

/**
 * ONE PICKER, ROLES AND PEOPLE. The person half sat behind an icon-only tab
 * ("Preview as a teammate") that read as doing nothing, while the visible
 * picker listed only roles - reported as "the dropdown lists only roles, never
 * the teammate". Both are in one list now, under headings, and a person reads
 * with their role so two people called Worker are told apart. Everybody but
 * you is offered; previewing yourself is just your own account.
 */
export function ViewAsSwitcher() {
  const { realRole, loading } = usePermissions()
  const [current] = useState<string>(() => {
    const u = getViewAsUser()
    if (u) return `user:${u}`
    return `role:${getViewAs() ?? ''}`
  })
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [people, setPeople] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    if (realRole !== 'admin') return
    let live = true
    ;(async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) return
        const res = await fetch('/api/settings/teammates', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        const d = res.ok ? await res.json() : null
        if (!live) return
        if (!d?.teammates) { setPeople('failed'); return }
        setTeammates((d.teammates as Teammate[]).filter(t => t.id !== session.user.id))
        setPeople('ready')
      } catch {
        if (live) setPeople('failed')
      }
    })()
    return () => { live = false }
  }, [realRole])

  if (loading || realRole !== 'admin') return null

  const previewing = current !== 'role:'

  function pick(value: string) {
    if (value.startsWith('user:')) setViewAsUser(value.slice(5))
    else if (value.startsWith('role:')) setViewAs(value.slice(5))
  }

  return (
    <div className={`flex w-full items-center gap-1.5 rounded-lg border px-2 py-1 lg:w-auto ${previewing ? 'border-warn/40 bg-warn-tint' : 'border-line bg-panel'}`}>
      <Eye className={`h-3.5 w-3.5 shrink-0 ${previewing ? 'text-warn' : 'text-faint'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${previewing ? 'text-warn' : 'text-muted-fg'}`}>View as</span>
      <SearchableSelect
        value={current}
        onChange={e => pick(e.target.value)}
        aria-label="View as a role or a teammate"
        className={`min-w-0 flex-1 lg:flex-none lg:min-w-[180px] text-xs font-medium bg-transparent focus:outline-none cursor-pointer ${previewing ? 'text-warn' : 'text-muted-fg'}`}
      >
        <option value="__roles" disabled>Roles</option>
        {PREVIEW_ROLES.map(r => <option key={r.value} value={`role:${r.value}`}>{r.label}</option>)}
        <option value="__people" disabled>{people === 'failed' ? 'People (could not load your team)' : people === 'loading' ? 'People (loading...)' : teammates.length ? 'People' : 'People (nobody else on your team yet)'}</option>
        {teammates.map(t => (
          <option key={t.id} value={`user:${t.id}`}>
            {`${t.full_name?.trim() || t.email || t.id.slice(0, 8)} - ${roleLabel(t.role)}`}
          </option>
        ))}
      </SearchableSelect>
    </div>
  )
}

export function ViewAsBanner() {
  const { realRole, previewing, role, previewingUser, loading } = usePermissions()

  if (loading || realRole !== 'admin' || !previewing) return null

  const label = previewingUser ? previewingUser : roleLabel(role)

  return (
    <div className="flex items-center justify-center gap-3 bg-warn-solid px-4 py-1.5 text-white text-sm font-medium">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{label}</strong> - this is a preview, not your real account.
      </span>
      <button
        onClick={clearAllPreviews}
        className="inline-flex items-center gap-1 rounded-md bg-panel/20 px-2 py-0.5 text-xs font-semibold hover:bg-panel/30 transition-colors"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  )
}

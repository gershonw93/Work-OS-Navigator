'use client'

import { useEffect, useState } from 'react'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Eye, X, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions, VIEW_AS_KEY, VIEW_AS_USER_KEY, getViewAs, getViewAsUser } from '@/lib/use-permissions'

export const PREVIEW_ROLES = [
  { value: '', label: 'Admin (you)' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'office_staff', label: 'Office Staff' },
  { value: 'field_supervisor', label: 'Field Supervisor' },
  { value: 'worker', label: 'Field Worker' },
  { value: 'read_only', label: 'Read-only viewer' },
]

export function roleLabel(value: string) {
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

export function ViewAsSwitcher() {
  const { realRole, loading } = usePermissions()
  const [currentRole, setCurrentRole] = useState<string>(() => getViewAs() ?? '')
  const [currentUser, setCurrentUser] = useState<string>(() => getViewAsUser() ?? '')
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [tab, setTab] = useState<'role' | 'user'>(currentUser ? 'user' : 'role')

  useEffect(() => {
    if (realRole !== 'admin') return
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/settings/teammates', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const d = res.ok ? await res.json() : null
      if (d?.teammates) setTeammates(d.teammates.filter((t: Teammate) => t.role !== 'admin'))
    })()
  }, [realRole])

  if (loading || realRole !== 'admin') return null

  const previewing = currentRole !== '' || currentUser !== ''

  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${previewing ? 'border-warn/40 bg-warn-tint' : 'border-line bg-panel'}`}>
      <Eye className={`h-3.5 w-3.5 shrink-0 ${previewing ? 'text-warn' : 'text-faint'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${previewing ? 'text-warn' : 'text-muted-fg'}`}>View as</span>

      {/* Tab buttons */}
      <div className="flex rounded overflow-hidden border border-line text-[10px] font-semibold">
        <button
          onClick={() => setTab('role')}
          className={`px-1.5 py-0.5 ${tab === 'role' ? 'bg-slate-700 text-white' : 'bg-panel text-muted-fg hover:bg-surface'}`}
        >Role</button>
        <button
          onClick={() => setTab('user')}
          className={`px-1.5 py-0.5 ${tab === 'user' ? 'bg-slate-700 text-white' : 'bg-panel text-muted-fg hover:bg-surface'}`}
        ><User className="h-3 w-3 inline" /></button>
      </div>

      {tab === 'role' ? (
        <SearchableSelect
          value={currentRole}
          onChange={e => { setCurrentRole(e.target.value); setViewAs(e.target.value) }}
          className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer ${previewing ? 'text-warn' : 'text-muted-fg'}`}
        >
          {PREVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </SearchableSelect>
      ) : (
        <SearchableSelect
          value={currentUser}
          onChange={e => { setCurrentUser(e.target.value); setViewAsUser(e.target.value) }}
          className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer max-w-[130px] ${previewing ? 'text-warn' : 'text-muted-fg'}`}
        >
          <option value="">- pick user -</option>
          {teammates.map(t => (
            <option key={t.id} value={t.id}>
              {t.full_name || t.email || t.id.slice(0, 8)}
            </option>
          ))}
        </SearchableSelect>
      )}
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

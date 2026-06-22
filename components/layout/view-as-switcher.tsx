'use client'

import { useEffect, useState } from 'react'
import { Eye, X, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { usePermissions, VIEW_AS_KEY, VIEW_AS_USER_KEY, getViewAs, getViewAsUser } from '@/lib/use-permissions'

export const PREVIEW_ROLES = [
  { value: '', label: 'Admin (you)' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'office_staff', label: 'Office Staff' },
  { value: 'field_supervisor', label: 'Field Supervisor' },
  { value: 'read_only', label: 'Field Worker' },
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
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${previewing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <Eye className={`h-3.5 w-3.5 shrink-0 ${previewing ? 'text-amber-600' : 'text-slate-400'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${previewing ? 'text-amber-700' : 'text-slate-500'}`}>View as</span>

      {/* Tab buttons */}
      <div className="flex rounded overflow-hidden border border-slate-200 text-[10px] font-semibold">
        <button
          onClick={() => setTab('role')}
          className={`px-1.5 py-0.5 ${tab === 'role' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >Role</button>
        <button
          onClick={() => setTab('user')}
          className={`px-1.5 py-0.5 ${tab === 'user' ? 'bg-slate-700 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        ><User className="h-3 w-3 inline" /></button>
      </div>

      {tab === 'role' ? (
        <select
          value={currentRole}
          onChange={e => { setCurrentRole(e.target.value); setViewAs(e.target.value) }}
          className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer ${previewing ? 'text-amber-700' : 'text-slate-600'}`}
        >
          {PREVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      ) : (
        <select
          value={currentUser}
          onChange={e => { setCurrentUser(e.target.value); setViewAsUser(e.target.value) }}
          className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer max-w-[130px] ${previewing ? 'text-amber-700' : 'text-slate-600'}`}
        >
          <option value="">— pick user —</option>
          {teammates.map(t => (
            <option key={t.id} value={t.id}>
              {t.full_name || t.email || t.id.slice(0, 8)}
            </option>
          ))}
        </select>
      )}
    </div>
  )
}

export function ViewAsBanner() {
  const { realRole, previewing, role, previewingUser, loading } = usePermissions()

  if (loading || realRole !== 'admin' || !previewing) return null

  const label = previewingUser ? previewingUser : roleLabel(role)

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-white text-sm font-medium">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{label}</strong> — this is a preview, not your real account.
      </span>
      <button
        onClick={clearAllPreviews}
        className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  )
}

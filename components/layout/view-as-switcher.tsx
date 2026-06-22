'use client'

import { useState } from 'react'
import { Eye, X } from 'lucide-react'
import { usePermissions, VIEW_AS_KEY, getViewAs } from '@/lib/use-permissions'

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
  window.location.reload()
}

export function ViewAsSwitcher() {
  const { realRole, loading } = usePermissions()
  const [current, setCurrent] = useState<string>(() => getViewAs() ?? '')

  // Only the real admin can preview other roles
  if (loading || realRole !== 'admin') return null

  const previewing = current !== ''

  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${previewing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <Eye className={`h-3.5 w-3.5 ${previewing ? 'text-amber-600' : 'text-slate-400'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${previewing ? 'text-amber-700' : 'text-slate-500'}`}>View as</span>
      <select
        value={current}
        onChange={e => { setCurrent(e.target.value); setViewAs(e.target.value) }}
        className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer ${previewing ? 'text-amber-700' : 'text-slate-600'}`}
      >
        {PREVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
  )
}

// Full-width banner shown while previewing a non-admin role
export function ViewAsBanner() {
  const { realRole, previewing, role, loading } = usePermissions()

  if (loading || realRole !== 'admin' || !previewing) return null

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-500 px-4 py-1.5 text-white text-sm font-medium">
      <Eye className="h-4 w-4 shrink-0" />
      <span>
        Viewing as <strong>{roleLabel(role)}</strong> — this is a preview, not your real account.
      </span>
      <button
        onClick={() => setViewAs('')}
        className="inline-flex items-center gap-1 rounded-md bg-white/20 px-2 py-0.5 text-xs font-semibold hover:bg-white/30 transition-colors"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  )
}

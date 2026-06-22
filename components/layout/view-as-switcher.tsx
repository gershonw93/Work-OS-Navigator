'use client'

import { useState } from 'react'
import { Eye } from 'lucide-react'
import { usePermissions, VIEW_AS_KEY, getViewAs } from '@/lib/use-permissions'

const PREVIEW_ROLES = [
  { value: '', label: 'Admin (you)' },
  { value: 'project_manager', label: 'Project Manager' },
  { value: 'office_staff', label: 'Office Staff' },
  { value: 'field_supervisor', label: 'Field Supervisor' },
  { value: 'read_only', label: 'Field Worker' },
]

export function ViewAsSwitcher() {
  const { realRole, loading } = usePermissions()
  const [current, setCurrent] = useState<string>(() => getViewAs() ?? '')

  // Only the real admin can preview other roles
  if (loading || realRole !== 'admin') return null

  function change(value: string) {
    setCurrent(value)
    if (value) localStorage.setItem(VIEW_AS_KEY, value)
    else localStorage.removeItem(VIEW_AS_KEY)
    // Reload so sidebar, tabs, and scoped data all re-read the preview role
    window.location.reload()
  }

  const previewing = current !== ''

  return (
    <div className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${previewing ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
      <Eye className={`h-3.5 w-3.5 ${previewing ? 'text-amber-600' : 'text-slate-400'}`} />
      <span className={`text-xs font-medium hidden sm:inline ${previewing ? 'text-amber-700' : 'text-slate-500'}`}>View as</span>
      <select
        value={current}
        onChange={e => change(e.target.value)}
        className={`text-xs font-medium bg-transparent focus:outline-none cursor-pointer ${previewing ? 'text-amber-700' : 'text-slate-600'}`}
      >
        {PREVIEW_ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
    </div>
  )
}

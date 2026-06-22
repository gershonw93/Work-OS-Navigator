'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { can as canFn, type PermMap, type Action } from '@/lib/permissions'

export const VIEW_AS_KEY = 'workos_view_as_role'
export const VIEW_AS_USER_KEY = 'workos_view_as_user'

export function getViewAs(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(VIEW_AS_KEY)
}
export function getViewAsUser(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(VIEW_AS_USER_KEY)
}

interface PermState {
  role: string
  realRole: string
  previewing: boolean
  previewingUser: string | null
  permissions: PermMap | null
  loading: boolean
  can: (resource: string, action?: Action) => boolean
}

export function usePermissions(): PermState {
  const [role, setRole] = useState('')
  const [realRole, setRealRole] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewingUser, setPreviewingUser] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (active) setLoading(false); return }
      const viewAsUser = getViewAsUser()
      const viewAs = getViewAs()
      let url = '/api/me/permissions'
      if (viewAsUser) url += `?as_user=${encodeURIComponent(viewAsUser)}`
      else if (viewAs) url += `?as=${encodeURIComponent(viewAs)}`
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok && active) {
        const data = await res.json()
        setRole(data.role ?? '')
        setRealRole(data.realRole ?? data.role ?? '')
        setPreviewing(!!data.previewing)
        setPreviewingUser(data.previewingUser ?? null)
        setPermissions(data.permissions ?? null)
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [])

  return {
    role,
    realRole,
    previewing,
    previewingUser,
    permissions,
    loading,
    can: (resource: string, action: Action = 'view') => canFn(permissions, resource, action),
  }
}

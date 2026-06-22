'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { can as canFn, type PermMap, type Action } from '@/lib/permissions'

export const VIEW_AS_KEY = 'workos_view_as_role'

export function getViewAs(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(VIEW_AS_KEY)
}

interface PermState {
  role: string
  realRole: string
  previewing: boolean
  permissions: PermMap | null
  loading: boolean
  can: (resource: string, action?: Action) => boolean
}

export function usePermissions(): PermState {
  const [role, setRole] = useState('')
  const [realRole, setRealRole] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [permissions, setPermissions] = useState<PermMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (active) setLoading(false); return }
      const viewAs = getViewAs()
      const url = viewAs ? `/api/me/permissions?as=${encodeURIComponent(viewAs)}` : '/api/me/permissions'
      const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok && active) {
        const data = await res.json()
        setRole(data.role ?? '')
        setRealRole(data.realRole ?? data.role ?? '')
        setPreviewing(!!data.previewing)
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
    permissions,
    loading,
    can: (resource: string, action: Action = 'view') => canFn(permissions, resource, action),
  }
}

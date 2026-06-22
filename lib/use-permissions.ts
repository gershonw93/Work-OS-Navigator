'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { can as canFn, type PermMap, type Action } from '@/lib/permissions'

interface PermState {
  role: string
  permissions: PermMap | null
  loading: boolean
  can: (resource: string, action?: Action) => boolean
}

export function usePermissions(): PermState {
  const [role, setRole] = useState('')
  const [permissions, setPermissions] = useState<PermMap | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (active) setLoading(false); return }
      const res = await fetch('/api/me/permissions', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (res.ok && active) {
        const data = await res.json()
        setRole(data.role ?? '')
        setPermissions(data.permissions ?? null)
      }
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [])

  return {
    role,
    permissions,
    loading,
    can: (resource: string, action: Action = 'view') => canFn(permissions, resource, action),
  }
}

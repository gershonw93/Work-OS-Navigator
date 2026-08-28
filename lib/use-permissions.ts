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
  /**
   * Set when we asked and did not get an answer.
   *
   * Loading and failed used to be the same state - null permissions - and
   * every screen treated that as "you may do nothing". A failed permissions
   * call therefore rendered an app with no menu, no explanation and no way
   * back, forever. They are different facts and callers need to tell them
   * apart to say anything useful.
   */
  error: string | null
  /** Ask again, for the retry the failure state offers. */
  reload: () => void
  can: (resource: string, action?: Action) => boolean
}

export function usePermissions(): PermState {
  const [role, setRole] = useState('')
  const [realRole, setRealRole] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [previewingUser, setPreviewingUser] = useState<string | null>(null)
  const [permissions, setPermissions] = useState<PermMap | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let active = true
    ;(async () => {
      // Every exit from here has to land somewhere. This used to be able to
      // fall out with permissions null and loading false, which reads exactly
      // like "allowed to do nothing" and rendered an app with no menu.
      try {
        setError(null)
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        // No session is not a state to sit in. Send them to sign in rather
        // than leaving a shell nobody can use.
        if (!session) {
          if (active) { setLoading(false); window.location.href = '/login' }
          return
        }
        const viewAsUser = getViewAsUser()
        const viewAs = getViewAs()
        let url = '/api/me/permissions'
        if (viewAsUser) url += `?as_user=${encodeURIComponent(viewAsUser)}`
        else if (viewAs) url += `?as=${encodeURIComponent(viewAs)}`
        const res = await fetch(url, { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (!active) return
        if (!res.ok) {
          setError(`Could not load your permissions (${res.status})`)
          return
        }
        const data = await res.json()
        setRole(data.role ?? '')
        setRealRole(data.realRole ?? data.role ?? '')
        setPreviewing(!!data.previewing)
        setPreviewingUser(data.previewingUser ?? null)
        setPermissions(data.permissions ?? null)
      } catch (e: any) {
        if (active) setError(e?.message ?? 'Could not reach the server')
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [attempt])

  return {
    role,
    realRole,
    previewing,
    previewingUser,
    permissions,
    loading,
    error,
    reload: () => setAttempt(a => a + 1),
    can: (resource: string, action: Action = 'view') => canFn(permissions, resource, action),
  }
}

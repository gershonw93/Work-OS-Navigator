'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, X } from 'lucide-react'
import { getViewAs, VIEW_AS_KEY, VIEW_AS_USER_KEY } from '@/lib/use-permissions'
import { FIELD_ROLES } from '@/lib/permissions'

// "View as -> Field Worker" is a client-side preview (localStorage), but Field
// Mode lives on its own server-rendered shell. This gate bridges the two: while
// an admin is previewing a field role, it routes them into /field so they see
// the real thing, and the banner lets them jump back out.

export function FieldPreviewGate() {
  const router = useRouter()
  useEffect(() => {
    const as = getViewAs()
    if (as && FIELD_ROLES.includes(as)) router.replace('/field')
  }, [router])
  return null
}

export function FieldPreviewBanner() {
  const router = useRouter()
  const as = typeof window !== 'undefined' ? getViewAs() : null
  const previewing = !!as && FIELD_ROLES.includes(as)
  if (!previewing) return null

  function exit() {
    localStorage.removeItem(VIEW_AS_KEY)
    localStorage.removeItem(VIEW_AS_USER_KEY)
    router.replace('/dashboard')
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-warn-solid px-4 py-1.5 text-center text-sm font-medium text-white">
      <Eye className="h-4 w-4 shrink-0" />
      <span>Previewing <strong>Field Mode</strong> - this is what a field worker sees.</span>
      <button
        onClick={exit}
        className="inline-flex items-center gap-1 rounded-md bg-panel/20 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-panel/30"
      >
        <X className="h-3 w-3" /> Exit preview
      </button>
    </div>
  )
}

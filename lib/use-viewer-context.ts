'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

interface ViewerContext { companyType: string; owns: boolean; loading: boolean }

// How the current viewer relates to a project: their company type + whether
// they own it. Used to switch sub-specific views (e.g. quote-driven jobs).
export function useViewerContext(projectId: string): ViewerContext {
  const [ctx, setCtx] = useState<ViewerContext>({ companyType: '', owns: false, loading: true })
  useEffect(() => {
    let active = true
    ;(async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { if (active) setCtx(c => ({ ...c, loading: false })); return }
      const res = await fetch(`/api/projects/${projectId}/viewer-context`, { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok && active) { const d = await res.json(); setCtx({ companyType: d.companyType, owns: !!d.owns, loading: false }) }
      else if (active) setCtx(c => ({ ...c, loading: false }))
    })()
    return () => { active = false }
  }, [projectId])
  return ctx
}

'use client'

import { Lock } from 'lucide-react'
import { usePermissions } from '@/lib/use-permissions'
import { roleLabel } from '@/components/layout/view-as-switcher'

// A SCREEN ASKS ITS OWN PERMISSION BEFORE IT LOADS ANYTHING.
//
// Reported from "View as Worker": Service Calls showed live customer names,
// issues and times with a New call button, and Dispatch and Customers rendered
// the same way. A preview changes only what the BROWSER believes you may do -
// the requests still carry the admin's token (lib/use-permissions.ts) - so a
// page that never asks `can()` shows the admin's data under a banner saying it
// is somebody else's view. A REAL worker was always refused by the routes;
// what was wrong was the preview lying, and a button offered to a role that
// cannot press it. Master Money already asked; these now ask the same way.
//
// Four answers, not two: still checking, yes, no, and COULD NOT CHECK - a
// failed permissions read is not a "no" (CLAUDE.md, loading and failure
// states), and the session's PermissionsBanner already says why.

export type ScreenAccess = 'checking' | 'yes' | 'no' | 'failed'

export function useScreenAccess(resource: string) {
  const perms = usePermissions()
  const access: ScreenAccess = perms.loading ? 'checking'
    : perms.error ? 'failed'
    : perms.can(resource, 'view') ? 'yes' : 'no'
  return { access, perms }
}

/** What a screen renders instead of itself when the answer is not yes. */
export function ScreenAccessNotice({ access, what }: { access: Exclude<ScreenAccess, 'yes'>; what: string }) {
  const { previewing, role } = usePermissions()
  if (access === 'checking') return <p className="p-6 text-sm text-faint text-center py-12">Loading...</p>
  return (
    <div className="p-6">
      <div className="rounded-2xl border border-line bg-panel p-8 text-center space-y-2">
        <Lock className="h-7 w-7 text-faint mx-auto" aria-hidden />
        <p className="text-sm font-semibold text-ink">
          {access === 'failed'
            ? `Could not check whether you can open ${what}.`
            : previewing ? `${roleLabel(role)} cannot open ${what}.` : `Your role cannot open ${what}.`}
        </p>
        <p className="text-sm text-muted-fg">
          {access === 'failed'
            ? 'Reload the page to try again.'
            : previewing ? 'This is what they would see. Their permissions are under Settings, Permissions.' : 'Ask your company admin if you need it.'}
        </p>
      </div>
    </div>
  )
}

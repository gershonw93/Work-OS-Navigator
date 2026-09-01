'use client'

import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { RESOURCES } from '@/lib/permissions'
import { usePermissions } from '@/lib/use-permissions'

/**
 * A project tab you may not see says so, instead of showing you an empty one.
 *
 * THE BUG. A Field Supervisor has no budget permission, so the tab was hidden -
 * and pasting the URL opened the whole Budget screen anyway: total, committed,
 * actual, margin, Add Line, Share with Client. The guard was on the MENU, not
 * on the page. The routes have been closed too (that is the part that actually
 * protects the numbers), but a refused fetch on its own leaves the screen
 * sitting at its initial state - every figure $0, no lines - which reads as
 * "this job has no budget" rather than "you cannot see it". A wrong answer is
 * worse than a refusal.
 *
 * One wrapper rather than a check on each of a dozen pages, because a rule
 * repeated a dozen times is a rule that will be missing from the thirteenth.
 * The slug -> resource mapping is the one already in `RESOURCES`, so the tabs
 * that are hidden and the pages that are refused cannot disagree about which
 * permission a screen needs.
 *
 * NOT the security boundary - the API is. This decides what somebody is told.
 */
export function ProjectTabGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { can, loading, error } = usePermissions()

  // /projects/<id>/<slug>
  const slug = pathname.split('/')[3] ?? ''
  const resource = RESOURCES.find(r => r.slug === slug)?.key

  // A tab with no resource of its own (the overview, a job's units) is not
  // gated here - only screens the permission model actually names.
  if (!resource) return <>{children}</>

  // Never render the page while the answer is unknown. Checking after the fact
  // is how Master Money painted its admin layout for Office Staff.
  if (loading) {
    return <div className="py-16 text-center text-sm text-faint">Loading…</div>
  }

  // Loading and failed are different facts. A failed permissions call must not
  // read as "you are not allowed" - that would lock somebody out of their own
  // job over a bad minute on the network.
  if (error) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-ink-soft">Could not check your access.</p>
        <p className="mt-1 text-xs text-muted-fg">{error}</p>
      </div>
    )
  }

  if (!can(resource, 'view')) {
    return (
      <div className="py-16 text-center">
        <Lock className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-3 text-sm font-medium text-ink-soft">This tab is not part of your access</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-fg">
          Your role does not include it on this job. An admin can change that under
          Settings → Team &amp; Users.
        </p>
      </div>
    )
  }

  return <>{children}</>
}

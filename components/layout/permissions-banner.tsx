'use client'

import { ShieldAlert } from 'lucide-react'
import { usePermissions } from '@/lib/use-permissions'

/**
 * We could not find out what you are allowed to do.
 *
 * THE BUG, reported as "where do I upload files". Every screen asks
 * `can('plans', 'create')` and hides its buttons when the answer is false - and
 * a permissions check that FAILED answers false, for ever, exactly like being
 * denied. Seven screens take `can` out of the hook and leave `error` behind, so
 * a bad minute of signal on site takes the Upload button away and there is
 * nothing anywhere to say so or to try again.
 *
 * One banner rather than seven inline messages: the fact is about the session,
 * not about the page you happen to be on, and it belongs beside the other two
 * that say the same class of thing.
 */
export function PermissionsBanner() {
  const { error, reload } = usePermissions()
  if (!error) return null

  return (
    <div className="flex items-center gap-3 bg-danger-solid px-4 py-1.5 text-sm font-medium text-white sm:px-6">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        We could not check what you are allowed to do, so some buttons are hidden.
      </span>
      <button
        onClick={reload}
        className="shrink-0 rounded-md bg-panel/20 px-2 py-0.5 text-xs font-semibold transition-colors hover:bg-panel/30"
      >
        Try again
      </button>
    </div>
  )
}

import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { currentProfile } from '@/lib/supabase/current-user'
import { FieldPreviewGate } from '@/components/layout/field-preview'
import { FIELD_ROLES } from '@/lib/permissions'

/**
 * WHERE A FIELD WORKER LANDS - and nothing more than that.
 *
 * A worker's home is Field Mode, so the office home sends them there. This
 * used to be written one level up, in (dashboard)/layout.tsx, where it wrapped
 * EVERY office screen and turned a landing rule into a wall: six resources the
 * permission grid grants Field Worker `view` on - Plans, Projects, Files,
 * Equipment, Materials, Approvals - had no reachable surface at all, because
 * the door to each of them bounced.
 *
 * SCOPED TO THIS ROUTE ON PURPOSE. /dashboard is the funnel: middleware sends
 * a signed-in `/` here, and the password reset lands here too, so this is the
 * one place the rule has to hold for a worker to end up in the right shell.
 * Everywhere else, the permission is the answer - ProjectTabGuard, the nav
 * filters and requirePermission were all already doing that job correctly and
 * were simply never reached.
 *
 * A worker who follows a link into the office app is not trapped there: the
 * nav's first entry reads "Field Mode" for them and points at /field.
 *
 * It is a LAYOUT rather than a check inside the page because the page is a
 * client component - a redirect belongs on the server, before any of it is
 * sent, not in a useEffect that paints the office dashboard first.
 */
export default async function DashboardHomeLayout({ children }: { children: ReactNode }) {
  const profile = await currentProfile()
  if (profile?.role && FIELD_ROLES.includes(profile.role)) {
    redirect('/field')
  }

  return (
    <>
      {/* "View as -> Field Worker" is a client-side preview, so it cannot be
          part of the server check above. It sits here rather than on the whole
          office app for the same reason the real rule does: an admin
          previewing a field role should see what a worker sees, and what a
          worker sees is Field Mode as HOME, not as a cage. */}
      <FieldPreviewGate />
      {children}
    </>
  )
}

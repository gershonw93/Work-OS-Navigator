import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { currentAuth } from '@/lib/supabase/current-user'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { MobileTabBar } from '@/components/layout/mobile-tab-bar'
import { ViewAsBanner } from '@/components/layout/view-as-switcher'
import { PermissionsBanner } from '@/components/layout/permissions-banner'
import { ImpersonationBanner } from '@/components/layout/impersonate-switcher'
import { IdleLogout } from '@/components/layout/idle-logout'
import { NativeShell } from '@/components/layout/native-shell'
import { AuthUnavailable } from '@/components/layout/auth-unavailable'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Resolved once per request and shared with the project layout nested inside
  // this one, which needs the same two answers. Asking separately meant every
  // project page validated the token against the auth server twice.
  // THREE ANSWERS, NOT TWO. `if (!user) redirect('/login')` cannot tell nobody
  // being signed in from the auth gateway refusing to answer, and it sent both
  // to the login screen - so somebody who had just signed in successfully was
  // told to sign in, and did, and was told again. See lib/auth-outcome.ts.
  const { outcome, user } = await currentAuth()
  if (outcome === 'signed-out') {
    redirect('/login')
  }
  if (!user) {
    // 'unknown': we could not ask, twice. Say that, rather than showing a
    // login form to somebody whose session is fine.
    return <AuthUnavailable />
  }

  // NO ROLE REDIRECT HERE, AND THAT IS THE FIX.
  //
  // This layout used to bounce every field role to /field, from every screen
  // under it. Field Mode is where a worker LANDS; it is not the limit of where
  // they may go, and writing the landing rule here made it both. Role Defaults
  // gave Field Worker `view` on Plans, Projects, Files, Equipment, Materials
  // and Approvals, and all six were unreachable - nine routes, every one of
  // them bouncing. AN ENABLED PERMISSION THAT PRODUCES NO REACHABLE SURFACE IS
  // FALSE CONFIGURATION: the checkbox is in the grid, a company ticks it, and
  // nothing happens.
  //
  // It was also a ROLE check standing on top of PERMISSION checks that already
  // do this properly, one level down and per screen:
  //   - ProjectTabGuard refuses a project tab the role does not hold and SAYS
  //     so, rather than showing an empty one;
  //   - Sidebar and MobileTabBar filter their destinations through the same
  //     can();
  //   - every route under /api/ gates on requirePermission.
  // So the office app already degrades correctly for a narrow role - it is
  // what a Field Supervisor has always seen. The redirect was the only thing
  // stopping a worker from getting the same treatment.
  //
  // The landing rule now lives on the office HOME, where it belongs and where
  // it can be true without being a wall: app/(dashboard)/dashboard/layout.tsx.

  return (
    <>
      <IdleLogout />
      <NativeShell />
      {/* An app shell, not a document: exactly one screen tall, and the only
          thing inside it that scrolls is <main>. It used to be `min-h-screen`,
          which let the page itself grow and carried the top bar away with it.
          Print undoes all of it - a paged document has no viewport height. */}
      <div className="app-shell flex h-app overflow-hidden bg-surface print:h-auto print:block print:overflow-visible">
        {/* App chrome is hidden when printing so print/PDF pages (proposals,
            invoices, pay apps) render clean, without the sidebar/nav/tabs. */}
        <div className="print:hidden">
          <Sidebar />
        </div>
        {/* THE RAIL'S WIDTH IS NOT WRITTEN HERE. It used to be - `lg:pl-60`
            beside a `w-60` on the aside - two halves of one number in two
            files, which is exactly the arrangement that cannot survive the
            sidebar being able to collapse. `.app-content` and `.app-sidebar`
            both read `--sidebar-w` off `.app-shell` above, so there is one
            measurement and the content is always flush against the rail.
            This layout is a Server Component, so a React state could not
            reach it in any case. See app/globals.css. */}
        <div className="app-content flex flex-1 flex-col min-w-0 min-h-0 print:pl-0">
          {/* THE ONE PLACE THE TOP INSET IS APPLIED.
              pt-safe here rather than on <header>: the header is h-14 and
              Tailwind sizes with border-box, so padding there comes OUT of the
              56px row and squashes the search bar instead of moving it down.
              bg-panel so the strip above it matches the header rather than
              showing the surface behind.
              shrink-0: without it the whole chrome is a flex item that will
              happily be squashed to nothing by a tall child. */}
          <div className="shrink-0 pt-safe bg-panel print:hidden">
            <ImpersonationBanner />
            <ViewAsBanner />
            <PermissionsBanner />
            <TopNav />
          </div>
          <main
            data-app-scroll
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain print:overflow-visible px-safe pb-tab-bar"
          >
            {children}
          </main>
        </div>
        {/* Phone only. The shell is a webview of this same site, so what the
            site does on a phone is what the app does - and a hamburger as the
            only way to navigate is what Apple's rule 4.2 is really about. */}
        <div className="print:hidden">
          <MobileTabBar />
        </div>
      </div>
    </>
  )
}

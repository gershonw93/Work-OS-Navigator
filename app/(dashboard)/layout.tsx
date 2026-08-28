import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { currentUser, currentProfile } from '@/lib/supabase/current-user'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { ViewAsBanner } from '@/components/layout/view-as-switcher'
import { ImpersonationBanner } from '@/components/layout/impersonate-switcher'
import { DeleteGuardProvider } from '@/components/ui/delete-guard'
import { IdleLogout } from '@/components/layout/idle-logout'
import { FieldPreviewGate } from '@/components/layout/field-preview'
import { FIELD_ROLES } from '@/lib/permissions'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Resolved once per request and shared with the project layout nested inside
  // this one, which needs the same two answers. Asking separately meant every
  // project page validated the token against the auth server twice.
  const user = await currentUser()
  if (!user) {
    redirect('/login')
  }

  // Field workers get the dedicated Field Mode shell, not the office app.
  const profile = await currentProfile()
  if (profile?.role && FIELD_ROLES.includes(profile.role)) {
    redirect('/field')
  }

  return (
    <DeleteGuardProvider>
      <IdleLogout />
      <FieldPreviewGate />
      <div className="flex min-h-screen bg-surface">
        {/* App chrome is hidden when printing so print/PDF pages (proposals,
            invoices, pay apps) render clean, without the sidebar/nav/tabs. */}
        <div className="print:hidden">
          <Sidebar />
        </div>
        <div className="flex flex-1 flex-col min-w-0 lg:pl-60 print:pl-0">
          <div className="print:hidden">
            <ImpersonationBanner />
            <ViewAsBanner />
            <TopNav />
          </div>
          <main className="flex-1 overflow-y-auto overflow-x-hidden print:overflow-visible">
            {children}
          </main>
        </div>
      </div>
    </DeleteGuardProvider>
  )
}

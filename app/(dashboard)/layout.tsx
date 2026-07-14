import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { ViewAsBanner } from '@/components/layout/view-as-switcher'
import { ImpersonationBanner } from '@/components/layout/impersonate-switcher'
import { DeleteGuardProvider } from '@/components/ui/delete-guard'
import { IdleLogout } from '@/components/layout/idle-logout'
import { FIELD_ROLES } from '@/lib/permissions'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Field workers get the dedicated Field Mode shell, not the office app.
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile && FIELD_ROLES.includes((profile as any).role)) {
    redirect('/field')
  }

  return (
    <DeleteGuardProvider>
      <IdleLogout />
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 lg:pl-60">
          <ImpersonationBanner />
          <ViewAsBanner />
          <TopNav />
          <main className="flex-1 overflow-y-auto overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </DeleteGuardProvider>
  )
}

import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/sidebar'
import { TopNav } from '@/components/layout/top-nav'
import { ViewAsBanner } from '@/components/layout/view-as-switcher'
import { ImpersonationBanner } from '@/components/layout/impersonate-switcher'
import { DeleteGuardProvider } from '@/components/ui/delete-guard'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <DeleteGuardProvider>
      <div className="flex min-h-screen bg-surface">
        <Sidebar />
        <div className="flex flex-1 flex-col min-w-0 sm:pl-60">
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

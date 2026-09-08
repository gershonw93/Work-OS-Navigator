import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FIELD_ROLES } from '@/lib/permissions'
import { IdleLogout } from '@/components/layout/idle-logout'
import { NativeShell } from '@/components/layout/native-shell'
import { FieldPreviewBanner } from '@/components/layout/field-preview'
import { FieldNav } from './field-nav'

// Admins/managers may enter Field Mode to preview it (via "View as").
const PREVIEW_ROLES = ['admin', 'manager']

// Field Mode: a dedicated, stripped mobile shell for field workers. No sidebar,
// no project tabs, no company money. Just today's work. Office roles that land
// here are bounced back to the full app.
export default async function FieldLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  const role = (profile as any)?.role
  if (!profile || (!FIELD_ROLES.includes(role) && !PREVIEW_ROLES.includes(role))) {
    redirect('/dashboard')
  }

  return (
    // Same app shell as the office app: one screen tall, and the only scroller
    // is <main>. `min-h-screen` let the document grow, which is what carried
    // the chrome off the top of the screen.
    <div className="h-app overflow-hidden bg-surface text-ink flex flex-col print:h-auto print:block print:overflow-visible">
      <IdleLogout />
      <NativeShell />
      {/* Field Mode has no header of its own, so the top inset goes on the
          shell. Same rule as the office app: exactly one element pads this
          edge, and it is this one. */}
      <div className="shrink-0 pt-safe bg-surface"><FieldPreviewBanner /></div>
      <main
        data-app-scroll
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain pb-field-nav px-safe"
      >
        {children}
      </main>
      <FieldNav />
    </div>
  )
}

import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { FIELD_ROLES } from '@/lib/permissions'
import { IdleLogout } from '@/components/layout/idle-logout'
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
    <div className="min-h-screen bg-surface text-ink flex flex-col">
      <IdleLogout />
      <FieldPreviewBanner />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <FieldNav />
    </div>
  )
}

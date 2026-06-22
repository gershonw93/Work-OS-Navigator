import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { ADMIN_GATE_COOKIE, verifyGate } from '@/lib/admin-gate'
import { AdminNav } from '@/components/admin/admin-nav'
import { AdminPinGate } from '@/components/admin/admin-pin-gate'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!isSuperAdmin(user.email)) redirect('/dashboard')

  const gateOk = verifyGate(user.id, cookies().get(ADMIN_GATE_COOKIE)?.value)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-800 bg-slate-900 px-4 sm:px-6 py-3">
        <div className="mx-auto max-w-6xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold text-white">ADMIN</span>
            <h1 className="text-sm font-semibold text-white">Platform Console</h1>
          </div>
          <a href="/dashboard" className="text-xs font-medium text-slate-300 hover:text-white">← Back to app</a>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6">
        {gateOk ? (
          <>
            <AdminNav />
            <div className="mt-6">{children}</div>
          </>
        ) : (
          <AdminPinGate />
        )}
      </div>
    </div>
  )
}

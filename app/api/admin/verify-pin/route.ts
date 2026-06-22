import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { ADMIN_GATE_COOKIE, signGate } from '@/lib/admin-gate'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/admin/verify-pin { pin }
// Super-admin only. On a correct PIN, sets a signed httpOnly cookie that unlocks /admin.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const configured = process.env.ADMIN_PIN
  if (!configured) {
    return NextResponse.json({ error: 'ADMIN_PIN is not configured on the server.' }, { status: 500 })
  }

  const { pin } = await request.json()
  if (!pin || String(pin) !== String(configured)) {
    return NextResponse.json({ error: 'Incorrect code.' }, { status: 403 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_GATE_COOKIE, signGate(user.id), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })
  return res
}

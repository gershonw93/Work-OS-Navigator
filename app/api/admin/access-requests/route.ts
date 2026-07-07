import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isSuperAdmin } from '@/lib/super-admin'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function requireSuperAdmin(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  if (!user || !isSuperAdmin(user.email)) return null
  return user
}

export async function GET(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { data } = await admin().from('access_requests').select('*').order('created_at', { ascending: false })
  return NextResponse.json({ requests: data ?? [] })
}

// PATCH { id, action: 'approve' | 'reject' | 'reset' }
export async function PATCH(request: Request) {
  if (!(await requireSuperAdmin(request))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id, action } = await request.json()
  if (!id || !['approve', 'reject', 'reset'].includes(action)) {
    return NextResponse.json({ error: 'id and a valid action are required' }, { status: 400 })
  }
  const db = admin()
  const updates: Record<string, unknown> =
    action === 'approve'
      ? { status: 'approved', invite_token: randomUUID().replace(/-/g, ''), reviewed_at: new Date().toISOString() }
      : action === 'reject'
      ? { status: 'rejected', invite_token: null, reviewed_at: new Date().toISOString() }
      : { status: 'pending', invite_token: null, reviewed_at: null }

  const { data, error } = await db.from('access_requests').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

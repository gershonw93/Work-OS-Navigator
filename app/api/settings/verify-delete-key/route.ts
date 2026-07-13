import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { hashKey } from '@/lib/delete-key'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Verify the company's secret delete key. Returns { ok } - ok is also true when
// protection is disabled (nothing to verify against).
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { key } = await request.json().catch(() => ({ key: '' }))

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ ok: true })

  const { data: company } = await db
    .from('companies')
    .select('delete_protection_enabled, delete_key_hash')
    .eq('id', profile.company_id)
    .single()

  // Protection off, or no key configured → nothing to check.
  if (!company?.delete_protection_enabled || !company.delete_key_hash) return NextResponse.json({ ok: true })

  const ok = typeof key === 'string' && key.trim().length > 0 && hashKey(key) === company.delete_key_hash
  return NextResponse.json({ ok })
}

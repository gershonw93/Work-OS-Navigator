import { NextResponse } from 'next/server'
import { admin, googleConfigured } from '@/lib/google-contacts'

export const runtime = 'nodejs'

// Is this company connected, and to which Google account. "Not connected" is a
// normal answer, not an error.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { data: row } = await db
    .from('google_connections')
    .select('google_email, status, connected_at, last_sync_at')
    .eq('company_id', profile.company_id).maybeSingle()

  const { count } = await db
    .from('google_contact_imports')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', profile.company_id).eq('status', 'staged')

  return NextResponse.json({
    // The two are different facts: the server has no credentials at all, vs
    // this company has not linked an account. The screen says different things.
    configured: googleConfigured(),
    connected: !!row && (row as any).status !== 'revoked',
    status: (row as any)?.status ?? null,
    googleEmail: (row as any)?.google_email ?? null,
    connectedAt: (row as any)?.connected_at ?? null,
    lastSyncAt: (row as any)?.last_sync_at ?? null,
    staged: count ?? 0,
  })
}

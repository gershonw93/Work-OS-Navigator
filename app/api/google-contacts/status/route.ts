import { NextResponse } from 'next/server'
import { googleConfigured } from '@/lib/google-contacts'
import { contactsActor } from '@/lib/google-contacts-actor'

export const runtime = 'nodejs'

// Are YOU connected, and to which Google account. "Not connected" is a normal
// answer, not an error. Per person (migration 117): a colleague's connection
// is not yours and says nothing about yours.
export async function GET(request: Request) {
  const ctx = await contactsActor(request, 'view')
  if ('denied' in ctx) return ctx.denied

  const [{ data: row }, { count }] = await Promise.all([
    ctx.db
      .from('google_connections')
      .select('google_email, status, connected_at, last_sync_at')
      .eq('profile_id', ctx.userId).maybeSingle(),
    ctx.db
      .from('google_contact_imports')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', ctx.userId).eq('status', 'staged'),
  ])

  return NextResponse.json({
    // The two are different facts: the server has no credentials at all, vs
    // this person has not linked an account. The screen says different things.
    configured: googleConfigured(),
    connected: !!row && (row as any).status !== 'revoked',
    status: (row as any)?.status ?? null,
    googleEmail: (row as any)?.google_email ?? null,
    connectedAt: (row as any)?.connected_at ?? null,
    lastSyncAt: (row as any)?.last_sync_at ?? null,
    staged: count ?? 0,
  })
}

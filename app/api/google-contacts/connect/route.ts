import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { admin, authorizeUrl, googleConfigured, redirectUri } from '@/lib/google-contacts'

export const runtime = 'nodejs'

// Start the handshake: mint a state row (CSRF + which company) and hand back
// the Google authorize URL for the browser to open.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!googleConfigured()) {
    // A NORMAL STATE, not a crash: the server has no Google credentials yet.
    // Said plainly, because the person reading it can do something about it.
    return NextResponse.json(
      { error: 'Google is not set up on the server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and redeploy.' },
      { status: 503 },
    )
  }

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  // Connecting an address book to the company is an owner-level act, the same
  // as connecting QuickBooks.
  if (!['admin', 'manager'].includes((profile as any).role)) {
    return NextResponse.json({ error: 'Only an admin can connect Google Contacts.' }, { status: 403 })
  }

  const state = randomUUID()
  await db.from('google_oauth_states').insert({
    state, company_id: profile.company_id, created_by: user.id,
  })

  return NextResponse.json({ url: authorizeUrl(state, request), redirectUri: redirectUri(request) })
}

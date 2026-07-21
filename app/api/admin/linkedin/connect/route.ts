import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isSuperAdmin } from '@/lib/super-admin'
import { admin, authorizeUrl, linkedinConfigured, redirectUri } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Start the OAuth handshake: mint a state row (CSRF anchor) and hand back the
// LinkedIn authorize URL for the browser to open. Owner (super admin) only.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!linkedinConfigured()) {
    return NextResponse.json({ error: 'LinkedIn is not configured on the server yet.' }, { status: 503 })
  }

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const state = randomUUID()
  await db.from('linkedin_oauth_states').insert({ state, created_by: user.id })

  return NextResponse.json({ url: authorizeUrl(state, request), redirectUri: redirectUri(request) })
}

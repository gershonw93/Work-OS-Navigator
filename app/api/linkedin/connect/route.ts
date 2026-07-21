import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { admin, authorizeUrl, linkedinConfigured, redirectUri } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Start the OAuth handshake: mint a state row (CSRF + which company) and hand
// back the LinkedIn authorize URL for the browser to open.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!linkedinConfigured()) {
    return NextResponse.json({ error: 'LinkedIn is not configured on the server yet.' }, { status: 503 })
  }

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only an admin can connect LinkedIn.' }, { status: 403 })
  }

  const state = randomUUID()
  await db.from('linkedin_oauth_states').insert({
    state, company_id: profile.company_id, created_by: user.id,
  })

  return NextResponse.json({ url: authorizeUrl(state, request), redirectUri: redirectUri(request) })
}

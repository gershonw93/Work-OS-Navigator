import { NextResponse } from 'next/server'
import { admin } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Forget the connection (tokens + page). Post history stays; scheduled posts
// will fail with a "reconnect" error if they come due while disconnected.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only an admin can disconnect LinkedIn.' }, { status: 403 })
  }

  await db.from('linkedin_connections').delete().eq('company_id', profile.company_id)
  return NextResponse.json({ ok: true })
}

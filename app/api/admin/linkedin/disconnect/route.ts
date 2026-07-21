import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { admin, CONNECTION_ID } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Forget the connection (tokens + page). Post history stays; scheduled posts
// will fail with a "reconnect" error if they come due while disconnected.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await db.from('linkedin_connection').delete().eq('id', CONNECTION_ID)
  return NextResponse.json({ ok: true })
}

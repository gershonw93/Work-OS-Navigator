import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { admin, linkedinConfigured, CONNECTION_ID } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Connection status for the admin console (never returns tokens). Owner only.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isSuperAdmin(user.email)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: conn } = await db.from('linkedin_connection')
    .select('org_urn, org_name, status, connected_at, access_expires_at, refresh_token')
    .eq('id', CONNECTION_ID).maybeSingle()

  return NextResponse.json({
    configured: linkedinConfigured(),
    connection: conn ? {
      org_urn: conn.org_urn,
      org_name: conn.org_name,
      status: conn.status,
      connected_at: conn.connected_at,
      access_expires_at: conn.access_expires_at,
      auto_refresh: !!conn.refresh_token,
    } : null,
  })
}

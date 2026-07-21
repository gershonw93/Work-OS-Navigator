import { NextResponse } from 'next/server'
import { admin, linkedinConfigured } from '@/lib/linkedin'

export const runtime = 'nodejs'

// Connection status for the Settings card (never returns tokens).
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { data: conn } = await db.from('linkedin_connections')
    .select('org_urn, org_name, status, connected_at, access_expires_at, refresh_token')
    .eq('company_id', profile.company_id).maybeSingle()

  return NextResponse.json({
    configured: linkedinConfigured(),
    canManage: ['admin', 'manager'].includes(profile.role),
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

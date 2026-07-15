import { NextResponse } from 'next/server'
import { admin, qboConfigured, QBO_ENV } from '@/lib/quickbooks'

export const runtime = 'nodejs'

// Connection status for the Settings card + recent sync activity.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const { data: conn } = await db.from('quickbooks_connections')
    .select('realm_id, qbo_company_name, environment, status, connected_at')
    .eq('company_id', profile.company_id).maybeSingle()

  const { data: log } = await db.from('quickbooks_sync_log')
    .select('entity_type, entity_id, action, status, qbo_id, message, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(20)

  return NextResponse.json({
    configured: qboConfigured(),
    environment: QBO_ENV,
    canManage: ['admin', 'manager'].includes(profile.role),
    connection: conn ?? null,
    log: log ?? [],
  })
}

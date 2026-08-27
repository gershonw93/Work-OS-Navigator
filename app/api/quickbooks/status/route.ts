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

  // What is NOT in QuickBooks yet. Payments and approved bills push
  // themselves now, so a growing backlog here means pushes are failing (or the
  // records predate auto-push) - either way, worth a number on the card
  // instead of silence.
  const { data: projects } = await db.from('projects').select('id')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
  const projectIds = (projects ?? []).map((p: any) => p.id)

  let unsyncedPayments = 0
  let unsyncedBills = 0
  let unsyncedClientInvoices = 0
  if (projectIds.length) {
    const [pay, bills, clientInv] = await Promise.all([
      db.from('client_payments').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).is('qbo_id', null),
      db.from('invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['approved', 'paid']).is('qbo_id', null),
      db.from('client_invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['sent', 'paid']).is('qbo_id', null),
    ])
    unsyncedPayments = pay.count ?? 0
    unsyncedBills = bills.count ?? 0
    unsyncedClientInvoices = clientInv.count ?? 0
  }

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
    unsyncedPayments,
    unsyncedBills,
    unsyncedClientInvoices,
    lastSyncAt: (log ?? [])[0]?.created_at ?? null,
    log: log ?? [],
  })
}

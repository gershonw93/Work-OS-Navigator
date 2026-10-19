import { NextResponse } from 'next/server'
import { admin, qboConfigured, QBO_ENV } from '@/lib/quickbooks'

import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'

// Connection status for the Settings card + recent sync activity.
export async function GET(request: Request) {
  const db = admin()
  // The card is on the Integrations tab (settings_company: view). What it
  // returns - the sync log's messages, how many bills and payments are stuck -
  // is the company's books, and this answered any account signed in.
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return gate.denied
  const profile = { company_id: gate.actor.companyId }
  if (!profile.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

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
  let unsentVoids = 0
  if (projectIds.length) {
    const [pay, bills, clientInv, voids, billPayVoids] = await Promise.all([
      // Not "unsynced" if somebody entered it in QuickBooks themselves -
      // reporting those as waiting would nag forever about work already done.
      db.from('client_payments').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).is('qbo_id', null)
        .or('qb_entered.is.null,qb_entered.eq.false'),
      db.from('invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['approved', 'paid']).is('qbo_id', null),
      db.from('client_invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['sent', 'paid']).is('qbo_id', null),
      // Voided here, still open over there. This backlog did not exist, so the
      // card said "Everything is in QuickBooks" over an unfixed receivable.
      db.from('client_invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).eq('status', 'void')
        .not('qbo_id', 'is', null).is('qbo_voided_at', null),
      // A sub bill moved back to unpaid whose BillPayment QuickBooks has not
      // voided - money still "paid out" there. Same retry, same count.
      db.from('invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).neq('status', 'paid').not('qbo_payment_id', 'is', null),
    ])
    unsyncedPayments = pay.count ?? 0
    unsyncedBills = bills.count ?? 0
    unsyncedClientInvoices = clientInv.count ?? 0
    unsentVoids = (voids.count ?? 0) + (billPayVoids.count ?? 0)
  }

  const { data: log } = await db.from('quickbooks_sync_log')
    .select('entity_type, entity_id, record_label, action, status, qbo_id, message, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    configured: qboConfigured(),
    environment: QBO_ENV,
    // The SAME predicate connect, disconnect and sync ask, so a button the
    // card shows is one the route will honour.
    canManage: mayManageCompanySetting(gate.actor),
    connection: conn ?? null,
    unsyncedPayments,
    unsyncedBills,
    unsyncedClientInvoices,
    unsentVoids,
    lastSyncAt: (log ?? [])[0]?.created_at ?? null,
    log: log ?? [],
  })
}

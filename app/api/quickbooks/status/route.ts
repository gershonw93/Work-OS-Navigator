import { NextResponse } from 'next/server'
import { admin, connectionUnusable, qboConfigProblem, qboConfigured, QBO_ENV, redirectUri } from '@/lib/quickbooks'
import { isResolved, retryFor } from '@/lib/qbo-log-retry'

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

  const [{ data: row }, { data: co }] = await Promise.all([
    db.from('quickbooks_connections')
      .select('realm_id, qbo_company_name, environment, status, connected_at, last_refreshed_at, last_refresh_error')
      .eq('company_id', profile.company_id).maybeSingle(),
    db.from('companies').select('qbo_realm_id, qbo_environment, qbo_sync_from').eq('id', profile.company_id).maybeSingle(),
  ])
  // THE CARD SAYS WHAT THE PUSH WILL DO. A row whose environment is not this
  // deploy's, or whose sign-in Intuit has refused, is never used by a push -
  // so the card must not wear "Connected" over it. `connected` here means the
  // next push can run.
  const unusable = row ? connectionUnusable(row) : null
  const conn = row ? { ...row, status: unusable ?? row.status } : null
  const boundFile = (co as any)?.qbo_realm_id
    ? { realm_id: (co as any).qbo_realm_id, environment: (co as any).qbo_environment ?? 'sandbox' }
    : null
  // Ids pushed to a file in the OTHER environment - the sandbox, once this
  // deploy runs production keys. Reconnecting that file is impossible from
  // here, so the card offers Start fresh instead of a Connect that the
  // callback would refuse.
  const boundElsewhere = !!boundFile && boundFile.environment !== QBO_ENV
  const syncFrom: string | null = (co as any)?.qbo_sync_from ?? null

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
        .gte('created_at', syncFrom ?? '1970-01-01')
        .or('qb_entered.is.null,qb_entered.eq.false'),
      db.from('invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['approved', 'paid']).is('qbo_id', null)
        .gte('created_at', syncFrom ?? '1970-01-01'),
      db.from('client_invoices').select('id', { count: 'exact', head: true })
        .in('project_id', projectIds).in('status', ['sent', 'paid']).is('qbo_id', null)
        .gte('created_at', syncFrom ?? '1970-01-01'),
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

  const { data: rawLog } = await db.from('quickbooks_sync_log')
    .select('entity_type, entity_id, record_label, action, status, qbo_id, message, created_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })
    .limit(50)
  // Every failure carries its way out, and one a later success put right is
  // marked so - the card lists what still needs attention, not history.
  const log = (rawLog ?? []).map((l: any) => ({
    ...l,
    resolved: isResolved(l, rawLog ?? []),
    retry: isResolved(l, rawLog ?? []) ? null : retryFor(l),
  }))

  return NextResponse.json({
    configured: qboConfigured(),
    configProblem: qboConfigProblem(),
    // The exact value Intuit must have registered for this deploy - printed on
    // the card rather than worked out by hand, because a redirect URI that is
    // one character off fails the connect with Intuit's least helpful page.
    redirectUri: redirectUri(request),
    boundFile,
    boundElsewhere,
    syncFrom,
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
    log,
  })
}

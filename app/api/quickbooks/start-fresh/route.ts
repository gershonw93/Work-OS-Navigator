import { NextResponse } from 'next/server'
import { admin, revokeToken } from '@/lib/quickbooks'
import { openToken } from '@/lib/qbo-token-crypto'
import { QBO_ID_COLUMNS } from '@/lib/qbo-realm'
import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// Start fresh with a different QuickBooks file.
//
// The account's QuickBooks ids belong to one file (lib/qbo-realm.ts), and a
// connection to a different one is refused while they stand. This is the
// deliberate way past that - moving from the sandbox to the real company, or a
// customer changing books. It:
//   1. archives every qbo id the company holds (quickbooks_id_archive), so
//      "which record was this over there" still has an answer,
//   2. clears them, so the new file is pushed to rather than skipped,
//   3. sets qbo_sync_from to now - the backlog sync then leaves older money
//      alone, so the new file is not flooded with history it already has (or
//      that only ever existed in a sandbox),
//   4. revokes and deletes the current connection.
// Admin only, and the card asks first with the counts.
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!mayManageCompanySetting(gate.actor)) {
    return NextResponse.json({ error: 'Only an admin can change the QuickBooks file.' }, { status: 403 })
  }
  const body = await request.json().catch(() => ({}))
  if (body.confirm !== true) return NextResponse.json({ error: 'Confirm to start fresh.' }, { status: 400 })

  const { data: co } = await db.from('companies').select('qbo_realm_id, qbo_environment').eq('id', companyId).maybeSingle()
  const { data: projects, error: pErr } = await db.from('projects').select('id')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
  if (pErr) return NextResponse.json({ error: 'Could not read your jobs. Nothing was changed.' }, { status: 503 })
  const projectIds = (projects ?? []).map((p: any) => p.id)

  let archived = 0
  for (const t of QBO_ID_COLUMNS) {
    const scope = t.table === 'customers' ? { col: 'gc_company_id', vals: [companyId] }
      : t.table === 'client_payment_groups' ? { col: 'development_id', vals: projectIds }
      : { col: 'project_id', vals: projectIds }
    if (!scope.vals.length) continue
    const notNull = t.ids.map(c => `${c}.not.is.null`).join(',')
    const { data: rows, error } = await db.from(t.table).select(['id', ...t.ids].join(', '))
      .in(scope.col, scope.vals).or(notNull)
    // A read that did not complete is not "nothing to clear" - stop before
    // clearing half of them and archiving the other half nowhere.
    if (error) {
      console.error('[quickbooks/start-fresh] read', t.table, error.message)
      return NextResponse.json({ error: `Could not read ${t.table}. Nothing more was changed; try again.`, archived }, { status: 503 })
    }
    for (const r of (rows ?? []) as any[]) {
      const qbo_ids = Object.fromEntries(t.ids.filter(c => r[c] != null).map(c => [c, r[c]]))
      const { error: aErr } = await db.from('quickbooks_id_archive').insert({
        company_id: companyId, realm_id: (co as any)?.qbo_realm_id ?? null, environment: (co as any)?.qbo_environment ?? null,
        entity_table: t.table, entity_id: r.id, qbo_ids, archived_by: gate.actor.userId,
      })
      if (aErr) {
        console.error('[quickbooks/start-fresh] archive', aErr.message)
        return NextResponse.json({ error: 'Could not keep a copy of the old QuickBooks ids, so they were not cleared. Try again.', archived }, { status: 503 })
      }
      await db.from(t.table).update(t.clear).eq('id', r.id)
      archived++
    }
  }

  const { data: conn } = await db.from('quickbooks_connections').select('refresh_token').eq('company_id', companyId).maybeSingle()
  if (conn?.refresh_token) { try { await revokeToken(openToken(conn.refresh_token)) } catch { /* the row goes either way */ } }
  await db.from('quickbooks_connections').delete().eq('company_id', companyId)
  await db.from('companies').update({ qbo_realm_id: null, qbo_environment: null, qbo_sync_from: new Date().toISOString() }).eq('id', companyId)
  await db.from('quickbooks_sync_log').insert({
    company_id: companyId, entity_type: 'connection', action: 'update', status: 'success',
    qbo_id: (co as any)?.qbo_realm_id ?? null,
    message: `Started fresh: ${archived} record${archived === 1 ? '' : 's'} unlinked from the old QuickBooks file and archived. Only money recorded from now on is pushed by Sync.`,
  })
  return NextResponse.json({ ok: true, archived })
}

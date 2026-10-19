import { NextResponse } from 'next/server'
import { admin, revokeToken } from '@/lib/quickbooks'
import { openToken } from '@/lib/qbo-token-crypto'
import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'

// Forget the connection (tokens + realm). Leaves qbo_id mappings in place so a
// later reconnect to the same file still recognizes already-synced records.
export async function POST(request: Request) {
  const db = admin()
  // The Integrations tab (settings_company: view), and then the narrower
  // question the QuickBooks card already asks through `canManage`. Always the
  // caller's OWN company's connection - the id comes off the actor.
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })
  const profile = { company_id: companyId, role: gate.actor.role }
  if (!mayManageCompanySetting(gate.actor)) {
    return NextResponse.json({ error: 'Only an admin can disconnect QuickBooks.' }, { status: 403 })
  }
  // No billing lock: letting go of a connection takes nothing, and a locked
  // account must still be able to stop pushing to its books.

  // REVOKED AT INTUIT, THEN FORGOTTEN HERE. Deleting the row alone left the
  // grant alive, so SyteNav stayed listed under the customer's Connected Apps
  // in QuickBooks after they had pressed Disconnect - which is the first thing
  // Intuit's review checks. The revoke is best-effort: the row goes either way.
  const { data: row } = await db.from('quickbooks_connections')
    .select('refresh_token').eq('company_id', profile.company_id).maybeSingle()
  let revoked = false
  if (row?.refresh_token) {
    try { revoked = await revokeToken(openToken(row.refresh_token)) } catch { revoked = false }
  }
  await db.from('quickbooks_connections').delete().eq('company_id', profile.company_id)
  return NextResponse.json({ ok: true, revoked })
}

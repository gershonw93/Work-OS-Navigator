import { NextResponse } from 'next/server'
import { admin } from '@/lib/quickbooks'
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

  await db.from('quickbooks_connections').delete().eq('company_id', profile.company_id)
  return NextResponse.json({ ok: true })
}

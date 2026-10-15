import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { admin, authorizeUrl, qboConfigured, redirectUri } from '@/lib/quickbooks'
import { markState } from '@/lib/oauth-return'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'

// Start the OAuth handshake: mint a state row (CSRF + which company) and hand
// back the Intuit authorize URL for the browser to open.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!qboConfigured()) {
    return NextResponse.json({ error: 'QuickBooks is not configured on the server yet.' }, { status: 503 })
  }

  const db = admin()
  // The Integrations tab (settings_company: view), and then the narrower
  // question the QuickBooks card already asks through `canManage`. Always the
  // caller's OWN company's connection - the id comes off the actor.
  const gate = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(gate)) return gate.denied
  const user = { id: gate.actor.userId }
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })
  const profile = { company_id: companyId, role: gate.actor.role }
  if (!mayManageCompanySetting(gate.actor)) {
    return NextResponse.json({ error: 'Only an admin can connect QuickBooks.' }, { status: 403 })
  }
  const locked = await billingLock(db, profile.company_id)
  if (locked) return locked

  // The phone app asks with ?native=1. That has to be recorded NOW, because
  // by the time Intuit redirects back we are a different request in a
  // different application and the state is the only thing that survived.
  const native = new URL(request.url).searchParams.get('native') === '1'
  const state = markState(randomUUID(), native)
  await db.from('quickbooks_oauth_states').insert({
    state, company_id: profile.company_id, created_by: user.id,
  })

  return NextResponse.json({ url: authorizeUrl(state, request), redirectUri: redirectUri(request) })
}

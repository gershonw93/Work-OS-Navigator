import { NextResponse } from 'next/server'
import { admin, exchangeCode, listAdminOrganizations } from '@/lib/linkedin'

export const runtime = 'nodejs'

// LinkedIn redirects the browser here with ?code&state. We match the state to
// a company, exchange the code for tokens, store the connection, then bounce
// back to Settings. No bearer here (top-level navigation) - the single-use
// state row is the trust anchor. If the member admins exactly one page we pick
// it automatically; otherwise the card asks them to choose.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const settings = new URL('/settings', url.origin)
  settings.searchParams.set('tab', 'integrations')

  if (error) { settings.searchParams.set('li', 'denied'); return NextResponse.redirect(settings) }
  if (!code || !state) { settings.searchParams.set('li', 'error'); return NextResponse.redirect(settings) }

  const db = admin()
  const { data: st } = await db.from('linkedin_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!st?.company_id) { settings.searchParams.set('li', 'error'); return NextResponse.redirect(settings) }
  await db.from('linkedin_oauth_states').delete().eq('state', state)

  try {
    const t = await exchangeCode(code, request)
    const now = Date.now()

    // If the member admins exactly one page, select it right away.
    let orgUrn: string | null = null
    let orgName: string | null = null
    try {
      const orgs = await listAdminOrganizations(t.access_token)
      if (orgs.length === 1) { orgUrn = orgs[0].urn; orgName = orgs[0].name }
    } catch { /* non-fatal - the card falls back to a manual page picker */ }

    await db.from('linkedin_connections').upsert({
      company_id: st.company_id,
      org_urn: orgUrn,
      org_name: orgName,
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? null,
      access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : null,
      scope: t.scope ?? null,
      status: orgUrn ? 'connected' : 'needs_org',
      connected_by: st.created_by,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    settings.searchParams.set('li', orgUrn ? 'connected' : 'needs_org')
  } catch {
    settings.searchParams.set('li', 'error')
  }
  return NextResponse.redirect(settings)
}

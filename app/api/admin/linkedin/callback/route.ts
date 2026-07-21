import { NextResponse } from 'next/server'
import { admin, exchangeCode, listAdminOrganizations, CONNECTION_ID } from '@/lib/linkedin'

export const runtime = 'nodejs'

// LinkedIn redirects the browser here with ?code&state. This is a top-level
// navigation with no bearer, so the single-use state row (created only by the
// super-admin-gated connect route) is the trust anchor. We exchange the code,
// store the one global connection, then bounce back to the admin console. If
// the member admins exactly one page we pick it automatically.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const console_ = new URL('/admin/linkedin', url.origin)

  if (error) { console_.searchParams.set('li', 'denied'); return NextResponse.redirect(console_) }
  if (!code || !state) { console_.searchParams.set('li', 'error'); return NextResponse.redirect(console_) }

  const db = admin()
  const { data: st } = await db.from('linkedin_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!st) { console_.searchParams.set('li', 'error'); return NextResponse.redirect(console_) }
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
    } catch { /* non-fatal - the console falls back to a manual page picker */ }

    await db.from('linkedin_connection').upsert({
      id: CONNECTION_ID,
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
    }, { onConflict: 'id' })

    console_.searchParams.set('li', orgUrn ? 'connected' : 'needs_org')
  } catch {
    console_.searchParams.set('li', 'error')
  }
  return NextResponse.redirect(console_)
}

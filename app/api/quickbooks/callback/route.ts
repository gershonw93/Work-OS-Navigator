import { NextResponse } from 'next/server'
import { admin, exchangeCode, qboFetch, QBO_ENV } from '@/lib/quickbooks'

export const runtime = 'nodejs'

// Intuit redirects the browser here with ?code&state&realmId. We match the
// state to a company, exchange the code for tokens, store the connection, then
// bounce back to Settings. No bearer here (top-level navigation) - the single-
// use state row is the trust anchor.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId')
  const error = url.searchParams.get('error')

  const settings = new URL('/settings', url.origin)
  settings.searchParams.set('tab', 'integrations')

  if (error) { settings.searchParams.set('qbo', 'denied'); return NextResponse.redirect(settings) }
  if (!code || !state || !realmId) { settings.searchParams.set('qbo', 'error'); return NextResponse.redirect(settings) }

  const db = admin()
  const { data: st } = await db.from('quickbooks_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!st?.company_id) { settings.searchParams.set('qbo', 'error'); return NextResponse.redirect(settings) }
  await db.from('quickbooks_oauth_states').delete().eq('state', state)

  try {
    const t = await exchangeCode(code, request)
    const now = Date.now()

    // Pull the company name for a friendlier connected state.
    let qboName: string | null = null
    try {
      const info = await qboFetch(
        { realm_id: realmId, access_token: t.access_token } as any,
        `companyinfo/${realmId}`,
      )
      qboName = info?.CompanyInfo?.CompanyName ?? null
    } catch { /* non-fatal */ }

    await db.from('quickbooks_connections').upsert({
      company_id: st.company_id,
      realm_id: realmId,
      qbo_company_name: qboName,
      environment: QBO_ENV,
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(now + t.x_refresh_token_expires_in * 1000).toISOString(),
      status: 'connected',
      connected_by: st.created_by,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id' })

    settings.searchParams.set('qbo', 'connected')
  } catch {
    settings.searchParams.set('qbo', 'error')
  }
  return NextResponse.redirect(settings)
}

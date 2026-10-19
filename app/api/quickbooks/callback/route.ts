import { NextResponse } from 'next/server'
import { admin, exchangeCode, qboConfigured, qboFetch, QBO_ENV, revokeToken, tokenColumns } from '@/lib/quickbooks'
import { realmDecision } from '@/lib/qbo-realm'
import { oauthReturnUrl } from '@/lib/oauth-return'

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

  // Back to the Integrations tab - in the browser if that is where this
  // started, or back INSIDE the phone app if it started there. Without the
  // second case you finish connecting QuickBooks and are left looking at
  // Safari, unable to tell whether it worked. See lib/oauth-return.ts.
  const back = (qbo: string) => NextResponse.redirect(
    oauthReturnUrl(state, url.origin, { tab: 'integrations', qbo }),
  )

  if (error) return back('denied')
  if (!code || !state || !realmId) return back('error')

  const db = admin()
  const { data: st } = await db.from('quickbooks_oauth_states').select('*').eq('state', state).maybeSingle()
  if (!st?.company_id) return back('error')
  await db.from('quickbooks_oauth_states').delete().eq('state', state)

  // Never store a real file's tokens on a deploy that cannot seal them.
  if (!qboConfigured()) return back('error')

  try {
    const t = await exchangeCode(code, request)
    const now = Date.now()

    // ONE FILE PER ACCOUNT, AND THE IDS ALREADY PUSHED BELONG TO ONE FILE.
    // Asked before anything is stored: a refusal hands the grant straight back
    // to Intuit, so a file we will not use is not left connected to SyteNav.
    const [{ data: co }, { data: taken }] = await Promise.all([
      db.from('companies').select('qbo_realm_id, qbo_environment').eq('id', st.company_id).maybeSingle(),
      db.from('quickbooks_connections').select('company_id')
        .eq('realm_id', realmId).eq('environment', QBO_ENV).neq('company_id', st.company_id).maybeSingle(),
    ])
    const decision = realmDecision({
      bound: (co as any)?.qbo_realm_id ? { realmId: (co as any).qbo_realm_id, environment: (co as any).qbo_environment ?? 'sandbox' } : null,
      incoming: { realmId, environment: QBO_ENV },
      takenByOtherAccount: !!taken,
    })
    if (decision !== 'connect') {
      await revokeToken(t.refresh_token)
      return back(decision)
    }

    // Pull the company name for a friendlier connected state.
    let qboName: string | null = null
    try {
      const info = await qboFetch(
        { realm_id: realmId, access_token: t.access_token } as any,
        `companyinfo/${realmId}`,
      )
      qboName = info?.CompanyInfo?.CompanyName ?? null
    } catch { /* non-fatal */ }

    const { error: saveErr } = await db.from('quickbooks_connections').upsert({
      company_id: st.company_id,
      realm_id: realmId,
      qbo_company_name: qboName,
      environment: QBO_ENV,
      ...tokenColumns(t, now),
      status: 'connected',
      connected_by: st.created_by,
      connected_at: new Date(now).toISOString(),
      last_refreshed_at: new Date(now).toISOString(),
      last_refresh_error: null,
      updated_at: new Date(now).toISOString(),
    }, { onConflict: 'company_id' })
    if (saveErr) {
      console.error('[quickbooks/callback] save', saveErr.message)
      await revokeToken(t.refresh_token)
      // 23505 on the realm index: another account connected this file first.
      return back(saveErr.code === '23505' ? 'file_taken' : 'error')
    }
    // The file this account's QuickBooks ids now belong to.
    await db.from('companies').update({ qbo_realm_id: realmId, qbo_environment: QBO_ENV }).eq('id', st.company_id)

    return back('connected')
  } catch (err: any) {
    console.error('[quickbooks/callback]', err?.message)
    return back('error')
  }
}

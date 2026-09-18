import { NextResponse } from 'next/server'
import { admin, exchangeCode, googleConfigured } from '@/lib/google-contacts'

export const runtime = 'nodejs'

/**
 * Google sends the browser here. This is a REDIRECT endpoint, not an API one -
 * whatever happens, the person ends up on a page that tells them, never on raw
 * JSON.
 */
function back(request: Request, params: Record<string, string>) {
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  const url = new URL('/settings', base.replace(/\/+$/, ''))
  url.searchParams.set('tab', 'integrations')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // The person said no at Google's screen. That is a decision, not a fault.
  if (error) return back(request, { google: 'cancelled' })
  if (!code || !state) return back(request, { google: 'failed', why: 'missing_code' })
  if (!googleConfigured()) return back(request, { google: 'failed', why: 'not_configured' })

  const db = admin()

  // THE STATE IS THE ONLY THING THAT SURVIVED the trip to Google, so it is both
  // the CSRF check and how we know which company this is for.
  const { data: stateRow } = await db
    .from('google_oauth_states').select('state, company_id, created_by').eq('state', state).maybeSingle()
  if (!stateRow) return back(request, { google: 'failed', why: 'bad_state' })
  // Burned immediately: a replayed code must not re-link anything.
  await db.from('google_oauth_states').delete().eq('state', state)

  const tokens = await exchangeCode(code, request)
  if (!tokens?.access_token) {
    console.error('[google-contacts/callback] exchange failed:', tokens?.error, tokens?.error_description)
    return back(request, { google: 'failed', why: tokens?.error ?? 'exchange_failed' })
  }

  // Which Google account was linked - so the screen can name the inbox rather
  // than saying an anonymous "connected".
  let googleEmail: string | null = null
  try {
    const who = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (who.ok) googleEmail = (await who.json())?.email ?? null
  } catch { /* the name is a nicety; the connection is the point */ }

  const row = {
    company_id: (stateRow as any).company_id,
    google_email: googleEmail,
    access_token: tokens.access_token,
    access_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
    scope: tokens.scope ?? null,
    status: 'connected',
    connected_by: (stateRow as any).created_by ?? null,
    updated_at: new Date().toISOString(),
  } as Record<string, unknown>

  // ONLY OVERWRITE THE REFRESH TOKEN WHEN GOOGLE SENT ONE. It declines to
  // re-issue on a repeat authorisation, and writing the undefined over a good
  // one leaves a connection that works for an hour and then cannot renew -
  // which looks like "it randomly stopped working" weeks later.
  if (tokens.refresh_token) row.refresh_token = tokens.refresh_token

  const { error: upsertError } = await db
    .from('google_connections').upsert(row, { onConflict: 'company_id' })
  if (upsertError) {
    console.error('[google-contacts/callback] save failed:', upsertError.message)
    return back(request, { google: 'failed', why: 'save_failed' })
  }

  return back(request, { google: 'connected' })
}

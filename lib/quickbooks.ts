import { createClient, SupabaseClient } from '@supabase/supabase-js'

// QuickBooks Online integration helper (phase 1: SyteNav -> QBO push).
//
// Requires an Intuit Developer app. Set these env vars (Vercel):
//   QBO_CLIENT_ID, QBO_CLIENT_SECRET
//   QBO_ENV               'sandbox' (default) | 'production'
//   QBO_REDIRECT_URI      defaults to `${NEXT_PUBLIC_APP_URL}/api/quickbooks/callback`
// The redirect URI must exactly match one registered on the Intuit app.

export const QBO_ENV = process.env.QBO_ENV === 'production' ? 'production' : 'sandbox'
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const API_BASE = QBO_ENV === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'
const MINOR_VERSION = '73'
// Accounting + company info. openid/profile/email keep the flow simple.
const SCOPES = 'com.intuit.quickbooks.accounting'

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export function qboConfigured(): boolean {
  return !!(process.env.QBO_CLIENT_ID && process.env.QBO_CLIENT_SECRET)
}

export function redirectUri(request?: Request): string {
  if (process.env.QBO_REDIRECT_URI) return process.env.QBO_REDIRECT_URI
  const base = process.env.NEXT_PUBLIC_APP_URL
    ?? (request ? `https://${request.headers.get('host')}` : 'https://sytenav.com')
  return `${base.replace(/\/$/, '')}/api/quickbooks/callback`
}

export function authorizeUrl(state: string, request?: Request): string {
  const params = new URLSearchParams({
    client_id: process.env.QBO_CLIENT_ID!,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri(request),
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

function basicAuth(): string {
  return Buffer.from(`${process.env.QBO_CLIENT_ID}:${process.env.QBO_CLIENT_SECRET}`).toString('base64')
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number            // seconds (~3600)
  x_refresh_token_expires_in: number // seconds (~8726400)
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`QuickBooks token request failed (${res.status}): ${await res.text()}`)
  return res.json()
}

export async function exchangeCode(code: string, request?: Request): Promise<TokenResponse> {
  return tokenRequest(new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(request),
  }))
}

export async function refreshTokens(refresh_token: string): Promise<TokenResponse> {
  return tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token }))
}

interface Connection {
  company_id: string
  realm_id: string
  access_token: string
  refresh_token: string
  access_expires_at: string | null
  environment: string
  status: string
}

// Return a valid access token, refreshing (and persisting) if it's near expiry.
export async function getValidConnection(db: SupabaseClient, companyId: string): Promise<Connection | null> {
  const { data: conn } = await db.from('quickbooks_connections').select('*').eq('company_id', companyId).maybeSingle()
  if (!conn) return null

  const expMs = conn.access_expires_at ? new Date(conn.access_expires_at).getTime() : 0
  const nearExpiry = expMs - Date.now() < 120_000 // refresh with 2 min headroom
  if (!nearExpiry) return conn as Connection

  try {
    const t = await refreshTokens(conn.refresh_token)
    const now = Date.now()
    const updated = {
      access_token: t.access_token,
      refresh_token: t.refresh_token,
      access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_expires_at: new Date(now + t.x_refresh_token_expires_in * 1000).toISOString(),
      status: 'connected',
      updated_at: new Date().toISOString(),
    }
    await db.from('quickbooks_connections').update(updated).eq('company_id', companyId)
    return { ...conn, ...updated } as Connection
  } catch {
    await db.from('quickbooks_connections').update({ status: 'expired' }).eq('company_id', companyId)
    return null
  }
}

// Call the QBO Accounting API for a connection (auto-prefixes realm + minorversion).
export async function qboFetch(
  conn: Connection,
  path: string,
  init: RequestInit = {},
): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API_BASE}/v3/company/${conn.realm_id}/${path}${sep}minorversion=${MINOR_VERSION}`
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${conn.access_token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : {}
  if (!res.ok) {
    const msg = data?.Fault?.Error?.[0]?.Message || data?.Fault?.Error?.[0]?.Detail || `HTTP ${res.status}`
    throw new Error(msg)
  }
  return data
}

// Run a QBO SQL-ish query (read). Returns the QueryResponse object.
export async function qboQuery(conn: Connection, sql: string): Promise<any> {
  const data = await qboFetch(conn, `query?query=${encodeURIComponent(sql)}`)
  return data?.QueryResponse ?? {}
}

// A default expense account to book a Bill line against. Prefers Cost of Goods
// Sold, then any Expense account. Bills need an AccountRef and QBO has no
// per-line mapping UI yet - this keeps phase 1 push working out of the box.
export async function defaultExpenseAccountId(conn: Connection): Promise<string> {
  const cogs = await qboQuery(conn, "select Id, AccountType from Account where AccountType = 'Cost of Goods Sold' and Active = true")
  if (cogs?.Account?.[0]?.Id) return cogs.Account[0].Id
  const exp = await qboQuery(conn, "select Id from Account where AccountType = 'Expense' and Active = true")
  if (exp?.Account?.[0]?.Id) return exp.Account[0].Id
  throw new Error('No expense account found in QuickBooks to book bills against.')
}

// A default service item for a Sales Receipt line (carries the income account).
export async function defaultServiceItemId(conn: Connection): Promise<string> {
  const svc = await qboQuery(conn, "select Id from Item where Type = 'Service' and Active = true")
  if (svc?.Item?.[0]?.Id) return svc.Item[0].Id
  const any = await qboQuery(conn, "select Id from Item where Active = true")
  if (any?.Item?.[0]?.Id) return any.Item[0].Id
  throw new Error('No item found in QuickBooks to record payments against.')
}

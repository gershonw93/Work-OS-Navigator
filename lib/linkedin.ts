import { createClient, SupabaseClient } from '@supabase/supabase-js'

// LinkedIn business-page posting integration.
//
// There is ONE connection for the whole app (a singleton row), managed only by
// the platform owner (super admin) from /admin/linkedin. It is not per-company.
//
// Requires a LinkedIn Developer app with the **Community Management API**
// product enabled (that product grants the two scopes below). Set these env
// vars (Vercel):
//   LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
//   LINKEDIN_REDIRECT_URI   defaults to `${NEXT_PUBLIC_APP_URL}/api/admin/linkedin/callback`
//   LINKEDIN_API_VERSION    optional, LinkedIn-Version header (default below)
// The redirect URI must exactly match one registered on the LinkedIn app.

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const API_BASE = 'https://api.linkedin.com/rest'
const API_VERSION = process.env.LINKEDIN_API_VERSION || '202506'
// w_organization_social: create posts as the page.
// r_organization_admin: list pages the member administers (to pick the page).
const SCOPES = 'w_organization_social r_organization_admin'

// The singleton connection row lives at id = 1 (see 058_linkedin.sql).
export const CONNECTION_ID = 1
export const POST_MAX_CHARS = 3000

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export function linkedinConfigured(): boolean {
  return !!(process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET)
}

export function redirectUri(request?: Request): string {
  if (process.env.LINKEDIN_REDIRECT_URI) return process.env.LINKEDIN_REDIRECT_URI
  const base = process.env.NEXT_PUBLIC_APP_URL
    ?? (request ? `https://${request.headers.get('host')}` : 'https://sytenav.com')
  return `${base.replace(/\/$/, '')}/api/admin/linkedin/callback`
}

export function authorizeUrl(state: string, request?: Request): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.LINKEDIN_CLIENT_ID!,
    redirect_uri: redirectUri(request),
    state,
    scope: SCOPES,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  expires_in: number             // seconds (~60 days)
  refresh_token?: string         // only for apps approved for refresh tokens
  refresh_token_expires_in?: number
  scope?: string
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  body.set('client_id', process.env.LINKEDIN_CLIENT_ID!)
  body.set('client_secret', process.env.LINKEDIN_CLIENT_SECRET!)
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`LinkedIn token request failed (${res.status}): ${await res.text()}`)
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

export interface Connection {
  org_urn: string | null
  org_name: string | null
  access_token: string
  refresh_token: string | null
  access_expires_at: string | null
  status: string
}

// Return the app's usable connection, refreshing the access token if we can.
// LinkedIn only issues refresh tokens to approved apps, so without one an
// expired connection just flips to 'expired' and the console asks for a
// reconnect.
export async function getValidConnection(db: SupabaseClient): Promise<Connection | null> {
  const { data: conn } = await db.from('linkedin_connection').select('*').eq('id', CONNECTION_ID).maybeSingle()
  if (!conn) return null

  const expMs = conn.access_expires_at ? new Date(conn.access_expires_at).getTime() : Infinity
  const nearExpiry = expMs - Date.now() < 300_000 // 5 min headroom
  if (!nearExpiry) return conn as Connection

  if (!conn.refresh_token) {
    await db.from('linkedin_connection').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', CONNECTION_ID)
    return null
  }
  try {
    const t = await refreshTokens(conn.refresh_token)
    const now = Date.now()
    const updated = {
      access_token: t.access_token,
      refresh_token: t.refresh_token ?? conn.refresh_token,
      access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
      refresh_expires_at: t.refresh_token_expires_in ? new Date(now + t.refresh_token_expires_in * 1000).toISOString() : conn.refresh_expires_at,
      status: conn.org_urn ? 'connected' : 'needs_org',
      updated_at: new Date().toISOString(),
    }
    await db.from('linkedin_connection').update(updated).eq('id', CONNECTION_ID)
    return { ...conn, ...updated } as Connection
  } catch {
    await db.from('linkedin_connection').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', CONNECTION_ID)
    return null
  }
}

async function liFetch(accessToken: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': API_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
}

export interface OrgOption { urn: string; name: string }

// Company pages where the member is an approved ADMINISTRATOR.
export async function listAdminOrganizations(accessToken: string): Promise<OrgOption[]> {
  const res = await liFetch(accessToken,
    '/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED&count=50')
  if (!res.ok) throw new Error(`Could not list your LinkedIn pages (${res.status}): ${await res.text()}`)
  const data = await res.json()
  const urns: string[] = (data?.elements ?? [])
    .map((e: any) => e.organization)
    .filter((u: any) => typeof u === 'string')
  const orgs: OrgOption[] = []
  for (const urn of urns) {
    orgs.push({ urn, name: await organizationName(accessToken, urn) ?? urn })
  }
  return orgs
}

export async function organizationName(accessToken: string, orgUrn: string): Promise<string | null> {
  const id = orgUrn.split(':').pop()
  const res = await liFetch(accessToken, `/organizations/${id}`)
  if (!res.ok) return null
  const data = await res.json()
  return data?.localizedName ?? null
}

// LinkedIn "Little Text Format": these characters are reserved in post
// commentary and must be escaped to render literally. '#' is left alone so
// hashtags keep working.
export function escapeCommentary(text: string): string {
  return text.replace(/[\\|{}@[\]()<>*_~]/g, m => `\\${m}`)
}

// Publish a text post as the organization. Returns the new post URN.
export async function publishPost(conn: Connection, body: string): Promise<string> {
  if (!conn.org_urn) throw new Error('No LinkedIn page selected yet.')
  const res = await liFetch(conn.access_token, '/posts', {
    method: 'POST',
    body: JSON.stringify({
      author: conn.org_urn,
      commentary: escapeCommentary(body),
      visibility: 'PUBLIC',
      distribution: {
        feedDistribution: 'MAIN_FEED',
        targetEntities: [],
        thirdPartyDistributionChannels: [],
      },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { msg = (await res.json())?.message || msg } catch { /* keep status */ }
    throw new Error(`LinkedIn rejected the post: ${msg}`)
  }
  return res.headers.get('x-restli-id') ?? ''
}

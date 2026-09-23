import { createClient } from '@supabase/supabase-js'

/**
 * GOOGLE CONTACTS - the config, the token dance, and what a Person becomes.
 *
 * Everything that talks to Google lives here so the connect route, the
 * callback, the sync and the disconnect cannot drift - the same reason
 * `lib/quickbooks-push.ts` is one file.
 *
 * SET UP OUTSIDE THE REPO: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are
 * environment variables. They are never committed, never logged, and
 * "not configured" is a NORMAL STATE that answers 503 with a sentence rather
 * than throwing - a company that has not connected Google is not an error.
 */

export const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Read-only. We import contacts; we never write to somebody's phone book. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/contacts.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

/**
 * Where Google sends the browser back.
 *
 * It must match what is registered in the Google Cloud console CHARACTER FOR
 * CHARACTER or the handshake fails with `redirect_uri_mismatch` and nothing
 * else - so it is derived from one place rather than typed per route.
 */
export function redirectUri(request: Request): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  return `${base.replace(/\/+$/, '')}/api/google-contacts/callback`
}

export function authorizeUrl(state: string, request: Request): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    state,
    // OFFLINE + CONSENT, and both are load-bearing. Without `offline` Google
    // issues no refresh token, so the import stops working in an hour and the
    // only fix anybody finds is reconnecting - for ever. Without `consent`
    // Google declines to re-issue a refresh token on a SECOND authorisation of
    // the same account, so reconnecting after a revoke silently leaves you with
    // an access token and no way to renew it.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  return res.json() as Promise<TokenResponse>
}

export function exchangeCode(code: string, request: Request) {
  return tokenRequest({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: redirectUri(request),
    grant_type: 'authorization_code',
  })
}

export function refreshAccessToken(refreshToken: string) {
  return tokenRequest({
    refresh_token: refreshToken,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  })
}

/**
 * A usable access token for this company, refreshing if it has expired.
 *
 * Returns null rather than throwing: "the connection has gone stale" is a state
 * the screen has to be able to describe, not an exception that takes a page
 * down. The row is marked `expired` so the UI can say to reconnect instead of
 * showing an empty list that reads as "you have no contacts".
 */
export async function accessTokenFor(
  db: ReturnType<typeof admin>,
  companyId: string,
): Promise<string | null> {
  const { data: row } = await db
    .from('google_connections')
    .select('access_token, refresh_token, access_expires_at, status')
    .eq('company_id', companyId).maybeSingle()
  if (!row || (row as any).status === 'revoked') return null

  const expiresAt = (row as any).access_expires_at
    ? new Date((row as any).access_expires_at).getTime()
    : 0
  // A minute of slack: a token that expires mid-request is the same as an
  // expired one, and the retry costs more than refreshing early.
  if (expiresAt > Date.now() + 60_000) return (row as any).access_token

  const refresh = (row as any).refresh_token
  if (!refresh) {
    await db.from('google_connections')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
    return null
  }

  const fresh = await refreshAccessToken(refresh)
  if (!fresh?.access_token) {
    console.error('[google-contacts] refresh failed:', fresh?.error, fresh?.error_description)
    await db.from('google_connections')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('company_id', companyId)
    return null
  }

  await db.from('google_connections').update({
    access_token: fresh.access_token,
    access_expires_at: new Date(Date.now() + (fresh.expires_in ?? 3600) * 1000).toISOString(),
    status: 'connected',
    updated_at: new Date().toISOString(),
  }).eq('company_id', companyId)

  return fresh.access_token
}

// ── What a Google Person becomes in the staging area ────────────────────────

export interface StagedContact {
  resource_name: string
  name: string | null
  email: string | null
  phone: string | null
  organization: string | null
  job_title: string | null
}

/**
 * Flatten one People API person.
 *
 * PRIMARY FIRST, then whatever is there. Google hands back arrays with a
 * `metadata.primary` flag, and taking `[0]` gives you somebody's old work
 * address about as often as not.
 */
export function stageContact(person: any): StagedContact | null {
  const resource = String(person?.resourceName ?? '')
  if (!resource) return null

  const pick = (arr: any[], key: string): string | null => {
    const list = Array.isArray(arr) ? arr : []
    const primary = list.find(v => v?.metadata?.primary)
    const chosen = primary ?? list[0]
    const value = chosen?.[key]
    return value ? String(value).trim() || null : null
  }

  const org = Array.isArray(person?.organizations) ? person.organizations : []
  const primaryOrg = org.find((o: any) => o?.metadata?.primary) ?? org[0]

  return {
    resource_name: resource,
    name: pick(person?.names, 'displayName'),
    email: pick(person?.emailAddresses, 'value'),
    phone: pick(person?.phoneNumbers, 'value'),
    organization: primaryOrg?.name ? String(primaryOrg.name).trim() || null : null,
    job_title: primaryOrg?.title ? String(primaryOrg.title).trim() || null : null,
  }
}

/**
 * Worth staging at all?
 *
 * A row with no name AND no way to reach them is not a contact, it is noise -
 * Google returns plenty of those from old device syncs. Everything else is
 * kept: deciding who is "really" a sub is the human's job, which is the entire
 * reason the staging area exists.
 */
export function worthStaging(c: StagedContact | null): boolean {
  if (!c) return false
  return !!(c.name || c.email || c.phone)
}

/**
 * What a staged contact can be labelled as. This is the STAGING vocabulary and
 * it is NOT `companies.type` - "delivery" is a word a GC sorts a phone book
 * with, and the Directory has no such type. `directoryType` is the one
 * translation between the two.
 */
export const CONTACT_TYPES = ['subcontractor', 'supplier', 'delivery', 'inspector', 'other'] as const
export type StagedContactType = (typeof CONTACT_TYPES)[number]

/** The values `companies_type_check` allows (migration 021). */
export const DIRECTORY_TYPES = ['gc', 'subcontractor', 'supplier', 'inspector', 'worker', 'other'] as const
export type DirectoryType = (typeof DIRECTORY_TYPES)[number]

/**
 * The Directory type a staged label is filed under.
 *
 * THE BUG. This comment used to say CONTACT_TYPES "mirrors companies.type", and
 * it did not: the import wrote `type: 'delivery'` straight into `companies`,
 * the CHECK constraint refused it, and every contact labelled Delivery failed
 * with a Postgres sentence on screen while the Subs beside it went through.
 * A delivery is a supplier everywhere else in the app (a supplier's schedule
 * line IS "the delivery"), so that is where it is filed.
 */
export function directoryType(t: StagedContactType): DirectoryType {
  return t === 'delivery' ? 'supplier' : t
}

export function isContactType(v: unknown): v is StagedContactType {
  return typeof v === 'string' && (CONTACT_TYPES as readonly string[]).includes(v)
}

/** True when a staged contact has an email address to reach them on. */
export function hasEmail(c: { email?: string | null }): boolean {
  return !!c.email?.trim()
}

/**
 * The order the staging list is shown in: contacts WITH an email first, the
 * ones without at the bottom (and greyed out on screen). Asked for directly -
 * a phone book is mostly half-entries from old syncs, and the ones worth
 * filing are the ones SyteNav can actually write to. Stable, so within each
 * group the server's order is kept. Nothing is hidden: a no-email contact can
 * still be ticked and imported (a sub you only ever phone is still a sub).
 */
export function stagedOrder<T extends { email?: string | null }>(rows: T[]): T[] {
  return rows.filter(hasEmail).concat(rows.filter(r => !hasEmail(r)))
}

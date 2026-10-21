import { createClient, SupabaseClient } from '@supabase/supabase-js'

// QuickBooks Online integration helper (SyteNav -> QBO push).
//
// Requires an Intuit Developer app. Env vars (Vercel):
//   QBO_ENV                         'sandbox' (default) | 'production'
//   QBO_SANDBOX_CLIENT_ID/_SECRET   the Development keys (QBO_CLIENT_ID/_SECRET
//                                   are still read for sandbox, as before)
//   QBO_PRODUCTION_CLIENT_ID/_SECRET the Production keys - read ONLY when
//                                   QBO_ENV is 'production'
//   QBO_TOKEN_KEY                   encrypts tokens at rest; REQUIRED on production
//   QBO_REDIRECT_URI                defaults to `${NEXT_PUBLIC_APP_URL}/api/quickbooks/callback`
// The redirect URI must exactly match one registered on the Intuit app.
//
// SANDBOX AND PRODUCTION KEYS NEVER MIX. There used to be one QBO_CLIENT_ID
// and a QBO_ENV beside it, so flipping QBO_ENV to production with the sandbox
// keys still in place sent sandbox credentials to the real Intuit endpoints -
// and the reverse put real keys against the sandbox API. Production now reads
// only variables whose NAME says production, and never falls back.

import { openToken, sealToken, tokenKey } from '@/lib/qbo-token-crypto'

export type QboEnvironment = 'sandbox' | 'production'
/**
 * Which environment a raw QBO_ENV value means. Pure.
 *
 * It was `=== 'production'`, so "Production", " production" or a pasted value
 * with quotes silently meant SANDBOX - the card kept its Sandbox badge after
 * the variable was "set", with nothing to say why. Case, spaces and quotes are
 * forgiven; anything else is still sandbox, and `qboEnvSetting` reports it.
 */
export function parseQboEnv(raw: string | undefined | null): QboEnvironment {
  return String(raw ?? '').trim().replace(/^["']|["']$/g, '').trim().toLowerCase() === 'production' ? 'production' : 'sandbox'
}

export const QBO_ENV: QboEnvironment = parseQboEnv(process.env.QBO_ENV)

/**
 * What this deploy actually sees, for the Settings card - so "it still says
 * Sandbox" can be answered from the screen. QBO_ENV is not a secret and is
 * shown as read (JSON-quoted, so a stray space is visible); the three secrets
 * are reported as set or missing, never their values.
 */
export function qboEnvSetting(vars: Record<string, string | undefined> = process.env) {
  const raw = vars.QBO_ENV
  return {
    qboEnvRaw: raw === undefined ? null : JSON.stringify(String(raw).slice(0, 40)),
    resolvesTo: parseQboEnv(raw),
    productionClientId: !!vars.QBO_PRODUCTION_CLIENT_ID,
    productionClientSecret: !!vars.QBO_PRODUCTION_CLIENT_SECRET,
    tokenKey: !!String(vars.QBO_TOKEN_KEY ?? '').trim(),
    vercelEnv: vars.VERCEL_ENV ?? null,
  }
}
const AUTH_BASE = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
const API_BASE = QBO_ENV === 'production'
  ? 'https://quickbooks.api.intuit.com'
  : 'https://sandbox-quickbooks.api.intuit.com'
const MINOR_VERSION = '73'
// Accounting only - the one scope the push needs, and what Intuit's review
// asks an app to limit itself to. No openid/profile/email/payments.
export const SCOPES = 'com.intuit.quickbooks.accounting'

export function admin(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Which keys this deploy uses, by environment. Pure over its argument. */
export function qboCredentials(
  env: QboEnvironment = QBO_ENV,
  vars: Record<string, string | undefined> = process.env,
): { clientId: string; clientSecret: string } | null {
  const pick = (id?: string, secret?: string) => (id && secret ? { clientId: id, clientSecret: secret } : null)
  if (env === 'production') return pick(vars.QBO_PRODUCTION_CLIENT_ID, vars.QBO_PRODUCTION_CLIENT_SECRET)
  return pick(vars.QBO_SANDBOX_CLIENT_ID, vars.QBO_SANDBOX_CLIENT_SECRET)
    ?? pick(vars.QBO_CLIENT_ID, vars.QBO_CLIENT_SECRET)
}

/**
 * What is missing before this deploy can connect, in words - or null. The
 * card prints it, so "not set up" says WHICH variable rather than leaving
 * somebody to guess between four.
 */
export function qboConfigProblem(
  env: QboEnvironment = QBO_ENV,
  vars: Record<string, string | undefined> = process.env,
): string | null {
  if (!qboCredentials(env, vars)) {
    return env === 'production'
      ? 'QBO_PRODUCTION_CLIENT_ID and QBO_PRODUCTION_CLIENT_SECRET are not set'
      : 'No QuickBooks Development keys are set (QBO_SANDBOX_CLIENT_ID / QBO_SANDBOX_CLIENT_SECRET)'
  }
  // `?? ''`: an absent key must be absent, not fall through to tokenKey's
  // own default of process.env - which would let a test, or a caller passing
  // another environment's variables, borrow this process's key.
  if (env === 'production' && !tokenKey(vars.QBO_TOKEN_KEY ?? '')) {
    return 'QBO_TOKEN_KEY is not set, so tokens for a real QuickBooks file could not be stored encrypted'
  }
  return null
}

export function qboConfigured(): boolean {
  return qboConfigProblem() === null
}

export function redirectUri(request?: Request): string {
  if (process.env.QBO_REDIRECT_URI) return process.env.QBO_REDIRECT_URI
  const base = process.env.NEXT_PUBLIC_APP_URL
    ?? (request ? `https://${request.headers.get('host')}` : 'https://sytenav.com')
  return `${base.replace(/\/$/, '')}/api/quickbooks/callback`
}

export function authorizeUrl(state: string, request?: Request): string {
  const params = new URLSearchParams({
    client_id: qboCredentials()!.clientId,
    response_type: 'code',
    scope: SCOPES,
    redirect_uri: redirectUri(request),
    state,
  })
  return `${AUTH_BASE}?${params.toString()}`
}

function basicAuth(): string {
  const c = qboCredentials()
  return Buffer.from(`${c?.clientId ?? ''}:${c?.clientSecret ?? ''}`).toString('base64')
}

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number            // seconds (~3600)
  x_refresh_token_expires_in: number // seconds (~8726400)
}

/** A token request Intuit answered with a refusal, kept apart from one that never got an answer. */
export class QboTokenError extends Error {
  status: number
  oauthError: string | null
  constructor(status: number, body: string) {
    let oauthError: string | null = null
    try { oauthError = JSON.parse(body)?.error ?? null } catch { /* not JSON */ }
    super(`QuickBooks token request failed (${status}${oauthError ? `, ${oauthError}` : ''})`)
    this.name = 'QboTokenError'
    this.status = status
    this.oauthError = oauthError
  }
}

/**
 * Is this refresh failure the END of the connection, or a bad minute?
 *
 * The old answer was "any failure ends it": one 503 from Intuit marked the
 * connection expired, every push after that came back "not connected" - a
 * NORMAL state, so nothing was logged - and the books quietly stopped
 * receiving anything until somebody noticed. Only Intuit SAYING the grant is
 * gone (invalid_grant, or a 400/401 on the token call) means reconnect. A
 * network error or a 5xx is a failure to ask, and says nothing about the token
 * - the same rule `lib/auth-outcome.ts` follows for a sign-in.
 */
export function refreshIsFatal(err: unknown): boolean {
  if (!(err instanceof QboTokenError)) return false
  if (err.oauthError === 'invalid_grant' || err.oauthError === 'invalid_client') return true
  return err.status === 400 || err.status === 401
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
  if (!res.ok) throw new QboTokenError(res.status, await res.text())
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

/**
 * Tell Intuit to forget a token. Disconnecting used to delete our row and
 * leave the grant alive at Intuit, so "Disconnect" in SyteNav did not remove
 * SyteNav from the customer's QuickBooks Connected Apps. Never throws: a
 * disconnect must work while Intuit is down, and the row goes either way.
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await fetch(REVOKE_URL, {
      method: 'POST',
      headers: { Authorization: `Basic ${basicAuth()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ token }),
    })
    return res.ok
  } catch {
    return false
  }
}

/** The stored columns for a fresh token pair - sealed, with the expiry Intuit gave. */
export function tokenColumns(t: TokenResponse, now = Date.now()) {
  return {
    access_token: sealToken(t.access_token),
    refresh_token: sealToken(t.refresh_token),
    access_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + t.x_refresh_token_expires_in * 1000).toISOString(),
  }
}

export interface Connection {
  company_id: string
  realm_id: string
  access_token: string
  refresh_token: string
  access_expires_at: string | null
  environment: string
  status: string
}

/**
 * Statuses a connection row can hold. `expired` is the old word for
 * `needs_reconnect` and is still read as it.
 */
export const RECONNECT_STATUSES = ['needs_reconnect', 'expired']

/**
 * Why a stored connection cannot be used by THIS deploy, or null.
 *
 * A row made against the sandbox carries a sandbox realm and sandbox tokens;
 * handed to the production API it would be refused at best, and at worst its
 * realm id names somebody else's company. It is never used - the card says to
 * reconnect, and the realm lock in the callback decides what that means for
 * the ids already pushed.
 */
export function connectionUnusable(conn: { environment?: string | null; status?: string | null }, env: QboEnvironment = QBO_ENV): string | null {
  if ((conn.environment ?? 'sandbox') !== env) return 'wrong_environment'
  if (RECONNECT_STATUSES.includes(String(conn.status))) return 'needs_reconnect'
  return null
}

async function logConnection(db: SupabaseClient, companyId: string, realmId: string, message: string) {
  try {
    await db.from('quickbooks_sync_log').insert({
      company_id: companyId, entity_type: 'connection', entity_id: null, action: 'update',
      status: 'error', qbo_id: realmId, message,
    })
  } catch { /* the log must never take the caller down */ }
}

// Return a usable connection with a valid access token, refreshing (and
// persisting, sealed) when it is near expiry. Null when there is none to use.
export async function getValidConnection(
  db: SupabaseClient, companyId: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<Connection | null> {
  const { data: row } = await db.from('quickbooks_connections').select('*').eq('company_id', companyId).maybeSingle()
  if (!row || connectionUnusable(row)) return null

  let conn: Connection
  try {
    conn = { ...(row as any), access_token: openToken(row.access_token), refresh_token: openToken(row.refresh_token) }
  } catch (err: any) {
    await logConnection(db, companyId, row.realm_id, err?.message ?? 'Stored QuickBooks tokens could not be read')
    return null
  }

  const expMs = conn.access_expires_at ? new Date(conn.access_expires_at).getTime() : 0
  const nearExpiry = expMs - Date.now() < 120_000 // refresh with 2 min headroom
  if (!nearExpiry && !opts.forceRefresh) return conn

  try {
    const t = await refreshTokens(conn.refresh_token)
    const now = new Date()
    const updated = {
      ...tokenColumns(t, now.getTime()),
      status: 'connected',
      last_refreshed_at: now.toISOString(),
      last_refresh_error: null,
      updated_at: now.toISOString(),
    }
    await db.from('quickbooks_connections').update(updated).eq('company_id', companyId)
    return { ...conn, access_token: t.access_token, refresh_token: t.refresh_token, access_expires_at: updated.access_expires_at }
  } catch (err: any) {
    // ANOTHER REQUEST MAY HAVE ROTATED IT FIRST. Two pushes landing in the same
    // minute both see a stale access token and both refresh with the same
    // refresh token; the loser is told invalid_grant about a connection that is
    // perfectly healthy. Re-read before believing it.
    const { data: again } = await db.from('quickbooks_connections').select('*').eq('company_id', companyId).maybeSingle()
    if (again && again.refresh_token !== row.refresh_token && !connectionUnusable(again)) {
      try {
        return { ...(again as any), access_token: openToken(again.access_token), refresh_token: openToken(again.refresh_token) }
      } catch { /* fall through to the failure below */ }
    }
    const message = err?.message ?? 'QuickBooks sign-in could not be renewed'
    if (refreshIsFatal(err)) {
      await db.from('quickbooks_connections')
        .update({ status: 'needs_reconnect', last_refresh_error: message }).eq('company_id', companyId)
      // Once, on the way from connected to dead - not on every push after.
      if (row.status === 'connected') {
        await logConnection(db, companyId, row.realm_id,
          `${message}. QuickBooks no longer accepts SyteNav's sign-in - reconnect QuickBooks in Settings > Integrations. Nothing is pushed until then.`)
      }
    } else {
      // A bad minute at Intuit. The connection stays; this push misses and the
      // backlog picks it up. Written down at most every ten minutes, so an
      // outage is visible without a row per push.
      const lastAt = row.updated_at ? new Date(row.updated_at).getTime() : 0
      if (!row.last_refresh_error || Date.now() - lastAt > 10 * 60_000) {
        await logConnection(db, companyId, row.realm_id,
          `${message} - QuickBooks could not be reached to renew the sign-in. It will try again on the next push.`)
      }
      await db.from('quickbooks_connections')
        .update({ last_refresh_error: message, updated_at: new Date().toISOString() }).eq('company_id', companyId)
    }
    return null
  }
}

/**
 * What a QuickBooks failure should say in the sync log.
 *
 * QBO splits an error in two: `Message` is a short label and `Detail` is the
 * sentence that names the thing that went wrong. This preferred Message and
 * threw Detail away, so a failed payment logged the words "Object Not Found"
 * and nothing else - true, useless, and an hour of guessing which object.
 * Keep both, plus the code, because the code is what Intuit's docs are
 * indexed by.
 */
export function qboErrorMessage(data: any, status?: number): string {
  const e = data?.Fault?.Error?.[0]
  const parts = [e?.Message, e?.Detail].filter(Boolean).map((s: string) => String(s).trim())
  // Detail often repeats Message as its first clause; don't say it twice.
  const body = parts.length === 2 && parts[1].startsWith(parts[0]) ? parts[1] : parts.join(' - ')
  if (!body) return `HTTP ${status ?? '?'}`
  return e?.code ? `${body} (QuickBooks code ${e.code})` : body
}

/** QBO's numeric fault code, for callers that branch on it. */
export function qboErrorCode(data: any): string | null {
  const c = data?.Fault?.Error?.[0]?.code
  return c === undefined || c === null ? null : String(c)
}

/**
 * 610 is QuickBooks saying "a reference you sent points at nothing I can use".
 * Its Detail is boilerplate that lists every field it MIGHT be
 * ("accounts, customers, items, vendors or employees") and names none of them,
 * so the code is the only reliable signal that a probe is worth running.
 */
export const QBO_OBJECT_NOT_FOUND = '610'

export class QboError extends Error {
  code: string | null
  status?: number
  constructor(data: any, status?: number) {
    super(qboErrorMessage(data, status))
    this.name = 'QboError'
    this.code = qboErrorCode(data)
    this.status = status
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
    throw new QboError(data, res.status)
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

/**
 * The bank account a bill payment comes out of.
 *
 * QBO will not accept a BillPayment without one - PayType Check needs
 * CheckPayment.BankAccountRef, and there is no sensible default it can infer.
 * SyteNav has no per-company account mapping yet, so this picks the company's
 * first active Bank account; a bookkeeper can move it inside QuickBooks, which
 * is the same bargain bills and receipts already make with their default
 * expense account and service item.
 */
export async function defaultBankAccountId(conn: Connection): Promise<string> {
  const bank = await qboQuery(conn, "select Id from Account where AccountType = 'Bank' and Active = true")
  if (bank?.Account?.[0]?.Id) return bank.Account[0].Id
  throw new Error('No active bank account found in QuickBooks to pay bills from.')
}

// A default service item for a Sales Receipt line (carries the income account).
export async function defaultServiceItemId(conn: Connection): Promise<string> {
  const svc = await qboQuery(conn, "select Id from Item where Type = 'Service' and Active = true")
  if (svc?.Item?.[0]?.Id) return svc.Item[0].Id
  const any = await qboQuery(conn, "select Id from Item where Active = true")
  if (any?.Item?.[0]?.Id) return any.Item[0].Id
  throw new Error('No item found in QuickBooks to record payments against.')
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment methods.
//
// SyteNav records HOW money arrived (Check, ACH, Wire...) and QuickBooks has
// its own PaymentMethod list, so a payment used to land there with an amount
// and a date and no idea how it came in - the column a bookkeeper reconciles
// a bank statement against, blank.
//
// The names do not line up. QBO ships with "Check", "Cash" and "Credit Card";
// it has nothing called ACH or Wire unless somebody added them. So: map to
// what exists, create what does not, and cache per run - the list is small and
// changes about never.
// ─────────────────────────────────────────────────────────────────────────────

/** SyteNav's word -> the QuickBooks name to look for. */
const METHOD_ALIASES: Record<string, string> = {
  check: 'Check',
  cash: 'Cash',
  cc: 'Credit Card',
  'credit card': 'Credit Card',
  ach: 'ACH',
  wire: 'Wire',
  quickpay: 'QuickPay',
  other: 'Other',
}

export function qboMethodName(method: string | null | undefined): string | null {
  const key = String(method ?? '').trim().toLowerCase()
  if (!key) return null
  return METHOD_ALIASES[key] ?? String(method).trim()
}

/**
 * The QBO PaymentMethod id for one of our method names, creating it if the
 * company does not have it yet. Returns null when there is nothing to match -
 * a payment with no method recorded should carry no method, not a guess.
 */
export async function paymentMethodId(conn: Connection, method: string | null | undefined): Promise<string | null> {
  const name = qboMethodName(method)
  if (!name) return null

  // Escape single quotes: a method called "Bill's" would otherwise break the
  // query, and QBO's SQL-ish dialect has no parameter binding.
  const safe = name.replace(/'/g, "\\'")
  // `Active = true` matters. Every other lookup here filters it
  // (defaultExpenseAccountId, defaultServiceItemId) and this one did not - so a
  // method somebody had made inactive in QuickBooks came back as a perfectly
  // good id, and referencing it fails with 610 "has been made inactive".
  const found = await qboQuery(conn, `select Id, Name from PaymentMethod where Name = '${safe}' and Active = true`)
  const hit = found?.PaymentMethod?.[0]?.Id
  if (hit) return hit

  try {
    const created = await qboFetch(conn, 'paymentmethod', {
      method: 'POST',
      // QBO's PaymentMethod.Type is an enum of exactly two values:
      // CREDIT_CARD and NON_CREDIT_CARD. 'OTHER' is not one of them, so every
      // method this created (ACH, Wire, QuickPay - the ones QuickBooks does
      // not ship with) was created with a type QuickBooks does not define.
      body: JSON.stringify({ Name: name, Type: methodType(name) }),
    })
    return created?.PaymentMethod?.Id ?? null
  } catch {
    // A method we cannot create is not worth failing a payment over - the
    // amount, date and reference still get there.
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Probing a rejected reference.
//
// QuickBooks answers a bad reference with code 610 and a sentence that lists
// every field it might possibly be - "accounts, customers, items, vendors or
// employees" - and names none of them. Three payments failed identically and
// the log could not say which of the three references we sent was the bad one.
//
// So when a push fails with 610, ask QuickBooks about each reference we used,
// one GET apiece, and write down which ones it can resolve. Only on failure:
// a working push pays nothing for this.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReferenceProbe {
  /** e.g. "customer 59" - what we sent, so the log shows the actual value. */
  label: string
  ok: boolean
  /** Why not, or anything worth knowing about a reference that DID resolve. */
  note?: string
  /**
   * QuickBooks has no such record, as opposed to having one it will not accept.
   * The difference decides whether a cached id is safe to throw away: a MISSING
   * customer should be re-created, an INACTIVE one must not be, or the next
   * push quietly makes a second customer with the same name.
   */
  missing?: boolean
}

/** One reference to check: the QBO entity path, and how to read the answer. */
export interface ReferenceRef {
  label: string
  path: string
  /** Pulls the entity out of the response and reports anything disqualifying. */
  inspect?: (obj: any) => string | null
}

export async function probeReferences(conn: Connection, refs: ReferenceRef[]): Promise<ReferenceProbe[]> {
  return Promise.all(refs.map(async (r): Promise<ReferenceProbe> => {
    try {
      const data = await qboFetch(conn, r.path)
      // The entity comes back under its own name - Customer, Invoice - so take
      // whichever key is not the response envelope.
      const obj = data && typeof data === 'object'
        ? Object.entries(data).find(([k]) => k !== 'time' && k !== 'QueryResponse')?.[1]
        : null
      if (!obj) return { label: r.label, ok: false, missing: true, note: 'QuickBooks returned nothing for it' }
      const problem = r.inspect?.(obj)
      return problem
        ? { label: r.label, ok: false, note: problem }
        : { label: r.label, ok: true }
    } catch (err: any) {
      // It could not even be read: no such record, rather than one we cannot use.
      return { label: r.label, ok: false, missing: true, note: err?.message ?? 'could not be read' }
    }
  }))
}

/** One line for the sync log: what we sent, and what QuickBooks made of it. */
export function describeProbe(probes: ReferenceProbe[]): string {
  const bad = probes.filter(p => !p.ok)
  if (!bad.length) {
    return `QuickBooks resolved every reference we sent (${probes.map(p => p.label).join(', ')}), so the rejection is not one of them`
  }
  return `QuickBooks rejected ${bad.map(p => `${p.label} (${p.note ?? 'not found'})`).join('; ')}`
}

/** QBO knows two kinds of payment method, and a card is the special one. */
function methodType(name: string): 'CREDIT_CARD' | 'NON_CREDIT_CARD' {
  return /credit\s*card|^cc$|debit/i.test(name) ? 'CREDIT_CARD' : 'NON_CREDIT_CARD'
}

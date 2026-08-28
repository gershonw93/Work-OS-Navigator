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

export interface Connection {
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

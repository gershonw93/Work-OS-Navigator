// ─────────────────────────────────────────────────────────────────────────────
// Sign in with SyteNav, for Claude - the pure half.
//
// The MCP authorization spec is OAuth 2.1 with three discovery documents and
// one rule that matters more than the rest: PKCE (S256), always. Claude finds
// this server from the 401 on /api/mcp (`resource_metadata`), reads where to
// sign in, registers itself, sends the person to /oauth/authorize, and swaps
// the code for a token. Everything that is a DECISION about a request lives
// here, with no database and no crypto, so it can be tested on its own; the
// routes and `oauth-server.ts` do the storing.
//
// THE LOGIN MINTS AN `mcp_tokens` ROW, the same thing Phase 1 makes. So the
// token reads through the same dispatcher with the same permissions, appears on
// the same Settings card and is revoked by the same button. Nothing in
// `lib/mcp/tools.ts` knows which door a token came in by.
// ─────────────────────────────────────────────────────────────────────────────

export const OAUTH_SCOPE = 'sytenav:read'

/** An access token lasts an hour; Claude renews it with the refresh token. */
export const ACCESS_TTL_SECONDS = 60 * 60
/** A refresh token that goes unused this long dies, and the person signs in again. */
export const REFRESH_TTL_DAYS = 90
/** A code is for the trip back to Claude, which takes seconds. */
export const CODE_TTL_SECONDS = 5 * 60

/** Registration is unauthenticated by design, so it is capped site-wide. */
export const REGISTRATIONS_PER_HOUR = 100

export const MCP_PATH = '/api/mcp'
export const AUTHORIZE_PATH = '/oauth/authorize'
export const TOKEN_PATH = '/api/oauth/token'
export const REGISTER_PATH = '/api/oauth/register'

/**
 * The origin this request was made to. On Vercel the host header is the one
 * the client used (app.sytenav.com, www.sytenav.com, a preview); the issuer
 * and every endpoint are built from it, because a client checks that the
 * metadata it fetched names the server it fetched it from.
 */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host
  const proto = request.headers.get('x-forwarded-proto') ?? url.protocol.replace(/:$/, '')
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`
}

/** RFC 9728: what /api/mcp is and who issues tokens for it. */
export function protectedResourceMetadata(origin: string) {
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: [origin],
    scopes_supported: [OAUTH_SCOPE],
    bearer_methods_supported: ['header'],
    resource_name: 'SyteNav',
  }
}

/** RFC 8414: where to sign in, register and swap a code. */
export function authorizationServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}${AUTHORIZE_PATH}`,
    token_endpoint: `${origin}${TOKEN_PATH}`,
    registration_endpoint: `${origin}${REGISTER_PATH}`,
    scopes_supported: [OAUTH_SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // S256 ONLY. `plain` is a PKCE that protects nothing - the challenge IS the
    // verifier - and OAuth 2.1 drops it.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  }
}

/** The header on a 401 from /api/mcp that tells Claude where to start. */
export function wwwAuthenticate(origin: string, error?: 'invalid_token'): string {
  const parts = [
    'Bearer realm="sytenav"',
    `resource_metadata="${origin}/.well-known/oauth-protected-resource${MCP_PATH}"`,
    `scope="${OAUTH_SCOPE}"`,
  ]
  if (error) parts.push(`error="${error}"`)
  return parts.join(', ')
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Where a client may ask to be sent back to, or why not.
 *
 * HTTPS, or plain http to THIS MACHINE only (Claude Code and other desktop
 * clients listen on a loopback port, RFC 8252). Never a fragment - the code
 * goes in the query - and never a scheme a browser would execute.
 */
export function redirectUriProblem(uri: unknown): string | null {
  if (typeof uri !== 'string' || !uri.trim()) return 'redirect_uri is required.'
  let u: URL
  try { u = new URL(uri) } catch { return 'redirect_uri is not a valid URL.' }
  if (u.hash) return 'redirect_uri must not carry a fragment.'
  if (u.username || u.password) return 'redirect_uri must not carry credentials.'
  if (u.protocol === 'https:') return null
  if (u.protocol === 'http:' && LOOPBACK.has(u.hostname)) return null
  return 'redirect_uri must be https, or http to localhost.'
}

export type AuthMethod = 'none' | 'client_secret_post' | 'client_secret_basic'

export interface ClientRegistration {
  client_name: string | null
  redirect_uris: string[]
  token_endpoint_auth_method: AuthMethod
}

/** RFC 7591: what a client asked to be registered as, or why not. */
export function registrationProblem(body: unknown): { problem: string } | { client: ClientRegistration } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { problem: 'Send the client metadata as a JSON object.' }
  const b = body as Record<string, unknown>
  const uris = b.redirect_uris
  if (!Array.isArray(uris) || !uris.length) return { problem: 'redirect_uris must be a non-empty list.' }
  if (uris.length > 10) return { problem: 'At most 10 redirect_uris.' }
  for (const u of uris) {
    const p = redirectUriProblem(u)
    if (p) return { problem: p }
  }
  const method = (b.token_endpoint_auth_method ?? 'none') as string
  if (!['none', 'client_secret_post', 'client_secret_basic'].includes(method)) {
    return { problem: `token_endpoint_auth_method ${method} is not supported.` }
  }
  const grants = b.grant_types
  if (Array.isArray(grants) && grants.some(g => g !== 'authorization_code' && g !== 'refresh_token')) {
    return { problem: 'Only the authorization_code and refresh_token grants are supported.' }
  }
  const responses = b.response_types
  if (Array.isArray(responses) && responses.some(r => r !== 'code')) {
    return { problem: 'Only the code response type is supported.' }
  }
  const rawName = typeof b.client_name === 'string' ? b.client_name.trim() : ''
  return {
    client: {
      // A name the CLIENT chose, so it is shown as a claim beside the address
      // the person will be sent back to - that address is the part to trust.
      client_name: rawName ? rawName.slice(0, 100) : null,
      redirect_uris: uris as string[],
      token_endpoint_auth_method: method as AuthMethod,
    },
  }
}

export interface AuthorizeParams {
  response_type?: string | null
  client_id?: string | null
  redirect_uri?: string | null
  code_challenge?: string | null
  code_challenge_method?: string | null
  state?: string | null
  scope?: string | null
  resource?: string | null
}

export function authorizeParams(search: URLSearchParams | Record<string, unknown>): AuthorizeParams {
  const get = (k: string) => {
    const v = search instanceof URLSearchParams ? search.get(k) : search[k]
    return typeof v === 'string' ? v : null
  }
  return {
    response_type: get('response_type'), client_id: get('client_id'), redirect_uri: get('redirect_uri'),
    code_challenge: get('code_challenge'), code_challenge_method: get('code_challenge_method'),
    state: get('state'), scope: get('scope'), resource: get('resource'),
  }
}

/**
 * Is this sign-in request one we can answer, and if not, may we say so by
 * sending the person back?
 *
 * THE ORDER IS THE SECURITY. Until the client is known and the redirect_uri is
 * one IT registered, the request must not redirect anywhere - otherwise this
 * page is an open redirect with our name on it. Only after that are the other
 * problems reported back to the client in the query string.
 */
export function authorizeProblem(
  p: AuthorizeParams,
  client: { redirect_uris: string[] } | null,
): null | { redirectable: false; error: string } | { redirectable: true; error: string; description: string } {
  if (!p.client_id) return { redirectable: false, error: 'This sign-in link is missing its client. Start again from Claude.' }
  if (!client) return { redirectable: false, error: 'This sign-in link names an app SyteNav does not know. Start again from Claude.' }
  if (!p.redirect_uri || !client.redirect_uris.includes(p.redirect_uri)) {
    return { redirectable: false, error: 'This sign-in link would send you somewhere the app never registered, so it has been stopped.' }
  }
  if (p.response_type !== 'code') return { redirectable: true, error: 'unsupported_response_type', description: 'Only response_type=code is supported.' }
  if (!p.code_challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge)) {
    return { redirectable: true, error: 'invalid_request', description: 'PKCE is required: send a code_challenge.' }
  }
  if (p.code_challenge_method !== 'S256') {
    return { redirectable: true, error: 'invalid_request', description: 'code_challenge_method must be S256.' }
  }
  if (p.resource) {
    let path = ''
    try { path = new URL(p.resource).pathname } catch { /* refused below */ }
    if (path.replace(/\/+$/, '') !== MCP_PATH) {
      return { redirectable: true, error: 'invalid_target', description: `resource must be this server's ${MCP_PATH}.` }
    }
  }
  return null
}

/** The redirect_uri with these added to its query, keeping whatever it had. */
export function redirectWith(uri: string, params: Record<string, string | null | undefined>): string {
  const u = new URL(uri)
  for (const [k, v] of Object.entries(params)) if (v != null) u.searchParams.set(k, v)
  return u.toString()
}

/**
 * Where /login may send somebody back to after they sign in on the way to the
 * Allow page - that page and nothing else. It rides in a query string anybody
 * can write, so an absolute URL, `//elsewhere`, or a path that only STARTS
 * with the right words is refused.
 */
export function oauthReturnPath(next: unknown): string | null {
  // The literal prefix IS the check: a string that starts with this exact
  // path and a `?` can only ever resolve to this path on this origin - no
  // scheme, no `//host`, and no dot segment can come before the query.
  if (typeof next !== 'string' || !next.startsWith(`${AUTHORIZE_PATH}?`)) return null
  return next
}

/**
 * Discovery, registration and the token swap may be called from a browser
 * (an MCP client running in a web page). No cookies are involved anywhere in
 * this flow - every credential is in a header or the body - so `*` grants a
 * page nothing it could not already do from a server.
 */
export const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
  'Access-Control-Max-Age': '86400',
}

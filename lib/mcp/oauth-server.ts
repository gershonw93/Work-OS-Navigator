import type { SupabaseClient } from '@supabase/supabase-js'
import { actorForUser, type ActorPerms } from '@/lib/server-permissions'
import {
  hashMcpToken, mcpTokenPrefix, newMcpToken, newOpaque, newRefreshToken, pkceMatches,
} from '@/lib/mcp-token'
import { actorProblem } from './tools'
import {
  ACCESS_TTL_SECONDS, CODE_TTL_SECONDS, OAUTH_SCOPE, REFRESH_TTL_DAYS, REGISTRATIONS_PER_HOUR,
  authorizeProblem, redirectWith, registrationProblem, type AuthorizeParams,
} from './oauth'

// ─────────────────────────────────────────────────────────────────────────────
// Sign in with SyteNav, for Claude - the half that stores things.
//
// Every function takes the database and returns an answer; the routes only
// parse the request and write the response, so the rules can be run against a
// fake database in `lib/__tests__/mcp-oauth.ts`.
//
// THE RULES THAT COST SOMETHING IF BROKEN:
//   - A code is good ONCE. It is claimed with a conditional UPDATE (used_at IS
//     NULL), never a read-then-write - two exchanges racing would both win a
//     check-then-act, the same reason QuickBooks pushes take an atomic claim.
//   - PKCE always. The code is useless without the verifier only Claude holds.
//   - A refresh token ROTATES, by the same conditional update on the old hash,
//     so a stolen one that is used after the real one simply fails.
//   - The person's ROLE is asked again at every exchange and every refresh, so
//     somebody moved to a field role stops reading at the next renewal.
//   - Errors say what an OAuth client expects (`invalid_grant`), and a failed
//     read is a 500, never a token.
// ─────────────────────────────────────────────────────────────────────────────

export interface OAuthReply { status: number; body: Record<string, unknown> }

const oauthError = (status: number, error: string, description: string): OAuthReply =>
  ({ status, body: { error, error_description: description } })

const failed = (what: string, error: { message: string }): OAuthReply => {
  console.error(`[oauth] ${what}:`, error.message)
  return oauthError(500, 'server_error', 'SyteNav could not complete that just now. Try again.')
}

const nowIso = () => new Date().toISOString()
const inSeconds = (s: number) => new Date(Date.now() + s * 1000).toISOString()

interface ClientRow {
  client_id: string
  client_secret_hash: string | null
  client_name: string | null
  redirect_uris: string[]
  token_endpoint_auth_method: string
}

// ── registration (RFC 7591) ─────────────────────────────────────────────────

export async function registerClient(db: SupabaseClient, body: unknown): Promise<OAuthReply> {
  const parsed = registrationProblem(body)
  if ('problem' in parsed) return oauthError(400, 'invalid_client_metadata', parsed.problem)

  // Anybody may register - that is what dynamic registration is - so the
  // whole site is capped per hour. A count that could not be read REFUSES:
  // an unread limit on a public endpoint is no limit.
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count, error: countErr } = await db.from('oauth_clients')
    .select('client_id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countErr) return failed('registration count', countErr)
  if ((count ?? 0) >= REGISTRATIONS_PER_HOUR) {
    return oauthError(429, 'temporarily_unavailable', 'Too many apps registered in the last hour. Try again later.')
  }

  const c = parsed.client
  const clientId = `snvc_${newOpaque(18)}`
  const secret = c.token_endpoint_auth_method === 'none' ? null : newOpaque(32)
  const { error } = await db.from('oauth_clients').insert({
    client_id: clientId,
    client_secret_hash: secret ? hashMcpToken(secret) : null,
    client_name: c.client_name,
    redirect_uris: c.redirect_uris,
    token_endpoint_auth_method: c.token_endpoint_auth_method,
  })
  if (error) return failed('registration insert', error)

  return {
    status: 201,
    body: {
      client_id: clientId,
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: c.client_name ?? undefined,
      redirect_uris: c.redirect_uris,
      token_endpoint_auth_method: c.token_endpoint_auth_method,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      scope: OAUTH_SCOPE,
    },
  }
}

/** The client, null when there is none, or 'failed' when it could not be read. */
async function loadClient(db: SupabaseClient, clientId: string | null | undefined): Promise<ClientRow | null | 'failed'> {
  if (!clientId) return null
  const { data, error } = await db.from('oauth_clients')
    .select('client_id, client_secret_hash, client_name, redirect_uris, token_endpoint_auth_method')
    .eq('client_id', clientId)
    .maybeSingle()
  if (error) { console.error('[oauth] client read:', error.message); return 'failed' }
  return (data as ClientRow | null) ?? null
}

// ── the Allow page ──────────────────────────────────────────────────────────

export type AuthorizeCheck =
  | { ok: true; clientName: string | null; returnHost: string }
  | { ok: false; error: string; redirect?: string }

/** Can this sign-in request be shown to the person at all? Asked before the Allow page renders. */
export async function checkAuthorize(db: SupabaseClient, p: AuthorizeParams): Promise<AuthorizeCheck> {
  const client = await loadClient(db, p.client_id)
  if (client === 'failed') return { ok: false, error: 'SyteNav could not check this sign-in just now. Try again from Claude.' }
  const problem = authorizeProblem(p, client)
  if (problem) {
    if (!problem.redirectable) return { ok: false, error: problem.error }
    return {
      ok: false,
      error: 'This sign-in request was not complete, so it could not be finished.',
      redirect: redirectWith(p.redirect_uri!, { error: problem.error, error_description: problem.description, state: p.state }),
    }
  }
  return { ok: true, clientName: client!.client_name, returnHost: new URL(p.redirect_uri!).host }
}

/**
 * The person pressed Allow or Cancel. Everything is checked again here - the
 * page's earlier check is for showing the page, this one is the one that
 * counts, because a request can be posted without ever loading the page.
 */
export async function decideAuthorize(
  db: SupabaseClient, actor: ActorPerms, p: AuthorizeParams, allow: boolean,
): Promise<{ redirect: string } | { error: string; redirect?: string }> {
  const check = await checkAuthorize(db, p)
  if (!check.ok) return check.redirect ? { error: check.error, redirect: check.redirect } : { error: check.error }

  if (!allow) {
    return { redirect: redirectWith(p.redirect_uri!, { error: 'access_denied', error_description: 'The person declined.', state: p.state }) }
  }

  const who = actorProblem(actor)
  if (who) {
    return {
      error: who,
      redirect: redirectWith(p.redirect_uri!, { error: 'access_denied', error_description: who, state: p.state }),
    }
  }

  const code = newOpaque(32)
  const { error } = await db.from('oauth_codes').insert({
    code_hash: hashMcpToken(code),
    client_id: p.client_id,
    profile_id: actor.userId,
    redirect_uri: p.redirect_uri,
    code_challenge: p.code_challenge,
    resource: p.resource ?? null,
    expires_at: inSeconds(CODE_TTL_SECONDS),
  })
  if (error) {
    console.error('[oauth] code insert:', error.message)
    return { error: 'SyteNav could not finish signing you in. Try again from Claude.' }
  }
  return { redirect: redirectWith(p.redirect_uri!, { code, state: p.state }) }
}

// ── the token endpoint ──────────────────────────────────────────────────────

export interface TokenRequest {
  grant_type?: string | null
  code?: string | null
  redirect_uri?: string | null
  code_verifier?: string | null
  refresh_token?: string | null
  client_id?: string | null
  client_secret?: string | null
}

/** Who the client says it is, from the body or HTTP Basic, checked against what it registered. */
async function authenticateClient(
  db: SupabaseClient, req: TokenRequest,
): Promise<{ client: ClientRow } | { reply: OAuthReply }> {
  const client = await loadClient(db, req.client_id)
  if (client === 'failed') return { reply: oauthError(500, 'server_error', 'SyteNav could not complete that just now. Try again.') }
  if (!client) return { reply: oauthError(401, 'invalid_client', 'Unknown client.') }
  if (client.token_endpoint_auth_method !== 'none') {
    if (!req.client_secret || !client.client_secret_hash || hashMcpToken(req.client_secret) !== client.client_secret_hash) {
      return { reply: oauthError(401, 'invalid_client', 'The client secret is wrong.') }
    }
  }
  return { client }
}

/** Mint the connection: one `mcp_tokens` row, which is what the Settings card lists. */
async function issueTokens(db: SupabaseClient, profileId: string, client: ClientRow): Promise<OAuthReply> {
  const access = newMcpToken()
  const refresh = newRefreshToken()

  // Signing in again from the same app REPLACES the connection rather than
  // stacking a second one beside it on the Settings card.
  const { error: oldErr } = await db.from('mcp_tokens')
    .update({ revoked_at: nowIso() })
    .eq('profile_id', profileId)
    .eq('oauth_client_id', client.client_id)
    .is('revoked_at', null)
  if (oldErr) console.error('[oauth] retiring the previous connection:', oldErr.message)

  const { error } = await db.from('mcp_tokens').insert({
    profile_id: profileId,
    name: `${client.client_name || 'An app'} (signed in)`.slice(0, 60),
    token_hash: hashMcpToken(access),
    token_prefix: mcpTokenPrefix(access),
    oauth_client_id: client.client_id,
    expires_at: inSeconds(ACCESS_TTL_SECONDS),
    refresh_hash: hashMcpToken(refresh),
    refresh_expires_at: inSeconds(REFRESH_TTL_DAYS * 24 * 60 * 60),
  })
  if (error) return failed('token insert', error)
  return tokenReply(access, refresh)
}

const tokenReply = (access: string, refresh: string): OAuthReply => ({
  status: 200,
  body: {
    access_token: access,
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    refresh_token: refresh,
    scope: OAUTH_SCOPE,
  },
})

/** May this person still read SyteNav through Claude? Asked at every exchange and renewal. */
async function stillAllowed(db: SupabaseClient, profileId: string): Promise<string | null> {
  return actorProblem(await actorForUser(db, profileId))
}

export async function exchangeToken(db: SupabaseClient, req: TokenRequest): Promise<OAuthReply> {
  if (req.grant_type === 'authorization_code') return exchangeCode(db, req)
  if (req.grant_type === 'refresh_token') return refreshTokens(db, req)
  return oauthError(400, 'unsupported_grant_type', 'Use authorization_code or refresh_token.')
}

async function exchangeCode(db: SupabaseClient, req: TokenRequest): Promise<OAuthReply> {
  if (!req.code || !req.code_verifier || !req.redirect_uri) {
    return oauthError(400, 'invalid_request', 'code, code_verifier and redirect_uri are required.')
  }
  const auth = await authenticateClient(db, req)
  if ('reply' in auth) return auth.reply

  // THE CLAIM. Good once, and only while fresh - decided by the database in
  // one statement, so two exchanges of one code cannot both get a token.
  const { data, error } = await db.from('oauth_codes')
    .update({ used_at: nowIso() })
    .eq('code_hash', hashMcpToken(req.code))
    .is('used_at', null)
    .gt('expires_at', nowIso())
    .select('client_id, profile_id, redirect_uri, code_challenge')
    .maybeSingle()
  if (error) return failed('code claim', error)
  if (!data) return oauthError(400, 'invalid_grant', 'That code is unknown, expired or already used. Sign in again.')

  const row = data as { client_id: string; profile_id: string; redirect_uri: string; code_challenge: string }
  if (row.client_id !== auth.client.client_id) return oauthError(400, 'invalid_grant', 'That code was issued to a different app.')
  if (row.redirect_uri !== req.redirect_uri) return oauthError(400, 'invalid_grant', 'redirect_uri does not match the sign-in request.')
  if (!pkceMatches(req.code_verifier, row.code_challenge)) return oauthError(400, 'invalid_grant', 'code_verifier does not match.')

  const who = await stillAllowed(db, row.profile_id)
  if (who) return oauthError(400, 'invalid_grant', who)

  return issueTokens(db, row.profile_id, auth.client)
}

async function refreshTokens(db: SupabaseClient, req: TokenRequest): Promise<OAuthReply> {
  if (!req.refresh_token) return oauthError(400, 'invalid_request', 'refresh_token is required.')
  const auth = await authenticateClient(db, req)
  if ('reply' in auth) return auth.reply

  const oldHash = hashMcpToken(req.refresh_token)
  const { data: found, error: findErr } = await db.from('mcp_tokens')
    .select('id, profile_id, oauth_client_id, refresh_expires_at')
    .eq('refresh_hash', oldHash)
    .is('revoked_at', null)
    .maybeSingle()
  if (findErr) return failed('refresh lookup', findErr)
  const row = found as { id: string; profile_id: string; oauth_client_id: string | null; refresh_expires_at: string | null } | null
  if (!row || !row.refresh_expires_at || Date.parse(row.refresh_expires_at) <= Date.now()) {
    return oauthError(400, 'invalid_grant', 'That refresh token is unknown, expired or revoked. Sign in again.')
  }
  if (row.oauth_client_id !== auth.client.client_id) return oauthError(400, 'invalid_grant', 'That refresh token belongs to a different app.')

  const who = await stillAllowed(db, row.profile_id)
  if (who) {
    const { error: revErr } = await db.from('mcp_tokens').update({ revoked_at: nowIso() }).eq('id', row.id)
    if (revErr) console.error('[oauth] revoking a connection the role no longer allows:', revErr.message)
    return oauthError(400, 'invalid_grant', who)
  }

  // ROTATE, conditionally on the OLD refresh hash: if two renewals race, or a
  // stolen copy is replayed after the real one, only the first matches.
  const access = newMcpToken()
  const refresh = newRefreshToken()
  const { data: rotated, error } = await db.from('mcp_tokens')
    .update({
      token_hash: hashMcpToken(access),
      token_prefix: mcpTokenPrefix(access),
      expires_at: inSeconds(ACCESS_TTL_SECONDS),
      refresh_hash: hashMcpToken(refresh),
      refresh_expires_at: inSeconds(REFRESH_TTL_DAYS * 24 * 60 * 60),
    })
    .eq('id', row.id)
    .eq('refresh_hash', oldHash)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) return failed('refresh rotate', error)
  if (!rotated) return oauthError(400, 'invalid_grant', 'That refresh token was already used. Sign in again.')
  return tokenReply(access, refresh)
}

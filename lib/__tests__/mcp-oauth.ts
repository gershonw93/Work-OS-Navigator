// Sign in with SyteNav, for Claude - the OAuth half of the MCP server.
//
// What must hold, and why each is here:
//   - The Allow page is never an OPEN REDIRECT: until the client is known and
//     the return address is one it registered, nothing redirects anywhere.
//   - PKCE, S256 only, always.
//   - A code is good ONCE and only while fresh, decided by the database in one
//     conditional UPDATE - a read-then-write lets two exchanges both win.
//   - A refresh token ROTATES on the same conditional update, so a replayed
//     copy fails.
//   - Only hashes are stored: never the code, the token or the secret.
//   - The person's role is asked again at every exchange and renewal.
//   - /login follows `next` back to the Allow page and nowhere else.

import {
  authorizeProblem, authorizationServerMetadata, oauthReturnPath, protectedResourceMetadata,
  redirectUriProblem, registrationProblem, requestOrigin, wwwAuthenticate, REGISTRATIONS_PER_HOUR,
  authorizeParams,
} from '../mcp/oauth'
import { registerClient, decideAuthorize, exchangeToken } from '../mcp/oauth-server'
import { hashMcpToken, pkceMatches, isMcpToken, REFRESH_TOKEN_PREFIX } from '../mcp-token'
import { getEffectivePermissions, getRoleDefaults } from '../permissions'
import type { ActorPerms } from '../server-permissions'
import { createHash } from 'crypto'
import { ok, done, code, read } from './_helpers'

// ── a fake database that records every query ────────────────────────────────
//
// Each call to `from(table)` records its operations; `answer(table, ops)`
// decides what comes back. The assertions read the ops, because "the claim
// carries used_at IS NULL" is a fact about the QUERY, not about the result.
type Op = [string, ...unknown[]]
type Call = { table: string; ops: Op[] }
type Answer = { data?: unknown; error?: { message: string } | null; count?: number }

function fakeDb(answer: (table: string, ops: Op[]) => Answer) {
  const calls: Call[] = []
  const db: any = {
    from(table: string) {
      const call: Call = { table, ops: [] }
      calls.push(call)
      const settle = () => {
        const a = answer(table, call.ops)
        return { data: a.data ?? null, error: a.error ?? null, count: a.count ?? null }
      }
      const chain: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === 'then') return (resolve: any) => resolve(settle())
          return (...args: unknown[]) => {
            call.ops.push([prop, ...args])
            if (prop === 'maybeSingle' || prop === 'single') return Promise.resolve(settle())
            return chain
          }
        },
      })
      return chain
    },
  }
  return { db, calls }
}
const has = (ops: Op[], method: string, ...args: unknown[]) =>
  ops.some(([m, ...a]) => m === method && args.every((x, i) => a[i] === x))
const opArg = (ops: Op[], method: string) => ops.find(([m]) => m === method)?.[1] as any

const ORIGIN = 'https://app.sytenav.com'
const CLAUDE_CB = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'dBjftJeZ4CVP-mJ0moQsOyFbUiyXo7W3iE0F6x5gBu1zf6xwBQ0'
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url')
const CLIENT = { client_id: 'snvc_x', client_secret_hash: null, client_name: 'Claude', redirect_uris: [CLAUDE_CB], token_endpoint_auth_method: 'none' }

const actor = (role: string): ActorPerms => ({
  userId: 'u1', role, companyId: 'c1', permissions: getEffectivePermissions(role, null, getRoleDefaults(role)),
})

async function main() {
  // ── discovery ─────────────────────────────────────────────────────────────
  const pr = protectedResourceMetadata(ORIGIN)
  ok(pr.resource === `${ORIGIN}/api/mcp` && pr.authorization_servers[0] === ORIGIN, 'the protected resource is /api/mcp and SyteNav issues for it')
  const as = authorizationServerMetadata(ORIGIN)
  ok(as.issuer === ORIGIN, 'the issuer is the origin the metadata was fetched from')
  ok(as.authorization_endpoint === `${ORIGIN}/oauth/authorize` && as.token_endpoint === `${ORIGIN}/api/oauth/token`
    && as.registration_endpoint === `${ORIGIN}/api/oauth/register`, 'it names where to sign in, swap and register')
  ok(JSON.stringify(as.code_challenge_methods_supported) === '["S256"]', 'PKCE: S256 and nothing else is offered')
  const www = wwwAuthenticate(ORIGIN)
  ok(www.includes(`resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`),
    'a 401 from /api/mcp tells Claude where the sign-in is - the whole of "add by URL" starts here')
  ok(wwwAuthenticate(ORIGIN, 'invalid_token').includes('error="invalid_token"'), '...and says invalid_token when one was refused')
  const req = new Request('http://internal/api/oauth/authorization-server', { headers: { 'x-forwarded-host': 'app.sytenav.com', 'x-forwarded-proto': 'https' } })
  ok(requestOrigin(req) === ORIGIN, 'the origin comes from the host the client used, not the internal URL')

  // ── where a client may be sent back to ────────────────────────────────────
  ok(redirectUriProblem(CLAUDE_CB) === null, 'an https callback is fine')
  ok(redirectUriProblem('http://localhost:33418/callback') === null && redirectUriProblem('http://127.0.0.1:9/cb') === null,
    'plain http to THIS machine is fine (Claude Code listens on a loopback port)')
  for (const bad of ['http://evil.example/cb', 'javascript:alert(1)', 'https://x.example/cb#frag', 'https://u:p@x.example/', '', 'not a url']) {
    ok(redirectUriProblem(bad) !== null, `refused as a return address: ${JSON.stringify(bad)}`)
  }
  ok('problem' in registrationProblem({ redirect_uris: ['http://evil.example/cb'] }), 'a registration with a bad return address is refused')
  ok('problem' in registrationProblem({ redirect_uris: [CLAUDE_CB], grant_types: ['client_credentials'] }), '...and one asking for a grant we do not do')
  const reg = registrationProblem({ redirect_uris: [CLAUDE_CB], client_name: 'x'.repeat(300) })
  ok('client' in reg && reg.client.client_name!.length === 100 && reg.client.token_endpoint_auth_method === 'none',
    'a good registration defaults to a public client, with its self-chosen name capped')

  // ── the sign-in request, and THE OPEN REDIRECT ────────────────────────────
  const good = { response_type: 'code', client_id: 'snvc_x', redirect_uri: CLAUDE_CB, code_challenge: CHALLENGE, code_challenge_method: 'S256', state: 's1', resource: `${ORIGIN}/api/mcp` }
  ok(authorizeProblem(good, CLIENT) === null, 'a complete request from a known client passes')
  const unknown = authorizeProblem(good, null)
  ok(!!unknown && unknown.redirectable === false, 'an UNKNOWN client is never redirected back to (we cannot know the address is theirs)')
  const elsewhere = authorizeProblem({ ...good, redirect_uri: 'https://evil.example/cb' }, CLIENT)
  ok(!!elsewhere && elsewhere.redirectable === false,
    'A RETURN ADDRESS THE CLIENT NEVER REGISTERED IS NEVER FOLLOWED - otherwise this page is an open redirect with our name on it')
  const noPkce = authorizeProblem({ ...good, code_challenge: null }, CLIENT)
  ok(!!noPkce && noPkce.redirectable === true && noPkce.error === 'invalid_request', 'no PKCE: refused, and the client is told')
  const plain = authorizeProblem({ ...good, code_challenge_method: 'plain' }, CLIENT)
  ok(!!plain && plain.error === 'invalid_request', '`plain` PKCE is refused - the challenge would BE the verifier')
  const target = authorizeProblem({ ...good, resource: `${ORIGIN}/api/other` }, CLIENT)
  ok(!!target && target.error === 'invalid_target', 'a token for some other resource is refused')
  ok(authorizeParams(new URLSearchParams('client_id=a&state=b')).state === 'b', 'the request is read off the query string')

  // ── /login comes back here and nowhere else ───────────────────────────────
  const back = '/oauth/authorize?client_id=snvc_x&state=s1'
  ok(oauthReturnPath(back) === back, '/login returns to the Allow page with the request intact')
  for (const bad of ['//evil.example/oauth/authorize?x=1', 'https://evil.example/oauth/authorize?x=1', '/oauth/authorize/../dashboard?x=1',
    '/oauth/authorizeX?x=1', '/dashboard', '/oauth/authorize', null]) {
    ok(oauthReturnPath(bad) === null, `...and is not sent anywhere else: ${JSON.stringify(bad)}`)
  }

  // ── PKCE itself ───────────────────────────────────────────────────────────
  // The challenge is computed HERE, by the test, as RFC 7636 defines it:
  // base64url(SHA-256(verifier)) with no padding.
  ok(!CHALLENGE.includes('=') && pkceMatches(VERIFIER, CHALLENGE), 'a verifier matches the S256 challenge made from it')
  ok(!pkceMatches(VERIFIER + 'x', CHALLENGE), 'a different verifier does not')
  ok(!pkceMatches('short', CHALLENGE) && !pkceMatches(undefined, CHALLENGE), 'a verifier too short to be one does not')

  // ── registration ──────────────────────────────────────────────────────────
  {
    const { db, calls } = fakeDb(t => t === 'oauth_clients' ? { count: REGISTRATIONS_PER_HOUR } : {})
    const r = await registerClient(db, { redirect_uris: [CLAUDE_CB] })
    ok(r.status === 429 && !calls.some(c => has(c.ops, 'insert')), 'over the hourly cap: refused, nothing written')
  }
  {
    const { db, calls } = fakeDb(t => t === 'oauth_clients' ? { error: { message: 'down' } } : {})
    const r = await registerClient(db, { redirect_uris: [CLAUDE_CB] })
    ok(r.status === 500 && !calls.some(c => has(c.ops, 'insert')),
      'A CAP THAT COULD NOT BE READ REFUSES - an unread limit on a public endpoint is no limit')
  }
  {
    const { db, calls } = fakeDb(() => ({ count: 0 }))
    const pub = await registerClient(db, { redirect_uris: [CLAUDE_CB], client_name: 'Claude' })
    ok(pub.status === 201 && String(pub.body.client_id).startsWith('snvc_') && !('client_secret' in pub.body),
      'a public client is registered with an id and no secret')
    const conf = await registerClient(db, { redirect_uris: [CLAUDE_CB], token_endpoint_auth_method: 'client_secret_post' })
    const secret = conf.body.client_secret as string
    const stored = calls.filter(c => c.table === 'oauth_clients').map(c => opArg(c.ops, 'insert')).filter(Boolean)
    ok(!!secret && stored.some(r => r.client_secret_hash === hashMcpToken(secret)) && !JSON.stringify(stored).includes(secret),
      'a confidential client gets its secret ONCE; only the hash is stored')
  }

  // ── the Allow decision ────────────────────────────────────────────────────
  const clientAnswer = (t: string): Answer => t === 'oauth_clients' ? { data: CLIENT } : {}
  {
    const { db, calls } = fakeDb(clientAnswer)
    const r: any = await decideAuthorize(db, actor('admin'), good, false)
    const u = new URL(r.redirect)
    ok(u.searchParams.get('error') === 'access_denied' && u.searchParams.get('state') === 's1' && !calls.some(c => c.table === 'oauth_codes'),
      'Cancel goes back to Claude with access_denied and its state, and issues nothing')
  }
  {
    const { db, calls } = fakeDb(clientAnswer)
    const r: any = await decideAuthorize(db, actor('worker'), good, true)
    ok(!!r.error && new URL(r.redirect).searchParams.get('error') === 'access_denied' && !calls.some(c => c.table === 'oauth_codes'),
      'an ASSIGNED-ONLY role pressing Allow is refused in words, sent back denied, and no code exists')
  }
  {
    const { db, calls } = fakeDb(clientAnswer)
    const r: any = await decideAuthorize(db, actor('admin'), { ...good, redirect_uri: 'https://evil.example/cb' }, true)
    ok(!!r.error && !r.redirect && !calls.some(c => c.table === 'oauth_codes'),
      'the POST checks the return address again - a request can be posted without ever loading the page')
  }
  {
    const { db, calls } = fakeDb(clientAnswer)
    const r: any = await decideAuthorize(db, actor('admin'), good, true)
    const u = new URL(r.redirect)
    const issued = u.searchParams.get('code')!
    const row = opArg(calls.find(c => c.table === 'oauth_codes')!.ops, 'insert')
    ok(u.origin + u.pathname === CLAUDE_CB && u.searchParams.get('state') === 's1' && !!issued, 'Allow sends Claude back with a code and its state')
    ok(row.code_hash === hashMcpToken(issued) && !JSON.stringify(row).includes(issued), 'only the code\'s HASH is stored')
    ok(row.code_challenge === CHALLENGE && row.profile_id === 'u1' && row.redirect_uri === CLAUDE_CB,
      'the code is bound to the challenge, the person and the return address')
  }

  // ── the token swap ────────────────────────────────────────────────────────
  const codeRow = { client_id: 'snvc_x', profile_id: 'u1', redirect_uri: CLAUDE_CB, code_challenge: CHALLENGE }
  const swap = { grant_type: 'authorization_code', code: 'the-code', code_verifier: VERIFIER, redirect_uri: CLAUDE_CB, client_id: 'snvc_x' }
  function tokenDb(opts: { claim?: unknown; role?: string; client?: unknown } = {}) {
    return fakeDb((t, ops) => {
      if (t === 'oauth_clients') return { data: 'client' in opts ? opts.client : CLIENT }
      if (t === 'oauth_codes') return { data: 'claim' in opts ? opts.claim : codeRow }
      if (t === 'profiles') return { data: { role: opts.role ?? 'admin', permission_overrides: null, company_id: 'c1' } }
      if (t === 'company_roles') return { data: [] }
      return {}
    })
  }
  {
    const { db, calls } = tokenDb()
    const r = await exchangeToken(db, swap)
    const claim = calls.find(c => c.table === 'oauth_codes')!
    ok(has(claim.ops, 'update') && has(claim.ops, 'is', 'used_at', null) && claim.ops.some(([m, k]) => m === 'gt' && k === 'expires_at'),
      'THE CLAIM is one conditional UPDATE - used_at IS NULL and not expired - never a read then a write')
    ok(has(claim.ops, 'eq', 'code_hash', hashMcpToken('the-code')), '...looked up by the code\'s hash')
    const access = r.body.access_token as string
    const refresh = r.body.refresh_token as string
    ok(r.status === 200 && isMcpToken(access) && refresh.startsWith(REFRESH_TOKEN_PREFIX) && !isMcpToken(refresh),
      'a good swap returns an access token the MCP route accepts, and a refresh token it does NOT')
    ok(r.body.token_type === 'Bearer' && r.body.expires_in === 3600, 'Bearer, good for an hour')
    const minted = calls.filter(c => c.table === 'mcp_tokens').map(c => opArg(c.ops, 'insert')).find(Boolean)
    ok(!!minted && minted.token_hash === hashMcpToken(access) && minted.refresh_hash === hashMcpToken(refresh)
      && !JSON.stringify(minted).includes(access) && !JSON.stringify(minted).includes(refresh),
      'THE LOGIN MINTS AN mcp_tokens ROW, storing only hashes - the same kind of connection the Settings card lists and revokes')
    ok(minted?.oauth_client_id === 'snvc_x' && !!minted?.expires_at && !!minted?.refresh_expires_at, '...tied to its app, with both expiries')
    ok(calls.some(c => c.table === 'mcp_tokens' && has(c.ops, 'update') && has(c.ops, 'eq', 'oauth_client_id', 'snvc_x')),
      'signing in again from the same app REPLACES the old connection rather than stacking another')
  }
  {
    const { db, calls } = tokenDb({ claim: null })
    const r = await exchangeToken(db, swap)
    ok(r.status === 400 && r.body.error === 'invalid_grant' && !calls.some(c => c.table === 'mcp_tokens'),
      'A CODE ALREADY USED (or expired, or unknown) gets invalid_grant and no token')
  }
  {
    const { db, calls } = tokenDb()
    const r = await exchangeToken(db, { ...swap, code_verifier: VERIFIER.slice(0, -1) + 'X' })
    ok(r.body.error === 'invalid_grant' && !calls.some(c => c.table === 'mcp_tokens'), 'a wrong PKCE verifier gets no token - a stolen code is useless')
  }
  {
    const { db, calls } = tokenDb()
    const r = await exchangeToken(db, { ...swap, redirect_uri: 'https://claude.ai/other' })
    ok(r.body.error === 'invalid_grant' && !calls.some(c => c.table === 'mcp_tokens'), 'a return address that differs from the sign-in gets no token')
  }
  {
    const { db, calls } = tokenDb({ claim: { ...codeRow, client_id: 'snvc_other' } })
    const r = await exchangeToken(db, swap)
    ok(r.body.error === 'invalid_grant' && !calls.some(c => c.table === 'mcp_tokens'), 'a code issued to another app gets no token')
  }
  {
    const { db, calls } = tokenDb({ role: 'worker' })
    const r = await exchangeToken(db, swap)
    ok(r.body.error === 'invalid_grant' && !calls.some(c => c.table === 'mcp_tokens'),
      'THE ROLE IS ASKED AGAIN at the swap: somebody moved to a field role since pressing Allow gets nothing')
  }
  {
    const { db } = tokenDb({ client: null })
    const r = await exchangeToken(db, swap)
    ok(r.status === 401 && r.body.error === 'invalid_client', 'an unknown client is invalid_client')
  }
  {
    const conf = { ...CLIENT, token_endpoint_auth_method: 'client_secret_post', client_secret_hash: hashMcpToken('right') }
    const { db, calls } = tokenDb({ client: conf })
    const r = await exchangeToken(db, { ...swap, client_secret: 'wrong' })
    ok(r.body.error === 'invalid_client' && !calls.some(c => c.table === 'oauth_codes'),
      'a confidential client with the wrong secret is refused BEFORE its code is spent')
  }
  ok((await exchangeToken(fakeDb(() => ({})).db, { grant_type: 'password' })).body.error === 'unsupported_grant_type',
    'any other grant is unsupported_grant_type')

  // ── renewal ───────────────────────────────────────────────────────────────
  const future = new Date(Date.now() + 86400000).toISOString()
  const past = new Date(Date.now() - 1000).toISOString()
  function refreshDb(opts: { row?: unknown; rotated?: unknown; role?: string } = {}) {
    return fakeDb((t, ops) => {
      if (t === 'oauth_clients') return { data: CLIENT }
      if (t === 'profiles') return { data: { role: opts.role ?? 'admin', permission_overrides: null, company_id: 'c1' } }
      if (t === 'company_roles') return { data: [] }
      if (t === 'mcp_tokens' && has(ops, 'select', 'id, profile_id, oauth_client_id, refresh_expires_at, can_write')) {
        return { data: 'row' in opts ? opts.row : { id: 't1', profile_id: 'u1', oauth_client_id: 'snvc_x', refresh_expires_at: future } }
      }
      if (t === 'mcp_tokens' && has(ops, 'update') && has(ops, 'select', 'id')) return { data: 'rotated' in opts ? opts.rotated : { id: 't1' } }
      return {}
    })
  }
  const renew = { grant_type: 'refresh_token', refresh_token: 'snvr_old', client_id: 'snvc_x' }
  {
    const { db, calls } = refreshDb()
    const r = await exchangeToken(db, renew)
    const rotate = calls.find(c => c.table === 'mcp_tokens' && has(c.ops, 'update') && has(c.ops, 'select', 'id'))!
    ok(r.status === 200 && isMcpToken(r.body.access_token as string) && r.body.refresh_token !== 'snvr_old', 'a renewal returns a new access AND a new refresh token')
    ok(has(rotate.ops, 'eq', 'refresh_hash', hashMcpToken('snvr_old')),
      'THE ROTATION is conditional on the OLD refresh hash - a replayed copy cannot also win')
  }
  {
    const { db } = refreshDb({ rotated: null })
    ok((await exchangeToken(db, renew)).body.error === 'invalid_grant', 'a refresh token already rotated away gets invalid_grant')
  }
  {
    const { db } = refreshDb({ row: { id: 't1', profile_id: 'u1', oauth_client_id: 'snvc_x', refresh_expires_at: past } })
    ok((await exchangeToken(db, renew)).body.error === 'invalid_grant', 'an expired refresh token gets invalid_grant')
  }
  {
    const { db } = refreshDb({ row: { id: 't1', profile_id: 'u1', oauth_client_id: 'snvc_other', refresh_expires_at: future } })
    ok((await exchangeToken(db, renew)).body.error === 'invalid_grant', "another app's refresh token gets invalid_grant")
  }
  {
    const { db, calls } = refreshDb({ role: 'worker' })
    const r = await exchangeToken(db, renew)
    ok(r.body.error === 'invalid_grant' && calls.some(c => c.table === 'mcp_tokens' && has(c.ops, 'update') && JSON.stringify(opArg(c.ops, 'update')).includes('revoked_at')),
      'a role that no longer allows it: the renewal fails AND the connection is revoked')
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  const cfg = read('next.config.mjs')
  for (const p of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-authorization-server']) {
    ok(cfg.includes(`source: '${p}'`) && cfg.includes(`source: '${p}/:path*'`), `${p} is served, bare and suffixed with the resource path`)
  }
  const mcp = code('app/api/mcp/route.ts')
  ok(/'WWW-Authenticate': wwwAuthenticate\(/.test(mcp), 'the MCP 401 carries the discovery header')
  ok(/expires_at/.test(mcp) && /'expired'/.test(mcp), 'the MCP route refuses a sign-in token past its hour')
  ok(/oauthReturnPath\(next\)/.test(code('app/(auth)/login/page.tsx')), '/login follows `next` back to the Allow page')
  ok(read('lib/hosts.ts').includes("'/oauth',"), 'the Allow page lives on the app host, where the session is')
  ok(/'Cache-Control': 'no-store'/.test(code('app/api/oauth/token/route.ts')), 'a token response is never cached')
  const page = code('app/(auth)/oauth/authorize/page.tsx')
  ok(page.includes('{phase.returnHost}') && page.includes('cannot change anything'),
    'the Allow page names where you will be sent back to, and says the connection cannot change anything')
  ok(!/\bconfirm\(|\balert\(/.test(page), 'no native confirm/alert on the Allow page')

  done()
}

main()

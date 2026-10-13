import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorForUser, type ActorPerms } from '@/lib/server-permissions'
import { hashMcpToken, isMcpToken } from '@/lib/mcp-token'
import { handleRpc, rpcError, RPC } from '@/lib/mcp/protocol'
import { requestOrigin, wwwAuthenticate } from '@/lib/mcp/oauth'
import { TOOLS, callTool } from '@/lib/mcp/tools'

// ─────────────────────────────────────────────────────────────────────────────
// The SyteNav MCP server - how Claude reads a person's jobs.
//
// Streamable HTTP, stateless: one JSON-RPC message per POST, one JSON reply.
// The protocol is `lib/mcp/protocol.ts`, the tools and every permission gate
// are `lib/mcp/tools.ts`; this file only works out WHO is asking.
//
// TWO CREDENTIALS, ONE PERSON. A personal token (`snv_...`, made on Settings ->
// Integrations) for Claude Desktop and Claude Code, or an ordinary SyteNav
// session token. Either way the answer is an `ActorPerms` from the same
// resolver the app uses, so Claude can read exactly what that person can.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * 401 with directions. `WWW-Authenticate` names the protected-resource
 * metadata, which is how Claude finds the SyteNav sign-in on its own - the
 * whole of "add it by URL" starts from this header.
 */
function unauthorized(request: Request, message: string, expired = false) {
  return NextResponse.json(
    rpcError(null, RPC.INVALID_REQUEST, message),
    { status: 401, headers: { 'WWW-Authenticate': wwwAuthenticate(requestOrigin(request), expired ? 'invalid_token' : undefined) } },
  )
}

/**
 * Who this request is, or null. A revoked token is the same null as a wrong
 * one. 'expired' is a token from a Claude sign-in past its hour: said
 * separately, because the client answers it by renewing, not by signing in.
 */
async function actorFor(db: SupabaseClient, token: string): Promise<ActorPerms | null | 'expired'> {
  if (!isMcpToken(token)) return getActor(db, token)

  const { data, error } = await db.from('mcp_tokens')
    .select('id, profile_id, expires_at')
    .eq('token_hash', hashMcpToken(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (error) {
    // A failed lookup is not a verdict on the token - but there is nothing
    // else to answer with, so say it in the log where it can be told apart.
    console.error('[mcp] token lookup failed:', error.message)
    return null
  }
  if (!data) return null
  // NULL is a personal token from Settings, which does not expire.
  if (data.expires_at && Date.parse(data.expires_at) <= Date.now()) return 'expired'

  // When it was last used is what lets somebody spot a connection they no
  // longer recognise. Awaited, because a serverless function may be frozen
  // the moment it answers - but a failed stamp is logged, never a failed read.
  const { error: stampErr } = await db.from('mcp_tokens')
    .update({ last_used_at: new Date().toISOString() }).eq('id', data.id)
  if (stampErr) console.error('[mcp] last_used_at:', stampErr.message)

  return actorForUser(db, data.profile_id)
}

export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!token) return unauthorized(request, 'Sign in to SyteNav to connect, or send a token from Settings -> Integrations as "Authorization: Bearer <token>".')

  const db = admin()
  const actor = await actorFor(db, token)
  if (actor === 'expired') return unauthorized(request, 'That SyteNav sign-in has expired. Renew it.', true)
  if (!actor) return unauthorized(request, 'That SyteNav token is not valid, or has been revoked.', true)

  let message: unknown
  try {
    message = await request.json()
  } catch {
    return NextResponse.json(rpcError(null, RPC.PARSE_ERROR, 'The request body is not JSON.'), { status: 400 })
  }

  const reply = await handleRpc(message, {
    tools: TOOLS.map(({ name, title, description, inputSchema }) => ({ name, title, description, inputSchema })),
    callTool: (name, args) => callTool(db, actor, name, args),
  })

  // A notification, or a response the client sent us: accepted, nothing to say.
  if (!reply) return new NextResponse(null, { status: 202 })
  return NextResponse.json(reply)
}

/**
 * No server-to-client stream: everything this server says is a reply to a
 * POST. 405 is how the transport spec says so.
 */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

/** Stateless, so there is no session to end. */
export function DELETE() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}

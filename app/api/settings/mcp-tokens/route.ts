import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor } from '@/lib/server-permissions'
import {
  MAX_LIVE_TOKENS, hashMcpToken, mcpTokenNameProblem, mcpTokenPrefix, newMcpToken,
} from '@/lib/mcp-token'
import { actorProblem } from '@/lib/mcp/tools'

// ─────────────────────────────────────────────────────────────────────────────
// A person's own Claude connections: list, create, revoke.
//
// PERSONAL, so no company permission gates it: a token can only ever read what
// its owner can already read, and every row here is scoped to the caller's own
// profile. Who MAY connect at all is `actorProblem`, the same sentence the MCP
// server answers with - asked here so nobody makes a token that would only
// ever be refused.
//
// The plaintext token is in the POST response and NOWHERE ELSE, ever.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const bearer = (request: Request) => request.headers.get('Authorization')?.replace('Bearer ', '') ?? null

export async function GET(request: Request) {
  const db = admin()
  const actor = await getActor(db, bearer(request))
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Both kinds: personal tokens (no expiry) and Claude sign-ins, listed while
  // their refresh token is still good - one past it is a connection that can
  // never read again, and listing it would offer to revoke nothing.
  const { data, error } = await db.from('mcp_tokens')
    .select('id, name, token_prefix, created_at, last_used_at, oauth_client_id')
    .eq('profile_id', actor.userId)
    .is('revoked_at', null)
    .or(`refresh_expires_at.is.null,refresh_expires_at.gt.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
  // A failed read is not "you have no connections".
  if (error) {
    console.error('[mcp-tokens] list failed:', error.message)
    return NextResponse.json({ error: 'Could not load your Claude connections.' }, { status: 500 })
  }
  const tokens = (data ?? []).map(({ oauth_client_id, ...t }: any) => ({ ...t, signed_in: !!oauth_client_id }))
  return NextResponse.json({ tokens, unavailable: actorProblem(actor) })
}

export async function POST(request: Request) {
  const db = admin()
  const actor = await getActor(db, bearer(request))
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const who = actorProblem(actor)
  if (who) return NextResponse.json({ error: who }, { status: 403 })

  const body = await request.json().catch(() => ({}))
  const problem = mcpTokenNameProblem(body?.name)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // The cap is on tokens made HERE. A Claude sign-in replaces its own
  // previous connection, so it cannot pile up the way pasted tokens can.
  const { count, error: countErr } = await db.from('mcp_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', actor.userId)
    .is('oauth_client_id', null)
    .is('revoked_at', null)
  if (countErr) {
    console.error('[mcp-tokens] count failed:', countErr.message)
    return NextResponse.json({ error: 'Could not create the connection. Try again.' }, { status: 500 })
  }
  if ((count ?? 0) >= MAX_LIVE_TOKENS) {
    return NextResponse.json(
      { error: `You already have ${MAX_LIVE_TOKENS} Claude connections. Revoke one you no longer use first.` },
      { status: 409 },
    )
  }

  const token = newMcpToken()
  const { data, error } = await db.from('mcp_tokens')
    .insert({
      profile_id: actor.userId,
      name: String(body.name).trim(),
      token_hash: hashMcpToken(token),
      token_prefix: mcpTokenPrefix(token),
    })
    .select('id, name, token_prefix, created_at, last_used_at')
    .single()
  if (error) {
    console.error('[mcp-tokens] insert failed:', error.message)
    return NextResponse.json({ error: 'Could not create the connection. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ token, connection: data })
}

export async function DELETE(request: Request) {
  const db = admin()
  const actor = await getActor(db, bearer(request))
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Which connection?' }, { status: 400 })

  // Scoped to the caller's own rows: somebody else's id revokes nothing.
  const { data, error } = await db.from('mcp_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('profile_id', actor.userId)
    .is('revoked_at', null)
    .select('id')
  if (error) {
    console.error('[mcp-tokens] revoke failed:', error.message)
    return NextResponse.json({ error: 'Could not revoke that connection. Try again.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'That connection was not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CORS_HEADERS } from '@/lib/mcp/oauth'
import { exchangeToken, type TokenRequest } from '@/lib/mcp/oauth-server'

// The token endpoint: a one-time code (with its PKCE verifier) or a refresh
// token in, an access token out. The rules are in lib/mcp/oauth-server.ts.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** OAuth sends a form; some clients send JSON. Both are read the same way. */
async function readBody(request: Request): Promise<Record<string, string>> {
  const type = request.headers.get('content-type') ?? ''
  if (type.includes('application/json')) {
    const j = await request.json().catch(() => ({}))
    return Object.fromEntries(Object.entries(j ?? {}).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  }
  const text = await request.text().catch(() => '')
  return Object.fromEntries(new URLSearchParams(text))
}

/** client_secret_basic: the id and secret in an Authorization header, form-encoded first. */
function basicAuth(request: Request): { id: string; secret: string } | null {
  const h = request.headers.get('authorization') ?? ''
  if (!/^Basic\s+/i.test(h)) return null
  try {
    const [id, secret] = Buffer.from(h.replace(/^Basic\s+/i, ''), 'base64').toString('utf8').split(':')
    return { id: decodeURIComponent(id ?? ''), secret: decodeURIComponent(secret ?? '') }
  } catch { return null }
}

export async function POST(request: Request) {
  const body = await readBody(request)
  const basic = basicAuth(request)
  const req: TokenRequest = {
    grant_type: body.grant_type ?? null,
    code: body.code ?? null,
    redirect_uri: body.redirect_uri ?? null,
    code_verifier: body.code_verifier ?? null,
    refresh_token: body.refresh_token ?? null,
    client_id: basic?.id || body.client_id || null,
    client_secret: basic?.secret || body.client_secret || null,
  }
  const reply = await exchangeToken(admin(), req)
  // A token response must never be cached anywhere along the way.
  return NextResponse.json(reply.body, {
    status: reply.status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

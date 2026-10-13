import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { CORS_HEADERS } from '@/lib/mcp/oauth'
import { registerClient } from '@/lib/mcp/oauth-server'

// Dynamic client registration (RFC 7591): Claude introduces itself before
// sending anybody to sign in. Unauthenticated by design and capped site-wide;
// a registered client can do nothing until a signed-in person presses Allow.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const reply = await registerClient(admin(), body)
  return NextResponse.json(reply.body, {
    status: reply.status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
  })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

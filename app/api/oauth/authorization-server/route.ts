import { NextResponse } from 'next/server'
import { CORS_HEADERS, authorizationServerMetadata, requestOrigin } from '@/lib/mcp/oauth'

// /.well-known/oauth-authorization-server, rewritten here by next.config.
// Where to sign in, register and swap a code.

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return NextResponse.json(authorizationServerMetadata(requestOrigin(request)), { headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

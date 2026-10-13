import { NextResponse } from 'next/server'
import { CORS_HEADERS, protectedResourceMetadata, requestOrigin } from '@/lib/mcp/oauth'

// /.well-known/oauth-protected-resource (and .../api/mcp), rewritten here by
// next.config - Next will not route a folder whose name starts with a dot.
// The first thing Claude reads after a 401 from /api/mcp.

export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  return NextResponse.json(protectedResourceMetadata(requestOrigin(request)), { headers: CORS_HEADERS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

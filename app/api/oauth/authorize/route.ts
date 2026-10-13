import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor } from '@/lib/server-permissions'
import { authorizeParams } from '@/lib/mcp/oauth'
import { checkAuthorize, decideAuthorize } from '@/lib/mcp/oauth-server'

// What the Allow page (app/(auth)/oauth/authorize) asks.
//
// GET: may this sign-in request be shown at all? No session needed - it says
//      only which app is asking and where you will be sent back to.
// POST: the person's answer, with their SyteNav session. Everything is checked
//      again here, because this is the request that actually issues a code.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const check = await checkAuthorize(admin(), authorizeParams(new URL(request.url).searchParams))
  return NextResponse.json(check, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  const db = admin()
  const actor = await getActor(db, request.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!actor) return NextResponse.json({ error: 'Sign in to SyteNav first.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const result = await decideAuthorize(db, actor, authorizeParams(body ?? {}), body?.decision === 'allow')
  return NextResponse.json(result, { status: 'error' in result && !result.redirect ? 400 : 200, headers: { 'Cache-Control': 'no-store' } })
}

import { NextResponse } from 'next/server'
import { admin, getValidConnection, listAdminOrganizations, organizationName } from '@/lib/linkedin'

export const runtime = 'nodejs'

async function requireManager(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return { error: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  if (!['admin', 'manager'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Only an admin can manage LinkedIn.' }, { status: 403 }) }
  }
  return { db, companyId: profile.company_id as string }
}

// List the LinkedIn pages the connected member administers (for the picker).
export async function GET(request: Request) {
  const ctx = await requireManager(request)
  if ('error' in ctx) return ctx.error
  const conn = await getValidConnection(ctx.db, ctx.companyId)
  if (!conn) return NextResponse.json({ error: 'LinkedIn is not connected (or the token expired). Connect again.' }, { status: 400 })
  try {
    return NextResponse.json({ organizations: await listAdminOrganizations(conn.access_token) })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, organizations: [] }, { status: 502 })
  }
}

// Set which page to post as. Accepts a full URN, a bare numeric id, or an
// admin URL like linkedin.com/company/12345678/admin/.
export async function POST(request: Request) {
  const ctx = await requireManager(request)
  if ('error' in ctx) return ctx.error
  const body = await request.json().catch(() => ({}))
  const raw = String(body.organization ?? '').trim()
  const idMatch = raw.match(/^urn:li:organization:(\d+)$/) || raw.match(/\/company\/(\d+)/) || raw.match(/^(\d+)$/)
  if (!idMatch) {
    return NextResponse.json({ error: 'Enter your page\'s numeric ID (or paste its urn:li:organization:… value).' }, { status: 400 })
  }
  const urn = `urn:li:organization:${idMatch[1]}`

  const conn = await getValidConnection(ctx.db, ctx.companyId)
  if (!conn) return NextResponse.json({ error: 'LinkedIn is not connected (or the token expired). Connect again.' }, { status: 400 })

  const name = await organizationName(conn.access_token, urn)
  await ctx.db.from('linkedin_connections').update({
    org_urn: urn,
    org_name: name,
    status: 'connected',
    updated_at: new Date().toISOString(),
  }).eq('company_id', ctx.companyId)

  return NextResponse.json({ ok: true, org_urn: urn, org_name: name })
}

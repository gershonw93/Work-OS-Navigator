import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Add one or more invitees; each gets a unique public token/link.
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { invitees } = await request.json() as { invitees: { company_id?: string | null; name?: string; email?: string }[] }
  if (!invitees?.length) return NextResponse.json({ error: 'No invitees' }, { status: 400 })

  const rows = invitees
    .filter(v => (v.name || v.email))
    .map(v => ({
      bid_request_id: params.reqId,
      token: randomUUID().replace(/-/g, ''),
      vendor_company_id: v.company_id || null,
      vendor_name: v.name || null,
      vendor_email: v.email || null,
    }))
  if (!rows.length) return NextResponse.json({ error: 'Each invitee needs a name or email' }, { status: 400 })

  const { data, error } = await db.from('bid_invites').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ invites: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const inviteId = new URL(request.url).searchParams.get('inviteId')
  if (!inviteId) return NextResponse.json({ error: 'inviteId required' }, { status: 400 })
  const { error } = await db.from('bid_invites').delete().eq('id', inviteId).eq('bid_request_id', params.reqId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function PATCH(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const k of ['paid_date', 'amount', 'method', 'memo', 'retainer', 'qb_entered']) {
    if (body[k] !== undefined) updates[k] = k === 'amount' ? Number(body[k]) || 0 : body[k]
  }
  const { error } = await admin().from('client_payments').update(updates).eq('id', params.paymentId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: { id: string; paymentId: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await admin().from('client_payments').delete().eq('id', params.paymentId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

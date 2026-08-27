import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { friendlyDbError } from '@/lib/db-error'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return user ? { db, user } : null
}

/**
 * Settle or withdraw a request.
 *
 * Marking one paid does NOT create the money. The client payment is a separate
 * record with its own date, method and escrow effect, and inventing one here
 * would put cash in the ledger that nobody banked. This only records that the
 * ask has been answered, and optionally which payment answered it.
 */
export async function PATCH(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const a = await auth(request)
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = a

  const body = await request.json().catch(() => ({} as any))
  const status = String(body?.status ?? '')
  if (!['pending', 'paid', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Unknown status.' }, { status: 400 })
  }

  const patch: Record<string, unknown> = { status }
  // paid_at is stamped and cleared with the status, never left behind - a
  // request reopened after a mistaken tick must not still claim a paid date.
  patch.paid_at = status === 'paid' ? new Date().toISOString() : null
  if (status !== 'paid') patch.client_payment_id = null
  else if (typeof body?.client_payment_id === 'string') patch.client_payment_id = body.client_payment_id

  const { data, error } = await db
    .from('client_payment_requests')
    .update(patch)
    .eq('id', params.reqId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({ request: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const a = await auth(request)
  if (!a) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await a.db
    .from('client_payment_requests')
    .delete()
    .eq('id', params.reqId)
    .eq('project_id', params.id)
  if (error) return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  return NextResponse.json({ ok: true })
}

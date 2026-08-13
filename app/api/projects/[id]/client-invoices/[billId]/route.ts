import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

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

const FIELDS = ['status', 'due_date', 'show_markup', 'notes', 'terms', 'invoice_number', 'issue_date']

export async function PATCH(request: Request, { params }: { params: { id: string; billId: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = ctx

  const body = await request.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const f of FIELDS) if (f in body) patch[f] = body[f] === '' ? null : body[f]

  // Sending mints the client's link, once. Regenerating it on every send would
  // break a link already in somebody's inbox.
  if (body.status === 'sent') {
    patch.sent_at = new Date().toISOString()
    const { data: current } = await db.from('client_invoices')
      .select('token').eq('id', params.billId).maybeSingle()
    if (!current?.token) patch.token = randomBytes(24).toString('hex')
  }
  if (body.status === 'paid') patch.paid_at = new Date().toISOString()

  const { data, error } = await db.from('client_invoices')
    .update(patch).eq('id', params.billId).eq('project_id', params.id)
    .select('*, client_invoice_lines(*)').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found on this project' }, { status: 404 })

  if (body.status) {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    await logActivity(
      db, params.id, (profile as any)?.full_name ?? 'GC', 'client_invoice_updated',
      `Client invoice ${data.invoice_number} marked ${body.status}`,
    )
  }

  return NextResponse.json({ invoice: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; billId: string } }) {
  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Lines cascade, which releases their source costs to be billed again -
  // deleting a draft should hand those costs back, not strand them.
  const { data: gone, error } = await ctx.db.from('client_invoices')
    .delete().eq('id', params.billId).eq('project_id', params.id)
    .select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!gone) return NextResponse.json({ error: 'Not found on this project' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

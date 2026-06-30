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

const VENDOR_BILLED = new Set(['approved', 'sent', 'paid'])

// Client payments ledger + escrow summary for a project.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const [{ data: project }, { data: payments }, { data: invoices }] = await Promise.all([
    db.from('projects').select('contractor_fee_pct').eq('id', params.id).single(),
    db.from('client_payments').select('*').eq('project_id', params.id).order('paid_date', { ascending: true }),
    db.from('invoices').select('amount, status').eq('project_id', params.id),
  ])

  const feePct = Number(project?.contractor_fee_pct ?? 0)
  const received = (payments ?? []).reduce((s, p) => s + Number(p.amount || 0), 0)
  const vendorBilled = (invoices ?? []).filter(i => VENDOR_BILLED.has(i.status)).reduce((s, i) => s + Number(i.amount || 0), 0)
  const vendorPaid = (invoices ?? []).filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.amount || 0), 0)

  // Contractor management fee earned = vendor cost × fee%. Escrow holds client cash
  // minus what's been disbursed to vendors and minus the fee taken.
  const feeEarned = vendorBilled * feePct
  const escrowBalance = received - vendorPaid - feeEarned
  const availableAfterFee = received - feeEarned
  const outstandingToVendors = Math.max(vendorBilled - vendorPaid, 0)

  return NextResponse.json({
    fee_pct: feePct,
    payments: payments ?? [],
    summary: { received, feeEarned, availableAfterFee, vendorBilled, vendorPaid, outstandingToVendors, escrowBalance },
  })
}

// Create a client payment, or update the project fee % ({ fee_pct }).
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const body = await request.json()

  if (body.fee_pct !== undefined && body.amount === undefined) {
    const pct = Math.max(0, Math.min(Number(body.fee_pct) || 0, 1))
    const { error } = await db.from('projects').update({ contractor_fee_pct: pct }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, fee_pct: pct })
  }

  const { data, error } = await db.from('client_payments').insert({
    project_id: params.id,
    paid_date: body.paid_date || null,
    amount: Number(body.amount) || 0,
    method: body.method || null,
    memo: body.memo || null,
    retainer: !!body.retainer,
    qb_entered: !!body.qb_entered,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ payment: data })
}

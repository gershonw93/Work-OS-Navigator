import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await db
    .from('invoices')
    .select('*, subcontracts(trade, contract_amount)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ invoices: data ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { subcontract_id, payment_schedule_item_id, company_id, company_name, amount, description, due_date } = await request.json()

  // Count existing invoices for this project to generate invoice number
  const { count } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const invoice_number = `INV-${params.id.slice(0, 4).toUpperCase()}-${String((count ?? 0) + 1).padStart(3, '0')}`

  const { data, error } = await db
    .from('invoices')
    .insert({
      project_id: params.id,
      subcontract_id: subcontract_id || null,
      payment_schedule_item_id: payment_schedule_item_id || null,
      company_id: company_id || null,
      company_name: company_name || null,
      amount,
      description: description || null,
      due_date: due_date || null,
      invoice_number,
      status: 'pending_approval',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: creator } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, (creator as any)?.full_name ?? 'GC', 'invoice_created', `Invoice ${invoice_number} created for ${company_name} — $${Number(amount).toLocaleString()}`)

  await db.from('notifications').insert({
    user_id: user.id,
    type: 'invoice_pending',
    message: `Invoice ${invoice_number} is pending your approval`,
    read: false,
  })

  return NextResponse.json({ invoice: data })
}

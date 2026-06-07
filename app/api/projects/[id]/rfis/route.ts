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

  const { data: rfis, error } = await db
    .from('rfis')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ rfis: rfis ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    subject,
    description,
    is_change_order,
    change_order_description,
    change_order_items,
    change_order_amount,
    submitted_by_name,
    company_name,
    company_id,
  } = body

  // Auto-assign rfi_number by counting existing RFIs for this project
  const { count } = await db
    .from('rfis')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', params.id)

  const rfi_number = (count ?? 0) + 1

  const { data: rfi, error } = await db
    .from('rfis')
    .insert({
      project_id: params.id,
      rfi_number,
      subject,
      description: description ?? null,
      is_change_order: is_change_order ?? false,
      change_order_description: change_order_description ?? null,
      change_order_items: change_order_items ?? null,
      change_order_amount: change_order_amount ?? null,
      change_order_status: is_change_order ? 'pending' : null,
      submitted_by_name: submitted_by_name ?? null,
      company_name: company_name ?? null,
      company_id: company_id ?? null,
      status: 'open',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = company_name ?? submitted_by_name ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'rfi_submitted',
    `RFI #${rfi_number}: ${subject}`,
    { rfi_id: rfi.id, rfi_number, subject, company_name, is_change_order },
  )

  return NextResponse.json({ rfi }, { status: 201 })
}

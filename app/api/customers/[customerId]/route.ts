import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

async function getCompanyId(userId: string) {
  const { data } = await admin().from('profiles').select('company_id').eq('id', userId).single()
  return data?.company_id ?? null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user.id)
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params

  const { data: customer, error } = await admin()
    .from('customers')
    .select('*, projects(id, name, status, address, start_date, type)')
    .eq('id', customerId)
    .eq('gc_company_id', companyId)
    .single()

  if (error || !customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ customer })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user.id)
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params
  const body = await request.json()
  const { name, contact_name, email, phone, billing_address, notes } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (contact_name !== undefined) updates.contact_name = contact_name
  if (email !== undefined) updates.email = email
  if (phone !== undefined) updates.phone = phone
  if (billing_address !== undefined) updates.billing_address = billing_address
  if (notes !== undefined) updates.notes = notes

  const { data: customer, error } = await admin()
    .from('customers')
    .update(updates)
    .eq('id', customerId)
    .eq('gc_company_id', companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> }
) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user.id)
  if (!companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const { customerId } = await params

  const { error } = await admin()
    .from('customers')
    .delete()
    .eq('id', customerId)
    .eq('gc_company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

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

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data } = await admin()
    .from('companies')
    .select('*')
    .eq('type', 'subcontractor')
    .order('name')

  return NextResponse.json({ companies: data ?? [] })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, trade, contact_email, phone, address, license_number } = await request.json()

  if (!name || !contact_email) {
    return NextResponse.json({ error: 'Name and contact email are required' }, { status: 400 })
  }

  const { data, error } = await admin()
    .from('companies')
    .insert({ name, trade: trade || null, contact_email, phone: phone || null, address: address || null, license_number: license_number || null, type: 'subcontractor', insurance_status: 'missing' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ company: data })
}

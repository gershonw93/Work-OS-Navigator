/*
 * ─── SQL TO RUN IN SUPABASE ────────────────────────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS customers (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   gc_company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
 *   name text NOT NULL,
 *   contact_name text,
 *   email text,
 *   phone text,
 *   billing_address text,
 *   notes text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

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

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ customers: [] })

  const { data, error } = await db
    .from('customers')
    .select('*, projects(id, name, status, address, start_date, type)')
    .eq('gc_company_id', profile.company_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customers: data ?? [] })
}

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const { name, contact_name, email, phone, billing_address, notes } = body

  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const { data: customer, error } = await db
    .from('customers')
    .insert({ gc_company_id: profile.company_id, name, contact_name, email, phone, billing_address, notes })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer })
}

export async function PATCH(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const { id, name, contact_name, email, phone, billing_address, notes } = body

  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (contact_name !== undefined) updates.contact_name = contact_name
  if (email !== undefined) updates.email = email
  if (phone !== undefined) updates.phone = phone
  if (billing_address !== undefined) updates.billing_address = billing_address
  if (notes !== undefined) updates.notes = notes

  const { data: customer, error } = await db
    .from('customers')
    .update(updates)
    .eq('id', id)
    .eq('gc_company_id', profile.company_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer })
}

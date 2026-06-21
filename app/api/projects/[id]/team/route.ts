// -- Run in Supabase SQL Editor:
// -- ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id);
// -- ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS actor_id uuid;

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const [{ data: members }, { data: subcontracts }] = await Promise.all([
    db.from('project_team_members')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true }),
    db.from('subcontracts')
      .select('id, scope, trade, contract_amount, status, companies(name, contact_email, phone)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true }),
  ])

  // Deduplicate subcontracts by company — show each company once
  const seenCompanies = new Set<string>()
  const uniqueSubs = (subcontracts ?? []).filter((s: any) => {
    const cid = (s.companies as any)?.name
    if (!cid || seenCompanies.has(cid)) return false
    seenCompanies.add(cid)
    return true
  })

  return NextResponse.json({ members: members ?? [], subcontracts: uniqueSubs })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, role, phone, email } = await request.json()
  if (!name || !role) return NextResponse.json({ error: 'Name and role are required' }, { status: 400 })

  // Look up profile_id by email if provided
  let profileId: string | null = null
  if (email) {
    const { data: profileRow } = await db
      .from('profiles')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    profileId = profileRow?.id ?? null
  }

  const { data, error } = await db
    .from('project_team_members')
    .insert({
      project_id: params.id,
      name,
      role,
      phone: phone ?? null,
      email: email ?? null,
      ...(profileId ? { profile_id: profileId } : {}),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ member: data })
}

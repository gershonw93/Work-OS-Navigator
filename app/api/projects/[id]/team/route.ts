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

  const subsSelect = (cols: string) => db.from('subcontracts')
    .select(cols)
    .eq('project_id', params.id)
    .order('created_at', { ascending: true })

  const [{ data: members }, subsRes] = await Promise.all([
    db.from('project_team_members')
      .select('*')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true }),
    subsSelect('id, scope, trade, contract_amount, status, added_manually, proposal_url, companies(name, contact_email, phone)'),
  ])

  // Fall back if the manual-sub columns haven't been migrated yet
  let subcontracts = subsRes.data
  if (subsRes.error && (subsRes.error as any).code === '42703') {
    const retry = await subsSelect('id, scope, trade, contract_amount, status, companies(name, contact_email, phone)')
    subcontracts = retry.data
  }

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

  // SQL: ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id);
  // SQL: ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS actor_id uuid;

  const { name, role, phone, email } = await request.json()
  if (!name || !role) return NextResponse.json({ error: 'Name and role are required' }, { status: 400 })

  // Auto-link to a real profile if email matches a company member
  let profileId: string | null = null
  if (email) {
    const { data: matchedProfile } = await db.from('profiles').select('id').eq('email', email).maybeSingle()
    profileId = matchedProfile?.id ?? null
  }

  const { data, error } = await db
    .from('project_team_members')
    .insert({ project_id: params.id, name, role, phone: phone ?? null, email: email ?? null, profile_id: profileId })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'team_member_added',
    `${name} added to the team as ${role}`, { member_id: data.id, name, role }, user.id)

  return NextResponse.json({ member: data })
}

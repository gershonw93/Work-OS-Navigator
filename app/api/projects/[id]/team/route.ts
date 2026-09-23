import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { profileIdForEmail } from '@/lib/my-jobs'
import { logActivity } from '@/lib/log-activity'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { missingMemberBody } from '@/lib/team-member'
import { friendlyDbError } from '@/lib/db-error'

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

  // Deduplicate subcontracts by company - show each company once
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

  // THIS ROUTE ASKED NOTHING. Any signed-in user, from any company, could add
  // a person to any job by its id. Adding to a job's team is the job OWNER's
  // act (a sub on the job sees the team, and does not staff the GC's job), so
  // it takes team:edit AND ownership - the same two questions the team panel's
  // Add button asks before it shows.
  const gate = await requirePermission(db, request, 'team', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  // SQL: ALTER TABLE project_team_members ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id);
  // SQL: ALTER TABLE project_activity ADD COLUMN IF NOT EXISTS actor_id uuid;

  const body = await request.json().catch(() => ({}))
  const missing = missingMemberBody(body)
  if (missing) return NextResponse.json({ error: missing }, { status: 400 })
  const name = String(body.name).trim()
  const role = String(body.role).trim()
  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null
  const email = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : null

  // Auto-link to a real profile so the row carries a foreign key rather than a
  // string somebody typed. Case-insensitively: this was `.eq('email', email)`,
  // so "Jay@..." against an account stored as "jay@..." wrote a NULL link and
  // left the person resolving by string match for ever.
  const profileId = await profileIdForEmail(db, email)

  const { data, error } = await db
    .from('project_team_members')
    .insert({ project_id: params.id, name, role, phone, email, profile_id: profileId })
    .select()
    .single()

  if (error) {
    console.error('[team POST]', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'team_member_added',
    `${name} added to the team as ${role}`, { member_id: data.id, name, role }, user.id)

  return NextResponse.json({ member: data })
}

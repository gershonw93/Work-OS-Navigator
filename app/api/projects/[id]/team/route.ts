import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { addTeamMember } from '@/lib/writes/team-member'
import { getActor, actorCan } from '@/lib/server-permissions'
import { jobSide } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// WHO READS THE ROSTER, which is not the same as who holds `team`. The Subs &
// Team tab does (`team: view`), but so do the Daily Logs screen (the sub picker
// for tagging photos), the plan viewer (who to assign a pin to) and the header's
// team quick view - and a worker holds `team: N` while using the first two
// every day. Gating this on `team: view` would empty those pickers for them.
//
// So the gate is the one that was missing: being ON this job. Any login used
// to read any job's people - names, addresses, phones - and every sub's
// contract amount, by id. The floor is any of the three screens' permissions,
// so a custom role that can open none of them is still refused.
//
// AND THE MONEY ONLY GOES WHERE THE MONEY IS SHOWN: a sub's contract amount and
// proposal are on the Subs & Team tab, which is the owning company's and gated
// on `team: view`. Nobody else's picker needs them.
const ROSTER_READERS = ['team', 'daily-logs', 'plans'] as const

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const actor = await getActor(db, token)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!ROSTER_READERS.some(r => actorCan(actor, r, 'view'))) {
    return NextResponse.json({ error: 'You do not have permission to view team.' }, { status: 403 })
  }
  const on = await jobSide(db, actor, params.id)
  if ('denied' in on) return on.denied
  const seesMoney = on.side === 'gc' && actorCan(actor, 'team', 'view')

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

  const shown = seesMoney
    ? uniqueSubs
    : uniqueSubs.map((sub: any) => {
      const { contract_amount: _amount, proposal_url: _proposal, ...rest } = sub
      return rest
    })

  return NextResponse.json({ members: members ?? [], subcontracts: shown })
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

  // Everything after the gate is `addTeamMember` (lib/writes/team-member.ts),
  // the same function Claude's add_team_member calls.
  const body = await request.json().catch(() => ({}))
  const result = await addTeamMember(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { updateTeamMember } from '@/lib/writes/team-member'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Editing or removing somebody on a job's team is the owner's act - these
  // two asked nothing at all, same as adding did. See the POST beside this.
  const gate = await requirePermission(db, request, 'team', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  // Everything after the gate is `updateTeamMember` (lib/writes/team-member.ts).
  const body = await request.json()
  const result = await updateTeamMember(db, { userId: user.id, projectId: params.id, memberId: params.memberId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; memberId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Editing or removing somebody on a job's team is the owner's act - these
  // two asked nothing at all, same as adding did. See the POST beside this.
  const gate = await requirePermission(db, request, 'team', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: member } = await db.from('project_team_members').select('name').eq('id', params.memberId).single()
  await db.from('project_team_members').delete().eq('id', params.memberId).eq('project_id', params.id)

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'team_member_removed',
    `${member?.name || 'A team member'} removed from the team`, { member_id: params.memberId }, user.id)

  return NextResponse.json({ ok: true })
}

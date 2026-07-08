import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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

  const body = await request.json()
  const { name, role, phone, email } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (role !== undefined) updates.role = role
  if (phone !== undefined) updates.phone = phone
  if (email !== undefined) updates.email = email

  const { data, error } = await db
    .from('project_team_members')
    .update(updates)
    .eq('id', params.memberId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ member: data })
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

  const { data: member } = await db.from('project_team_members').select('name').eq('id', params.memberId).single()
  await db.from('project_team_members').delete().eq('id', params.memberId).eq('project_id', params.id)

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(db, params.id, profile?.full_name || 'Someone', 'team_member_removed',
    `${member?.name || 'A team member'} removed from the team`, { member_id: params.memberId }, user.id)

  return NextResponse.json({ ok: true })
}

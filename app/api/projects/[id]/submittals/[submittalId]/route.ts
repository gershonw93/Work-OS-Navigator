import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_STATUSES = ['pending', 'approved', 'rejected', 'revise']

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; submittalId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()

  const updates: Record<string, unknown> = {}
  if ('status' in body) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }
    updates.status = body.status
  }
  if ('review_notes' in body) updates.review_notes = body.review_notes || null

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { data: submittal, error } = await db
    .from('submittals')
    .update(updates)
    .eq('id', params.submittalId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newStatus = updates.status as string | undefined
  if (newStatus && newStatus !== 'pending') {
    const actorName = (profile as any)?.full_name ?? 'Someone'
    const statusLabel = newStatus === 'revise' ? 'sent back for revision' : newStatus
    await logActivity(
      db,
      params.id,
      actorName,
      `submittal_${newStatus}`,
      `Submittal ${statusLabel}: ${submittal.title}`,
      { submittal_id: submittal.id, title: submittal.title, status: newStatus },
    )
  }

  return NextResponse.json({ submittal })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; submittalId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('submittals')
    .delete()
    .eq('id', params.submittalId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

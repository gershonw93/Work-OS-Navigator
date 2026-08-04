import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { getActor, actorCan } from '@/lib/server-permissions'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// PATCH /api/projects/[id]/daily-logs/[logId]/review  { reviewed: boolean }
// A site manager marks a field entry reviewed (or puts it back to pending).
// Reviewing is what lets the entry into the client-facing PDF, so it needs
// edit rights on daily logs, not just view.
export async function PATCH(
  request: Request,
  { params }: { params: { id: string; logId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const actor = await getActor(db, token)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actorCan(actor, 'daily-logs', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to review logs.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const reviewed = body.reviewed !== false

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', actor.userId).single()
  const reviewerName = profile?.full_name ?? null

  const { data, error } = await db
    .from('daily_logs')
    .update(reviewed
      ? {
          review_status: 'reviewed',
          reviewed_by: actor.userId,
          reviewed_by_name: reviewerName,
          reviewed_at: new Date().toISOString(),
        }
      : { review_status: 'pending', reviewed_by: null, reviewed_by_name: null, reviewed_at: null })
    .eq('id', params.logId)
    .eq('project_id', params.id)
    .select('id, review_status, reviewed_by_name, reviewed_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (reviewed) {
    await logActivity(db, params.id, reviewerName || 'Someone', 'daily_log_reviewed', 'reviewed a field log entry')
  }

  return NextResponse.json({ log: data })
}

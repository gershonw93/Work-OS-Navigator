import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { updateDailyLog } from '@/lib/writes/daily-log'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Both handlers answered any login. Now the actions the Daily Logs screen
// already hides its controls behind: Edit on `daily-logs: edit`, Delete on
// `daily-logs: delete` (`canEditLog` / `canDeleteLog` on the page).

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; logId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'daily-logs', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json()
  const result = await updateDailyLog(db, { userId: gate.actor.userId, projectId: params.id, logId: params.logId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { id: string; logId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'daily-logs', 'delete')
  if (denied(gate)) return gate.denied
  const { error } = await db.from('daily_logs').delete().eq('id', params.logId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

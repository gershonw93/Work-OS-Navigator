import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { jobGate, logOnJob } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string; logId: string } }) {
  // Answered any login and wrote onto any log id. Now on this job, the log on
  // this job, the billing lock - at `view`, because "Add an update" sits under
  // every expanded log for everybody who can read it.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'daily-logs', 'view', { write: true })
  if ('denied' in gate) return gate.denied
  if (!(await logOnJob(db, params.id, params.logId))) return NextResponse.json({ error: 'Log not found' }, { status: 404 })
  const user = { id: gate.actor.userId }

  const { body } = await request.json()
  if (!body || !body.trim()) return NextResponse.json({ error: 'Update text is required' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('daily_log_updates')
    .insert({
      daily_log_id: params.logId,
      body: body.trim(),
      created_by: user.id,
      created_by_name: (profile as any)?.full_name ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, params.id, (profile as any)?.full_name || 'Someone', 'daily_log_update',
    `Daily log update: ${body.trim().slice(0, 80)}`, { log_id: params.logId, update_id: data.id }, user.id)

  return NextResponse.json({ update: data })
}

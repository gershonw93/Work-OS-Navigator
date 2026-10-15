import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate, logOnJob } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Re-tag a photo after upload (sub / category / caption) or delete it.
//
// Both answered any login for any photo id (scoped only to a log id taken from
// the same URL). Now on this job, the log on this job, and the billing lock.
// `daily-logs: VIEW`, not edit/delete: the screen shows the tag pickers and the
// delete X on every photo to everybody who can open the log, and the lockdown
// keeps that rather than quietly changing what a role may do.
export async function PATCH(request: Request, { params }: { params: { id: string; logId: string; photoId: string } }) {
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'daily-logs', 'view', { write: true })
  if ('denied' in gate) return gate.denied
  if (!(await logOnJob(db, params.id, params.logId))) return NextResponse.json({ error: 'Log not found' }, { status: 404 })

  const body = await request.json()
  const updates: Record<string, any> = {}
  if ('subcontract_id' in body) {
    updates.subcontract_id = body.subcontract_id || null
    // A tag is a claim about THIS job's subs - never another job's.
    if (updates.subcontract_id) {
      const { data: sub } = await db.from('subcontracts').select('id')
        .eq('id', updates.subcontract_id).eq('project_id', params.id).maybeSingle()
      if (!sub) return NextResponse.json({ error: 'That sub is not on this job.' }, { status: 400 })
    }
  }
  if ('category' in body) updates.category = body.category || null
  if ('caption' in body) updates.caption = body.caption || null

  const { data, error } = await db
    .from('daily_log_photos')
    .update(updates)
    .eq('id', params.photoId)
    .eq('daily_log_id', params.logId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photo: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string; logId: string; photoId: string } }) {
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'daily-logs', 'view', { write: true })
  if ('denied' in gate) return gate.denied
  if (!(await logOnJob(db, params.id, params.logId))) return NextResponse.json({ error: 'Log not found' }, { status: 404 })

  const { error } = await db.from('daily_log_photos').delete().eq('id', params.photoId).eq('daily_log_id', params.logId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

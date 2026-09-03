import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { withStructural } from '@/lib/notification-routing'
import { notify } from '@/lib/notify'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_FIELDS = [
  'type',
  'trade',
  'status',
  'scheduled_date',
  'completed_date',
  'inspector_name',
  'inspector_phone',
  'scheduling_phone',
  'scheduled_time',
  'scheduler_profile_id',
  'scheduler_name',
  'notes',
  'ready_marked_by',
  'ready_marked_at',
] as const

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
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
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // If status is being set to 'passed' or 'failed', ensure completed_date is set
  const newStatus = updates.status as string | undefined
  if ((newStatus === 'passed' || newStatus === 'failed') && !updates.completed_date) {
    updates.completed_date = new Date().toISOString().split('T')[0]
  }

  // Who was on it BEFORE, so a genuine reassignment can be told apart from the
  // Edit form re-sending the same value with a changed note. Only read when the
  // field is actually in play, and only this one column.
  let priorScheduler: string | null = null
  if ('scheduler_profile_id' in updates) {
    const { data: before } = await db
      .from('inspections').select('scheduler_profile_id')
      .eq('id', params.inspectionId).eq('project_id', params.id).maybeSingle()
    priorScheduler = (before as any)?.scheduler_profile_id ?? null
  }

  const { data: inspection, error } = await db
    .from('inspections')
    .update(updates)
    .eq('id', params.inspectionId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'

  if (newStatus === 'passed' || newStatus === 'failed') {
    const activityType = newStatus === 'passed' ? 'inspection_passed' : 'inspection_failed'
    const trade = inspection.trade ? ` (${inspection.trade})` : ''
    const inspectionLabel = inspection.type ? `${inspection.type}${trade}` : 'Inspection'
    await logActivity(
      db,
      params.id,
      actorName,
      activityType,
      `${inspectionLabel} ${newStatus}`,
      { inspection_id: inspection.id, inspection_type: inspection.type, trade: inspection.trade, status: newStatus },
    )
  }

  // A sub marking work ready only writes ready_marked_by/at - it never touches
  // status, so it falls outside the status-change notifications below. Tell the
  // GC anyway, otherwise the hand goes up and nobody sees it.
  if ('ready_marked_by' in updates && updates.ready_marked_by) {
    const trade = inspection.trade ? ` (${inspection.trade})` : ''
    const label = inspection.type ? `${inspection.type}${trade}` : 'Inspection'
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const at = proj?.name ? ` at ${proj.name}` : ''

    await logActivity(
      db, params.id, actorName, 'inspection_ready',
      `${label} marked ready for inspection${inspection.trade ? '' : at}`,
      { inspection_id: inspection.id, inspection_type: inspection.type, trade: inspection.trade },
      user.id,
    )

    // STRUCTURAL first, then whoever the company said should hear it.
    //
    // Whoever asked for it and whoever books it are told because of their part
    // in this inspection, not because of their role - that is not a setting and
    // must not become one. Everyone else comes from Settings -> Notifications ->
    // Who gets told.
    //
    // This used to fall back to EVERY profile at the GC company. Ten office
    // staff, ten notifications, every time somebody marked work ready - which
    // is how people learn to ignore the bell.
    const recipients = withStructural(
      await audienceFor({
        db, companyId: proj?.gc_company_id, type: 'inspection_ready', exclude: user.id,
      }),
      [inspection.requested_by_id, inspection.scheduler_profile_id],
      user.id,
    )
    if (recipients.length) {
      await notify({
        db, userIds: recipients, type: 'inspection_ready',
        title: 'Ready for inspection',
        message: `${updates.ready_marked_by} marked ${label}${at} ready for inspection. Book the inspector when you can.`,
        link: `/projects/${params.id}/inspections`,
      })
    }
  }

  // Somebody was just put on the hook for booking this, and until now nothing
  // told them. `scheduler_profile_id` has always been editable here and no
  // notification fired on it, so assigning a scheduler through Edit - rather
  // than on the original request - was silent. The person found out by opening
  // the inspections list, if they ever did.
  const newScheduler = updates.scheduler_profile_id as string | null | undefined
  if (newScheduler && newScheduler !== priorScheduler) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const label = inspection.type ? `${inspection.type}${inspection.trade ? ` (${inspection.trade})` : ''}` : 'Inspection'
    const at = proj?.name ? ` at ${proj.name}` : ''
    const bookers = withStructural(
      await audienceFor({
        db, companyId: (proj as any)?.gc_company_id, type: 'inspection_to_schedule', exclude: user.id,
      }),
      [newScheduler],
      user.id,
    )
    if (bookers.length) {
      await notify({
        db, userIds: bookers, type: 'inspection_to_schedule',
        title: 'Inspection to book',
        message: `${actorName} put you on booking the ${label} inspection${at}.`,
        link: `/projects/${params.id}/inspections`,
      })
    }
  }

  // Follow-up notifications on status changes: keep the requester (and scheduler)
  // in the loop when the inspection is booked, passes, or fails.
  if (newStatus && ['scheduled', 'passed', 'failed', 'pending_reinspection'].includes(newStatus)) {
    const { data: proj } = await db.from('projects').select('name, gc_company_id').eq('id', params.id).single()
    const label = inspection.type ? `${inspection.type}${inspection.trade ? ` (${inspection.trade})` : ''}` : 'Inspection'
    const at = proj?.name ? ` at ${proj.name}` : ''
    let msg = ''
    if (newStatus === 'scheduled') msg = `Your ${label} inspection${at} is scheduled${inspection.scheduled_date ? ` for ${inspection.scheduled_date}${inspection.scheduled_time ? ` ${inspection.scheduled_time}` : ''}` : ''}.`
    else if (newStatus === 'passed') msg = `✅ ${label} inspection${at} PASSED.`
    else if (newStatus === 'failed') msg = `❌ ${label} inspection${at} FAILED.${inspection.notes ? ` ${inspection.notes}` : ''}`
    else if (newStatus === 'pending_reinspection') msg = `${label} inspection${at} needs a re-inspection.`

    // Passed/failed also loops in the scheduler; scheduling itself only pings the
    // requester. Plus whoever the company said should hear an inspection result -
    // a failed inspection is the one somebody other than the requester needs to
    // know about, and before this only the requester and the booker were told.
    const recipients = withStructural(
      await audienceFor({
        db, companyId: (proj as any)?.gc_company_id, type: 'inspection_result', exclude: user.id,
      }),
      [
        inspection.requested_by_id,
        newStatus !== 'scheduled' ? inspection.scheduler_profile_id : null,
      ],
      user.id, // don't notify the person who made the change
    )
    if (msg && recipients.length) {
      // The type used to be built from newStatus - `inspection_scheduled`,
      // `inspection_passed`, `inspection_failed` - three strings no preference
      // had ever heard of. One type now, with the outcome in the message where
      // a person reads it.
      await notify({
        db, userIds: recipients, type: 'inspection_result',
        title: 'Inspection update', message: msg,
        link: `/projects/${params.id}/inspections`,
      })
    }
  }

  return NextResponse.json({ inspection })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; inspectionId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('inspections')
    .delete()
    .eq('id', params.inspectionId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

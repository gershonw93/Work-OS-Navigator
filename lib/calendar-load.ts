import type { SupabaseClient } from '@supabase/supabase-js'
import { actorForUser } from './server-permissions'
import { myJobs } from './my-jobs'
import { vendorCompanyIds } from './sub-companies'
import { taskIdsFor } from './task-assignees'
import { isAssignedOnly } from './permissions'
import { actorCan } from './server-permissions'
import { ownJobsRefusal } from './sub-account'
import { feedScope } from './calendar-feed'
import { calendarItems, type CalendarItem } from './calendar-items'

/**
 * Everything on one person's calendar, read and decided. The Calendar page
 * (`/api/my-calendar`) and the calendar-app feed (`/api/calendar/<token>`) both
 * call this, so what the screen shows and what the phone subscribes to are one
 * answer. The rule itself is `calendarItems`; this only gathers its rows.
 *
 * Returns null when ANY read failed - never a shorter calendar. A calendar
 * missing half its days is one somebody plans a week from.
 */
export async function loadCalendar(
  db: SupabaseClient,
  profile: { id: string; company_id: string; full_name?: string | null; email?: string | null },
): Promise<CalendarItem[] | null> {
  const actor = await actorForUser(db, profile.id)
  let assignment = null
  if (isAssignedOnly(actor.role)) {
    const { projectIds, memberIds } = await myJobs(db, profile.id, profile)
    assignment = { projectIds, taskIds: await taskIdsFor(db, { memberIds, name: profile.full_name ?? null }) }
  }
  const scope = feedScope(actor, assignment)
  if (!scope) return null

  // A GC's job reaches this calendar through the GC's Directory row for this
  // company (migration 169) - the same set every sub door asks.
  const mine = await vendorCompanyIds(db, profile.company_id)
  if (mine === null) return null

  const [owned, subs] = await Promise.all([
    db.from('projects').select('id, name')
      .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`),
    db.from('subcontracts').select('id, project_id, trade, projects(name)').in('company_id', mine),
  ])
  if (owned.error || subs.error) {
    console.error('[calendar] job read failed', { profile: profile.id, error: (owned.error ?? subs.error)?.message })
    return null
  }
  const ownProjects = (owned.data ?? []) as { id: string; name: string }[]
  const awarded = ((subs.data ?? []) as any[]).map(s => ({
    id: s.id, project_id: s.project_id, trade: s.trade ?? null, project_name: s.projects?.name ?? '',
  }))
  const ids = Array.from(new Set([...ownProjects.map(p => p.id), ...awarded.map(a => a.project_id)]))
  // THE COMPANY'S OWN SERVICE CALLS, which belong to no job - so they are read
  // whether or not there are any jobs. The office sees every booked call, crew
  // only their own (the service-calls rule, lib/service-calls-server.ts), and
  // a light account has none. A failed read fails the calendar, like any other.
  let calls: NonNullable<Parameters<typeof calendarItems>[0]['calls']> = []
  if (actorCan(actor, 'service-calls', 'view') && !(await ownJobsRefusal(db, profile.company_id))) {
    let q = db.from('service_calls')
      .select('id, call_number, issue, customer_name, status, scheduled_start, scheduled_end')
      .eq('company_id', profile.company_id)
      .not('scheduled_start', 'is', null)
      .order('scheduled_start', { ascending: true })
      .limit(1000)
    if (isAssignedOnly(actor.role)) q = q.eq('assigned_to', profile.id)
    const { data, error } = await q
    if (error) {
      console.error('[calendar] service call read failed', { profile: profile.id, error: error.message })
      return null
    }
    calls = (data ?? []) as any
  }

  if (!ids.length) {
    return calendarItems({ ownProjects: [], awarded: [], schedule: [], tasks: [], inspections: [], companyTaskIds: [], scope, calls })
  }

  const none = Promise.resolve({ data: [] as any[], error: null })
  const [sched, tasks, inspections, companyTaskIds] = await Promise.all([
    scope.schedule
      ? db.from('schedule_items').select('id, project_id, start_date, end_date, label, color, subcontract_id, subcontracts(scope, trade, companies(name))').in('project_id', ids)
      : none,
    scope.tasks
      ? db.from('project_tasks').select('id, project_id, title, due_date, status').in('project_id', ids).not('due_date', 'is', null)
      : none,
    scope.inspections
      ? db.from('inspections').select('id, project_id, type, trade, status, scheduled_date').in('project_id', ids).not('scheduled_date', 'is', null)
      : none,
    awarded.length && scope.tasks ? taskIdsFor(db, { companyIds: mine }) : Promise.resolve([] as string[]),
  ])
  if (sched.error || tasks.error || inspections.error || companyTaskIds === null) {
    console.error('[calendar] event read failed', {
      profile: profile.id,
      error: (sched.error ?? tasks.error ?? inspections.error)?.message ?? 'company task lookup failed',
    })
    return null
  }

  return calendarItems({
    ownProjects,
    awarded,
    schedule: (sched.data ?? []) as any,
    tasks: (tasks.data ?? []) as any,
    inspections: (inspections.data ?? []) as any,
    companyTaskIds,
    scope,
    calls,
  })
}

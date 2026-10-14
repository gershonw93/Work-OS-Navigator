import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject, billingLock } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// A SUBCONTRACTOR'S OWN-JOB PLANNER (`components/projects/sub-schedule.tsx`,
// rendered only when a sub company OWNS the job): when they will do it, for how
// long, with how many people, and the overlap with their other open jobs.
//
// Both handlers answered any login. GET handed any job's dates to anybody; the
// PATCH let anybody rewrite any job's `sched_*` columns by id. The planner is
// the owning company's, so `ownedProject`, plus `schedule: view` - for the
// save too, with the billing lock asked by hand: the planner's Save sits in
// front of everybody who can open the Schedule tab, and gating it on edit would
// take it from a field supervisor (`schedule: V`) who uses it today.
async function gate(request: Request, projectId: string, write: boolean) {
  const db = admin()
  const g = await requirePermission(db, request, 'schedule', 'view')
  if (denied(g)) return g
  const owned = await ownedProject(db, g.actor, projectId, 'id')
  if ('denied' in owned) return owned
  if (write) {
    const locked = await billingLock(db, g.actor.companyId)
    if (locked) return { denied: locked }
  }
  return g
}

// This project's job schedule + the company's other scheduled jobs (for overlap checks).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const g = await gate(request, params.id, false)
  if ('denied' in g) return g.denied
  const db = admin()

  const profile = { company_id: g.actor.companyId }
  const { data: project } = await db.from('projects')
    .select('id, name, sched_start, sched_days, sched_workers').eq('id', params.id).single()

  let others: any[] = []
  if (profile?.company_id) {
    const { data } = await db.from('projects')
      .select('id, name, sched_start, sched_days, sched_workers, status')
      .eq('created_by_company_id', profile.company_id)
      .neq('id', params.id)
      .not('sched_start', 'is', null)
      .in('status', ['planning', 'active'])
    others = data ?? []
  }
  return NextResponse.json({ project: project ?? null, others })
}

// Save this project's schedule.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const g = await gate(request, params.id, true)
  if ('denied' in g) return g.denied
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.sched_start !== undefined) updates.sched_start = body.sched_start || null
  if (body.sched_days !== undefined) updates.sched_days = body.sched_days != null ? Number(body.sched_days) : null
  if (body.sched_workers !== undefined) updates.sched_workers = body.sched_workers != null ? Number(body.sched_workers) : null
  const { error } = await admin().from('projects').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

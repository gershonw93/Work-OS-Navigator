import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { actorCan } from '@/lib/server-permissions'
import { jobGate, companyProfileIds } from '@/lib/job-access'
import { projectSite } from '@/lib/project-site'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Everyone's punches, including selfies, locations and approval state, used
  // to go to any signed-in user. Only someone who manages time (edit rights)
  // sees the crew's entries; everyone else sees their own.
  //
  // AND ONLY ON A JOB THEY ARE ON, with the export's narrowing. The manage
  // check was the whole gate, so an admin of ANY company holding a job id got
  // that job's whole crew - selfies and locations included. `jobGate` asks
  // whether they are on it; a manager on somebody else's job (a sub's admin on
  // a GC's job) gets their own company's crew, not the GC's. Same rule as
  // `time/export`, which already did this for the CSV of the same list.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'time', 'view')
  if ('denied' in gate) return gate.denied
  const user = { id: gate.actor.userId }
  const canManage = actorCan(gate.actor, 'time', 'edit')
  let query = db
    .from('time_entries')
    .select('*')
    .eq('project_id', params.id)
    .order('clock_in_at', { ascending: false })
  if (!canManage) query = query.eq('profile_id', user.id)
  else if (gate.side !== 'gc') {
    const crew = await companyProfileIds(db, gate.actor.companyId)
    query = query.in('profile_id', crew?.length ? crew : [user.id])
  }

  // Whether this job has a usable place on the map. Every punch is measured
  // against it, so a screen full of flagged entries with no explanation is
  // exactly what a missing pin looks like - the reason belongs on the same
  // screen as the consequence.
  const [{ data: entries, error }, { data: project }] = await Promise.all([
    query,
    db.from('projects').select('address, lat, lng, geocoded_address').eq('id', params.id).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const myOpen = (entries ?? []).find(e => e.profile_id === user.id && !e.clock_out_at) ?? null
  return NextResponse.json({
    entries: entries ?? [], myOpen, myId: user.id, canManage,
    site: projectSite(project ?? {}),
  })
}

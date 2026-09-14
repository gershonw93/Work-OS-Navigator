import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { projectSite } from '@/lib/project-site'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Everyone's punches, including selfies, locations and approval state, used
  // to go to any signed-in user. Only someone who manages time (edit rights)
  // sees the crew's entries; everyone else sees their own.
  const actor = await getActor(db, token)
  const canManage = actorCan(actor, 'time', 'edit')

  let query = db
    .from('time_entries')
    .select('*')
    .eq('project_id', params.id)
    .order('clock_in_at', { ascending: false })

  if (!canManage) query = query.eq('profile_id', user.id)

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

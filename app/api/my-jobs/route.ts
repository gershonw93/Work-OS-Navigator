import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { billingLock } from '@/lib/api-guard'
import { projectSlotProblem } from '@/lib/billing-read'
import { myJobs } from '@/lib/my-jobs'
import { isAssignedOnly } from '@/lib/permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role, email, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ awarded: [], own: [] })

  // A CREW MEMBER SEES THE JOBS THEY ARE ON, NOT EVERY JOB THE COMPANY HAS.
  // The GC side has always scoped assigned-only roles this way (the projects
  // list, its stats, search); a subcontractor's own jobs were listed whole, so
  // a sub's field worker was handed every private homeowner job the owner had.
  // Awarded GC jobs are left as they are: nothing on the sub side assigns crew
  // to one yet, so filtering them would hide every GC job from the crew.
  const assigned = isAssignedOnly(profile.role)
    ? (await myJobs(db, user.id, profile)).projectIds
    : null

  // Awarded jobs: subcontracts for this company
  const { data: subcontracts } = await db
    .from('subcontracts')
    .select('*, projects(id, name, address, type, status, start_date)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false })

  // Own jobs: projects created by this company (not through bidding)
  const { data: ownProjects } = await db
    .from('projects')
    .select('id, name, address, type, status, start_date, customer_id, customers(name)')
    .eq('created_by_company_id', profile.company_id)
    .order('created_at', { ascending: false })

  const own = assigned
    ? (ownProjects ?? []).filter((p: { id: string }) => assigned.includes(p.id))
    : ownProjects ?? []

  return NextResponse.json({
    awarded: subcontracts ?? [],
    own,
    company_id: profile.company_id,
  })
}

export async function POST(request: Request) {
  // Sub creates their own private project
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company found' }, { status: 400 })

  // THE SAME THREE QUESTIONS AS /api/projects, because this is the same act
  // through a second door. It asked none of them: any signed-in account could
  // open a job here - including the free vendor account a sub makes from a
  // quote link, whose whole definition is that it sees the jobs it is invited
  // to and opens none of its own (`read_only` holds `projects: view` only).
  // A rule that exists on one door has to exist on the others.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'create')) {
    return NextResponse.json({ error: 'Your account can see the jobs you are invited to, but cannot create jobs of its own.' }, { status: 403 })
  }
  const locked = await billingLock(db, profile.company_id)
  if (locked) return locked
  const slot = await projectSlotProblem(db, profile.company_id)
  if (slot) return NextResponse.json({ error: slot, billing: 'project_limit' }, { status: 402 })

  const body = await request.json()
  const { name, address, type, start_date, description, customer_id } = body
  if (!name) return NextResponse.json({ error: 'Project name is required' }, { status: 400 })

  const { data: project, error } = await db.from('projects').insert({
    name,
    address: address || null,
    type: type || 'other',
    start_date: start_date || null,
    description: description || null,
    customer_id: customer_id || null,
    status: 'planning', // Quote / Pending until the quote is approved & converted
    gc_company_id: profile.company_id,
    created_by_company_id: profile.company_id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ project })
}

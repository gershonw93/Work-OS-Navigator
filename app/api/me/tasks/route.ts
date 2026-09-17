import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { myJobs } from '@/lib/my-jobs'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Field-worker home feed: everything a worker needs on one screen -
// the jobs they're assigned to, their own open tasks across all of them,
// and whether they're currently clocked in (and where).
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles').select('email, full_name, role').eq('id', user.id).single()

  // --- 1. Which projects is this worker on? `myJobs` is the one home for that
  // chain - the inspections feed asks the same question and must get the same
  // answer.
  const { memberIds, projectIds } = await myJobs(db, user.id, profile)

  if (!projectIds.length) {
    return NextResponse.json({ projects: [], tasks: [], openEntry: null })
  }

  // --- 2. The projects themselves (active ones first).
  let { data: projects, error: pErr } = await db
    .from('projects')
    .select('id, name, status, address, client, lat, lng')
    .in('id', projectIds)
    .order('created_at', { ascending: false })
  if (pErr && (pErr as any).code === '42703') {
    projects = (await db.from('projects')
      .select('id, name, status, address, client')
      .in('id', projectIds).order('created_at', { ascending: false })).data as any
  }
  const projectName = new Map((projects ?? []).map((p: any) => [p.id, p.name]))

  // --- 3. Tasks assigned to this worker across those projects.
  // Match on the team-member ids we resolved, plus a name fallback.
  const tasks: any[] = []
  if (memberIds.length) {
    const { data: byMember } = await db
      .from('project_tasks').select('*')
      .in('project_id', projectIds)
      .in('assigned_to_member_id', memberIds)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (byMember?.length) tasks.push(...byMember)
  }
  if (profile?.full_name) {
    const { data: byName } = await db
      .from('project_tasks').select('*')
      .in('project_id', projectIds)
      .eq('assigned_to_name', profile.full_name)
      .order('due_date', { ascending: true, nullsFirst: false })
    if (byName?.length) {
      const seen = new Set(tasks.map(t => t.id))
      for (const t of byName) if (!seen.has(t.id)) tasks.push(t)
    }
  }
  const tasksOut = tasks.map(t => ({ ...t, project_name: projectName.get(t.project_id) ?? '' }))

  // --- 4. Am I currently clocked in anywhere?
  const { data: openEntries } = await db
    .from('time_entries')
    .select('id, project_id, clock_in_at')
    .eq('profile_id', user.id)
    .is('clock_out_at', null)
    .order('clock_in_at', { ascending: false })
    .limit(1)
  const open = openEntries?.[0] ?? null
  const openEntry = open
    ? { ...open, project_name: projectName.get(open.project_id) ?? '' }
    : null

  return NextResponse.json({
    projects: projects ?? [],
    tasks: tasksOut,
    openEntry,
    me: { id: user.id, name: profile?.full_name ?? user.email ?? 'Worker', role: profile?.role ?? null },
  })
}

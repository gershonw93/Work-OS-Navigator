import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { taskIdsFor } from '@/lib/task-assignees'
import { createTask } from '@/lib/writes/task'

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

  const { data: profile } = await db.from('profiles').select('role, full_name').eq('id', user.id).single()

  const [{ data: members }, { data: subcontracts }] = await Promise.all([
    db.from('project_team_members').select('id, name, role').eq('project_id', params.id).order('name'),
    db.from('subcontracts').select('id, scope, trade, companies(id, name)').eq('project_id', params.id).order('created_at'),
  ])

  const restrictedRoles = ['field_supervisor', 'worker', 'read_only', 'member']
  let tasks: any[] = []

  if (profile?.role && restrictedRoles.includes(profile.role)) {
    const { data: profileFull } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()

    // Find team member record: try profile_id, then email, then name
    let memberRecord: { id: string } | null = null

    const { data: byProfileId } = await db
      .from('project_team_members').select('id').eq('project_id', params.id).eq('profile_id', user.id).maybeSingle()
    memberRecord = byProfileId ?? null

    if (!memberRecord && profileFull?.email) {
      const { data: byEmail } = await db
        .from('project_team_members').select('id').eq('project_id', params.id).eq('email', profileFull.email).maybeSingle()
      memberRecord = byEmail ?? null
    }

    if (!memberRecord && profileFull?.full_name) {
      const { data: byName } = await db
        .from('project_team_members').select('id').eq('project_id', params.id).eq('name', profileFull.full_name).maybeSingle()
      memberRecord = byName ?? null
    }

    // ONE LOOKUP over the join table, covering the roster row AND the name.
    // These were two separate queries over the single-assignee columns, and
    // the name one was reached only when there was no roster row - so
    // somebody who is a member on one task and a typed name on another saw
    // half their work.
    const mineIds = await taskIdsFor(db, {
      memberIds: [memberRecord?.id],
      name: profileFull?.full_name ?? null,
    })
    if (mineIds && mineIds.length) {
      const { data: rawTasks } = await db
        .from('project_tasks').select('*')
        .eq('project_id', params.id).in('id', mineIds)
        .order('created_at', { ascending: false })
      tasks = rawTasks ?? []
    }
  } else {
    const { data: allTasks } = await db.from('project_tasks').select('*').eq('project_id', params.id).order('created_at', { ascending: false })
    tasks = allTasks ?? []
  }

  // WHO IS ON EACH TASK. `project_task_assignees` is the home for that now -
  // a task can carry several people, and the three `assigned_to_*` columns
  // could only ever hold one. Fetched for the whole page in ONE query rather
  // than per task: this route already serves a board of 134 rows.
  //
  // A refused read is LOUD and leaves the tasks alone rather than reporting
  // them unassigned: "nobody is on this" is a statement somebody acts on, and
  // it must never be the sound of a query that failed.
  const taskIds = (tasks ?? []).map((t: any) => t.id)
  let assigneesByTask: Record<string, any[]> = {}
  if (taskIds.length) {
    const { data: rows, error: aErr } = await db
      .from('project_task_assignees')
      .select('id, task_id, member_id, company_id, name')
      .in('task_id', taskIds)
    if (aErr) console.error('[tasks] assignee read failed:', aErr.message)
    for (const r of (rows ?? []) as any[]) {
      const list = assigneesByTask[r.task_id] ?? []
      list.push({ id: r.id, member_id: r.member_id, company_id: r.company_id, name: r.name })
      assigneesByTask[r.task_id] = list
    }
  }
  const tasksWithAssignees = (tasks ?? []).map((t: any) => ({
    ...t,
    assignees: assigneesByTask[t.id] ?? [],
  }))

  return NextResponse.json({
    tasks: tasksWithAssignees,
    members: members ?? [],
    subcontracts: subcontracts ?? [],
  })
}


export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // `view`, NOT `create`, AND THAT IS DELIBERATE. Three doors create a task
  // and only one of them belongs to people holding tasks:create: a field
  // supervisor raises one from a daily-log issue (tasks VE), and an invited sub
  // adds one from My Jobs (tasks V). Gating on create would close both
  // silently. This still shuts the door on anybody with no task access at all,
  // and the Tasks tab's own button asks for create.
  const gate = await requirePermission(db, request, 'tasks', 'view')
  if (denied(gate)) return gate.denied
  // A `view` gate skips the read-only lock (it only runs for write actions),
  // and this IS a write - so it is asked here, as the hand-gated routes do.
  const locked = await billingLock(db, gate.actor.companyId)
  if (locked) return locked
  const user = { id: gate.actor.userId }

  const body = await request.json()
  // Everything after the gate is `createTask`, which Claude's MCP server calls too.
  const result = await createTask(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

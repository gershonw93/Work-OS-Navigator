import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { notify } from '@/lib/notify'
import { normalizeAssignees, assigneeLabel, taskIdsFor } from '@/lib/task-assignees'

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

const TASK_STATUSES = ['open', 'in_progress', 'completed']

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { title, description, due_date, priority, status, assigned_to_member_id, assigned_to_company_id, assigned_to_name, image_url, follow_up_date, follow_up_note, source_daily_log_id } = body

  // A TASK CAN HAVE SEVERAL PEOPLE ON IT. `assignees` is the shape now; the
  // three `assigned_to_*` fields are still accepted because five other
  // screens create a pre-assigned task through this route (a plan pin, a
  // daily log, a budget line) and each hands over exactly one person. They
  // are folded into the same list rather than kept as a second home.
  const assignees = normalizeAssignees([
    ...(Array.isArray(body?.assignees) ? body.assignees : []),
    { member_id: assigned_to_member_id, company_id: assigned_to_company_id, name: assigned_to_name },
  ])
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('project_tasks')
    .insert({
      project_id: params.id,
      title,
      description: description || null,
      due_date: due_date || null,
      priority: priority || 'medium',
      // The board's per-column "+" says which column it is adding to, and this
      // used to be hardcoded 'open' - so adding from In Progress or Completed
      // put the card somewhere else. Whitelisted, not passed through: the
      // value comes from the browser and the column has a check constraint.
      status: TASK_STATUSES.includes(status) ? status : 'open',
      // The board's Completed column has a "+" too, so a task can be born
      // finished. Same rule as the PATCH: the timestamp follows the status.
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      assigned_to_member_id: assigned_to_member_id || null,
      assigned_to_company_id: assigned_to_company_id || null,
      assigned_to_name: assigned_to_name || null,
      image_url: image_url || null,
      follow_up_date: follow_up_date || null,
      follow_up_note: follow_up_note || null,
      // Set when the task was raised from a field log observation.
      source_daily_log_id: source_daily_log_id || null,
      created_by: (profile as any)?.full_name ?? 'Unknown',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log task creation to job history
  const actorName = (profile as any)?.full_name ?? user.email ?? 'Someone'
  // THE ASSIGNEES, written after the task exists because they point at it.
  // Logged rather than thrown: the task is the thing that was asked for, and
  // a task that saved with nobody on it is recoverable in one edit, while a
  // 500 here would leave a row the caller believes was never created.
  if (assignees.length) {
    const { error: aErr } = await db.from('project_task_assignees')
      .insert(assignees.map(a => ({ task_id: (data as any).id, ...a })))
    if (aErr) console.error('[tasks] could not save assignees:', aErr.message)
  }

  const assignedLabel = assignees.length ? ` (assigned to ${assigneeLabel(assignees, 2)})` : ''
  await logActivity(
    db, params.id, actorName, 'task_created',
    `${actorName} created task "${title}"${assignedLabel}`,
    { task_id: (data as any)?.id }, user.id,
  )

  // TELL EVERYONE WHO IS ON IT, ONCE EACH.
  //
  // This used to be two blocks reading the two `assigned_to_*` columns, which
  // could only ever name one person and one company. With several people on a
  // task the recipients have to be gathered across every assignee and then
  // DEDUPED - somebody who is both on the roster and at the assigned sub is
  // one person, and two identical "you have been assigned a task" emails for
  // one task is the thing the bell and the letter are kept apart to avoid.
  const memberIds = assignees.map(a => a.member_id).filter(Boolean) as string[]
  const companyIds = assignees.map(a => a.company_id).filter(Boolean) as string[]
  const recipientIds = new Set<string>()

  if (memberIds.length) {
    const { data: members } = await db.from('project_team_members')
      .select('id, email, profile_id').in('id', memberIds)
    const needEmailLookup: string[] = []
    for (const m of (members ?? []) as any[]) {
      if (m.profile_id) recipientIds.add(m.profile_id)
      else if (m.email) needEmailLookup.push(m.email)
    }
    // A roster row with no account yet still names somebody who may have one.
    if (needEmailLookup.length) {
      const { data: ps } = await db.from('profiles').select('id').in('email', needEmailLookup)
      for (const p of (ps ?? []) as any[]) recipientIds.add(p.id)
    }
  }

  if (companyIds.length) {
    // Everyone at the company, never .single() - that errors unless there is
    // exactly one user, which silently dropped the notification for any sub
    // with a second account.
    const { data: subProfiles } = await db.from('profiles').select('id').in('company_id', companyIds)
    for (const p of (subProfiles ?? []) as any[]) recipientIds.add(p.id)
  }

  if (recipientIds.size) {
    await notify({
      db, userIds: Array.from(recipientIds), type: 'task_assigned', title: 'Task assigned',
      message: `You have been assigned a task: "${title}"`,
      link: `/projects/${params.id}/tasks`,
    })
  }

  return NextResponse.json({ task: data })
}

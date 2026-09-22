import { createClient } from '@supabase/supabase-js'
import { progressReader } from '@/lib/schedule-progress-read'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // middleware.ts returns early for every /api/ path, so nothing else gates
  // this. The whole schedule family was answering anybody with a login.
  const gate = await requirePermission(admin(), request, 'schedule', 'view')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: items } = await db
    .from('schedule_items')
    .select('*, subcontracts(scope, trade, companies(name, type))')
    .eq('project_id', params.id)
    .order('start_date', { ascending: true })

  // THE OTHER DATED THINGS ON THIS JOB, fetched alongside rather than after.
  //
  // This route returned schedule bars and nothing else, so the job's calendar
  // could not draw an inspection - reported as "this scheduled inspection
  // SHOULD show on the project's calendar? why don't I see it by September 15".
  // It was booked, and the screen had never looked.
  //
  // BOOKED inspections only: a calendar is appointments, and `requested_date`
  // is a day somebody asked for that nobody has agreed to. Tasks come with
  // their status so a finished one can be struck through rather than dropped.
  const [{ data: project }, { data: inspections }, { data: tasks }] = await Promise.all([
    db.from('projects').select('start_date, end_date').eq('id', params.id).single(),
    db.from('inspections')
      .select('id, type, trade, status, scheduled_date, scheduled_time')
      .eq('project_id', params.id).neq('status', 'void').not('scheduled_date', 'is', null),
    db.from('project_tasks')
      .select('id, title, status, due_date')
      .eq('project_id', params.id).not('due_date', 'is', null),
  ])

  // HOW FAR ALONG EACH LINE IS, DERIVED, so the edit dialog can show what the
  // app would answer WITHOUT a typed number - "19% from their budget lines" -
  // beside an empty box rather than inside it. Prefilling the box would turn a
  // derived fact into a typed claim the first time anybody pressed Save.
  //
  // Inside the existing Promise.all rather than as a fourth sequential trip:
  // this layout is paid on every navigation.
  let progress: Record<string, { pct: number | null; source: string }> = {}
  try {
    const readProgress = await progressReader(db, (items ?? []) as any)
    progress = Object.fromEntries((items ?? []).map((i: any) => [i.id, readProgress(i.id)]))
  } catch (e: any) {
    // The schedule is the thing that was asked for. A roll-up that failed
    // costs a hint, not the page.
    console.error('[schedule] progress roll-up failed:', e?.message)
  }

  // WHY EACH LINE'S DATES MOVED. On the main payload rather than a route of
  // its own so the list badges and the dialog's history panel need no extra
  // round trip - this page is a layout-nested client fetch and every trip is
  // paid on each navigation.
  //
  // `changed_by_name` is resolved here: the table stores an id that SET NULLs
  // when the account goes, and the point of the record is that it outlives the
  // account, so a missing name is normal rather than an error.
  let changes: Record<string, any[]> = {}
  {
    const { data: rows, error } = await db
      .from('schedule_date_changes')
      .select('id, schedule_item_id, kind, reason, from_start, from_end, to_start, to_end, caused_by_item_id, changed_by, created_at')
      .eq('project_id', params.id)
      .order('created_at', { ascending: true })
      .limit(500)

    // A refused query and an empty one are the same `[]` otherwise, and here
    // that would read as "this line has never moved" on a line that has.
    if (error) console.error('[schedule] history read failed:', error.message)

    const actorIds = Array.from(new Set(
      (rows ?? []).map((r: any) => r.changed_by).filter(Boolean),
    ))
    const names = new Map<string, string>()
    if (actorIds.length) {
      const { data: people } = await db.from('profiles').select('id, full_name').in('id', actorIds)
      for (const pr of (people ?? []) as any[]) names.set(pr.id, pr.full_name ?? '')
    }

    for (const r of (rows ?? []) as any[]) {
      const list = changes[r.schedule_item_id] ?? []
      list.push({ ...r, changed_by_name: names.get(r.changed_by) || null })
      changes[r.schedule_item_id] = list
    }
  }

  // EVERY LINK ON THE JOB, not just the open dialog's.
  //
  // The dialog already fetches its OWN line's links and will keep doing so -
  // that read is the one the three-state `existingState` guard is built on.
  // This is a different question: what a line PROBABLY waits for can only be
  // answered against the whole board, because the suggester has to know which
  // lines have been linked already (they have been thought about, and are left
  // alone) and it has to run `findCycle` over the real graph before proposing
  // anything.
  //
  // Free in practice - 121 lines across 26 jobs carry five links between them,
  // which is the entire reason this feature exists - and it rides the payload
  // this page already waits for rather than a fourth trip paid on every
  // navigation.
  let links: { id: string; task_id: string; predecessor_task_id: string }[] = []
  {
    const { data, error } = await db
      .from('schedule_dependencies')
      .select('id, task_id, predecessor_task_id')
      .eq('project_id', params.id)
    // A refused query reads as "nothing is linked", which is the exact state
    // the suggestions are computed FROM - so it would quietly propose links
    // for lines that already have them.
    if (error) console.error('[schedule] links read failed:', error.message)
    links = (data ?? []) as typeof links
  }

  return NextResponse.json({
    items: items ?? [], project, progress, changes, links,
    inspections: inspections ?? [], tasks: tasks ?? [],
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  // middleware.ts returns early for every /api/ path, so nothing else gates
  // this. The whole schedule family was answering anybody with a login.
  const gate = await requirePermission(admin(), request, 'schedule', 'create')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // A WHITELIST WITH A FIELD MISSING FAILS EXACTLY LIKE A REJECTION, and only
  // one of them says so. `trade` was absent here while `addPlaceholder` had
  // been sending it since the day placeholders shipped: the route answered
  // 200, the line came back, and the trade was on the floor. Every one of the
  // 121 schedule lines in this database had a null trade because of this line.
  //
  // It is not cosmetic. The trade is the only name a placeholder has - a line
  // with a subcontract gets its trade from the subcontract, so this column
  // exists FOR the placeholder - and it is what `lib/trade-order.ts` reads to
  // work out what a line probably waits for. With it dropped, the dependency
  // picker named those lines from `scheduleLabel` instead and link suggestions
  // had nothing to reason from at all.
  const { label, start_date, end_date, color, subcontract_id, trade } = await request.json()
  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
  }
  if (!label && !subcontract_id) {
    return NextResponse.json({ error: 'label or subcontract_id required' }, { status: 400 })
  }

  const row: Record<string, unknown> = {
    project_id: params.id,
    start_date,
    end_date,
    subcontract_id: subcontract_id ?? null,
    label: label ?? null,
    color: color ?? null,
    trade: String(trade ?? '').trim() || null,
  }

  let { data, error } = await db.from('schedule_items').insert(row).select().single()

  // If label/color columns don't exist yet (migration pending), retry without them
  if (error && (error as any).code === '42703') {
    delete row.label; delete row.color; delete row.trade
    const retry = await db.from('schedule_items').insert(row).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

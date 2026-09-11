import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  return NextResponse.json({
    items: items ?? [], project,
    inspections: inspections ?? [], tasks: tasks ?? [],
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { label, start_date, end_date, color, subcontract_id } = await request.json()
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
  }

  let { data, error } = await db.from('schedule_items').insert(row).select().single()

  // If label/color columns don't exist yet (migration pending), retry without them
  if (error && (error as any).code === '42703') {
    delete row.label; delete row.color
    const retry = await db.from('schedule_items').insert(row).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

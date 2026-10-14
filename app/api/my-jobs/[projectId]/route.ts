import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { taskIdsFor } from '@/lib/task-assignees'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })

  const companyId = profile.company_id

  const [{ data: project, error: projectError }, { data: subcontracts }] = await Promise.all([
    db.from('projects').select('id, name, address, type, status, start_date').eq('id', params.projectId).single(),
    db.from('subcontracts').select('*').eq('project_id', params.projectId).eq('company_id', companyId).order('created_at', { ascending: true }),
  ])

  // ONE ANSWER FOR "NO SUCH JOB" AND "NOT YOUR JOB". It was a 404 carrying
  // the database's own words for a missing id and a 403 for a real one, which
  // tells any signed-in account which project ids exist.
  const notFound = () => NextResponse.json({ error: 'Project not found' }, { status: 404 })
  if (!project) {
    if (projectError) console.error('[my-jobs] project read failed', { project: params.projectId, error: projectError.message })
    return notFound()
  }

  const hasSubcontract = subcontracts && subcontracts.length > 0

  // Verify access: either has a subcontract, or owns the project
  if (!hasSubcontract) {
    const { data: ownership } = await db.from('projects').select('created_by_company_id').eq('id', params.projectId).eq('created_by_company_id', companyId).maybeSingle()
    if (!ownership) return notFound()
  }

  // WHICH TASKS ARE THIS SUB'S. Was `.eq('assigned_to_company_id', companyId)`
  // - the single-assignee column - so a task carrying this sub alongside
  // anybody else would have vanished from their own job page.
  const myTaskIds = await taskIdsFor(db, { companyId })

  const [{ data: tasks }, { data: rfis }, { data: inspections }, { data: invoices }, { data: dailyLogs }] = await Promise.all([
    myTaskIds && myTaskIds.length
      ? db.from('project_tasks').select('*').eq('project_id', params.projectId).in('id', myTaskIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    db.from('rfis').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false }),
    db.from('inspections').select('*').eq('project_id', params.projectId).order('created_at', { ascending: false }),
    db.from('invoices').select('*').eq('project_id', params.projectId).eq('company_id', companyId).order('created_at', { ascending: false }),
    // `weather`, not `weather_condition` - the second column was a fossil with
    // four rows in it and is gone (114). An unknown column takes the WHOLE
    // query down in PostgREST and reads back as "there aren't any".
    db.from('daily_logs').select('id, log_date, created_by_name, has_issues, weather, created_at').eq('project_id', params.projectId).order('log_date', { ascending: false }).limit(5),
  ])

  // THE WHOLE JOB'S SCHEDULE, theirs marked. A sub needs to see when the
  // trade before them finishes, not only their own bar. Served HERE rather
  // than through /api/projects/<id>/schedule, because this route has already
  // asked the question that matters for a sub - do they hold a subcontract on
  // this job - and the GC's schedule route asks only a permission. Read-only:
  // the one thing a sub may do to a line is report it late, through
  // ./schedule/<itemId>/delay, and only on their own.
  const mySubIds = new Set((subcontracts ?? []).map((s: any) => s.id))
  const [{ data: lines, error: linesErr }, { data: reports }] = await Promise.all([
    db.from('schedule_items')
      .select('id, trade, label, start_date, end_date, subcontract_id, subcontracts ( companies ( name ) )')
      .eq('project_id', params.projectId)
      .order('start_date', { ascending: true }),
    db.from('schedule_delay_reports')
      .select('id, schedule_item_id, days, reason, status, created_at, decided_at')
      .eq('project_id', params.projectId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
  ])
  if (linesErr) console.error('[my-jobs] schedule read failed', { project: params.projectId, error: linesErr.message })
  const schedule = linesErr ? null : (lines ?? []).map((l: any) => ({
    id: l.id,
    name: l.trade?.trim() || l.label?.trim() || 'Unnamed',
    company: l.subcontracts?.companies?.name ?? null,
    start_date: l.start_date,
    end_date: l.end_date,
    mine: !!l.subcontract_id && mySubIds.has(l.subcontract_id),
  }))

  // Fetch payment schedule items for all subcontracts
  const subcontractsWithSchedule = await Promise.all(
    (subcontracts ?? []).map(async (sub) => {
      const { data: psi } = await db.from('payment_schedule_items').select('*').eq('subcontract_id', sub.id).order('order_index', { ascending: true })
      return { ...sub, payment_schedule_items: psi ?? [] }
    })
  )

  return NextResponse.json({
    project,
    subcontracts: subcontractsWithSchedule,
    tasks: tasks ?? [],
    rfis: rfis ?? [],
    inspections: inspections ?? [],
    invoices: invoices ?? [],
    recentLogs: dailyLogs ?? [],
    // null when the read FAILED - not [], which would say "no schedule yet".
    schedule,
    delayReports: reports ?? [],
  })
}

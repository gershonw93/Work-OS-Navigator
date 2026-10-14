import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate, companyProfileIds } from '@/lib/job-access'
import { actorCan } from '@/lib/server-permissions'

import { formatDate } from '@/lib/dates'
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function csvCell(v: any) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Every punch on any job, as a CSV, to any login. Now `time: view` and on
  // this job, and the SAME narrowing the Time tab's list applies
  // (`time/route.ts`): somebody who manages time on their own company's job
  // gets the crew; a manager on somebody else's job gets their own crew; and
  // everybody else gets their own hours. The Export button is on the screen
  // for all of them, and now exports what that screen shows them.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'time', 'view')
  if ('denied' in gate) return gate.denied
  const manages = actorCan(gate.actor, 'time', 'edit')

  const url = new URL(request.url)
  const from = url.searchParams.get('from') // ISO date inclusive
  const to = url.searchParams.get('to')     // ISO date exclusive

  let q = db.from('time_entries').select('*').eq('project_id', params.id).order('clock_in_at', { ascending: true })
  if (!manages) q = q.eq('profile_id', gate.actor.userId)
  else if (gate.side !== 'gc') {
    const crew = await companyProfileIds(db, gate.actor.companyId)
    q = q.in('profile_id', crew?.length ? crew : [gate.actor.userId])
  }
  if (from) q = q.gte('clock_in_at', from)
  if (to) q = q.lt('clock_in_at', to)
  const { data: entries, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const header = ['Worker', 'Date', 'Clock In', 'Clock Out', 'Hours', 'In Distance (m)', 'Out Distance (m)', 'Flagged', 'Status']
  const rows = (entries ?? []).map(e => {
    const hours = e.clock_out_at
      ? ((new Date(e.clock_out_at).getTime() - new Date(e.clock_in_at).getTime()) / 3600000).toFixed(2)
      : ''
    const flagged = e.clock_in_flagged || e.clock_out_flagged ? 'YES' : ''
    return [
      e.worker_name ?? '',
      formatDate(e.clock_in_at),
      new Date(e.clock_in_at).toLocaleTimeString('en-US'),
      e.clock_out_at ? new Date(e.clock_out_at).toLocaleTimeString('en-US') : '',
      hours,
      e.clock_in_distance_m ?? '',
      e.clock_out_distance_m ?? '',
      flagged,
      e.approval_status ?? 'pending',
    ].map(csvCell).join(',')
  })

  const csv = [header.join(','), ...rows].join('\n')
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="timesheet-${from ?? 'all'}.csv"`,
    },
  })
}

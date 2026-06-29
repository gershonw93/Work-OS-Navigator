import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function csvCell(v: any) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const from = url.searchParams.get('from') // ISO date inclusive
  const to = url.searchParams.get('to')     // ISO date exclusive

  let q = db.from('time_entries').select('*').eq('project_id', params.id).order('clock_in_at', { ascending: true })
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
      new Date(e.clock_in_at).toLocaleDateString('en-US'),
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

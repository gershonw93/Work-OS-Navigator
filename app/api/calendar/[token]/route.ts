import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Escape a text value per the iCalendar spec.
function esc(s: string) {
  return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}
const ymd = (dateStr: string) => dateStr.replace(/-/g, '')      // 2026-03-12 -> 20260312
function plusOneDay(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`
}

// Public iCal feed - protected only by the secret token in the URL (that's how
// calendar apps subscribe; they can't send auth headers). Read-only.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: profile } = await db.from('profiles').select('id, company_id, full_name').eq('calendar_token', params.token).maybeSingle()
  if (!profile?.company_id) return new NextResponse('Invalid calendar link', { status: 404 })

  const { data: projects } = await db
    .from('projects').select('id, name')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
  const ids = (projects ?? []).map((p: any) => p.id)
  const nameById = new Map((projects ?? []).map((p: any) => [p.id, p.name]))

  type Ev = { uid: string; start: string; end: string; summary: string; desc: string }
  const events: Ev[] = []

  if (ids.length) {
    const [{ data: sched }, { data: tasks }, { data: inspections }] = await Promise.all([
      db.from('schedule_items').select('id, project_id, start_date, end_date, label, subcontracts(scope, trade, companies(name))').in('project_id', ids),
      db.from('project_tasks').select('id, project_id, title, due_date, status').in('project_id', ids).not('due_date', 'is', null),
      db.from('inspections').select('id, project_id, type, trade, status, scheduled_date').in('project_id', ids).not('scheduled_date', 'is', null),
    ])

    for (const s of sched ?? []) {
      const sub: any = (s as any).subcontracts
      const title = s.label || sub?.companies?.name || sub?.scope || sub?.trade || 'Scheduled work'
      const start = s.start_date
      if (!start) continue
      events.push({ uid: `sched-${s.id}@sytenav`, start, end: s.end_date || start, summary: `${title}`, desc: `${nameById.get(s.project_id) ?? ''}` })
    }
    for (const t of tasks ?? []) {
      events.push({ uid: `task-${t.id}@sytenav`, start: t.due_date, end: t.due_date, summary: `Task: ${t.title}`, desc: `${nameById.get(t.project_id) ?? ''}${t.status === 'completed' ? ' (done)' : ''}` })
    }
    for (const ins of inspections ?? []) {
      const label = `Inspection: ${ins.type ?? ''}${ins.trade ? ` (${ins.trade})` : ''}`
      events.push({ uid: `insp-${ins.id}@sytenav`, start: ins.scheduled_date, end: ins.scheduled_date, summary: label, desc: `${nameById.get(ins.project_id) ?? ''} · ${ins.status ?? ''}` })
    }
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SyteNav//Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:SyteNav', 'NAME:SyteNav',
  ]
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.start)}`,
      `DTEND;VALUE=DATE:${plusOneDay(e.end)}`,      // all-day end is exclusive
      `SUMMARY:${esc(e.summary)}`,
      `DESCRIPTION:${esc(e.desc)}`,
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')

  return new NextResponse(lines.join('\r\n'), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="sytenav.ics"',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}

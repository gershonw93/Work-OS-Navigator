import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { loadCalendar } from '@/lib/calendar-load'

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
  const { data: profile } = await db.from('profiles').select('id, company_id, full_name, email').eq('calendar_token', params.token).maybeSingle()
  if (!profile?.company_id) return new NextResponse('Invalid calendar link', { status: 404 })

  // THE HOLDER'S OWN PERMISSIONS, read at every poll - so a role change or a
  // removal reaches the feed on the calendar app's next refresh rather than
  // never. `loadCalendar` is the same answer the Calendar page shows: own jobs
  // by the holder's permissions, a GC's awarded jobs only for their own work
  // (lib/calendar-items.ts).
  const items = await loadCalendar(db, { ...profile, company_id: profile.company_id })
  // 503, not an empty calendar: a calendar app keeps its last good copy on an
  // error, and replaces it with nothing on an empty one.
  if (!items) return new NextResponse('Calendar temporarily unavailable', { status: 503 })

  type Ev = { uid: string; start: string; end: string; summary: string; desc: string }
  const UID: Record<string, string> = { schedule: 'sched', task: 'task', inspection: 'insp' }
  const events: Ev[] = items.map(it => ({
    uid: `${UID[it.kind]}-${it.id.slice(2)}@sytenav`,
    start: it.start,
    end: it.end,
    summary: it.kind === 'task' ? `Task: ${it.title}` : it.kind === 'inspection' ? `Inspection: ${it.title}` : it.title,
    desc: `${it.project_name}${it.kind === 'task' && it.done ? ' (done)' : ''}`,
  }))

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

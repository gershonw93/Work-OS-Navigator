import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor } from '@/lib/server-permissions'
import { loadCalendar } from '@/lib/calendar-load'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/my-calendar - the signed-in person's own calendar.
//
// Asked for because a subcontractor had no calendar at all: Master Calendar is
// admin-only and reads only jobs the company OWNS, so a GC's awarded work never
// appeared and a sub's crew had nothing. What it carries is `loadCalendar` -
// the same answer as the calendar-app feed - and every row in it is scoped to
// THIS person: their permissions, their assigned jobs and tasks if they are
// crew, and only their own work on a GC's job.
export async function GET(request: Request) {
  const db = admin()
  const actor = await getActor(db, request.headers.get('Authorization')?.replace('Bearer ', ''))
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.companyId) return NextResponse.json({ items: [] })

  const { data: profile, error } = await db
    .from('profiles').select('id, company_id, full_name, email').eq('id', actor.userId).maybeSingle()
  if (error || !profile?.company_id) {
    if (error) console.error('[my-calendar] profile read failed', { user: actor.userId, error: error.message })
    return NextResponse.json({ error: 'Could not load your calendar. Try again.' }, { status: 500 })
  }

  const items = await loadCalendar(db, { ...profile, company_id: profile.company_id })
  // A read that failed is an error on the screen, never an empty month.
  if (!items) return NextResponse.json({ error: 'Could not load your calendar. Try again.' }, { status: 500 })
  return NextResponse.json({ items })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { isAssignedOnly } from '@/lib/permissions'
import { ownJobsRefusal } from '@/lib/sub-account'
import { CALL_COLS, crewOf } from '@/lib/service-calls-server'
import { conflicts } from '@/lib/service-calls'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_SPAN_DAYS = 31

// GET /api/dispatch?from=<iso>&to=<iso> - the board: this company's crew, the
// calls booked in the window, the ones still waiting for somebody, and every
// double booking.
//
// The board is everybody's day, so it is the office's: `dispatch: view`, and
// NEVER an assigned-only role whatever a saved role map says (a map saved
// before this resource existed inherits it from `projects`, which every worker
// holds - see INHERITS_FROM). Moving a call on the board is the call's own
// PATCH, which asks `service-calls: edit`.
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'dispatch', 'view')
  if (denied(gate)) return gate.denied
  if (isAssignedOnly(gate.actor.role)) {
    return NextResponse.json({ error: 'The dispatch board is for the office. Your calls are under My calls.' }, { status: 403 })
  }
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company found for your account.' }, { status: 400 })
  const light = await ownJobsRefusal(db, companyId)
  if (light) return NextResponse.json({ error: light, account: 'light' }, { status: 403 })

  const url = new URL(request.url)
  const from = new Date(url.searchParams.get('from') ?? '')
  const to = new Date(url.searchParams.get('to') ?? '')
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    return NextResponse.json({ error: 'Which days? Send from and to.' }, { status: 400 })
  }
  if (to.getTime() - from.getTime() > MAX_SPAN_DAYS * 86_400_000) {
    return NextResponse.json({ error: `The board shows up to ${MAX_SPAN_DAYS} days at a time.` }, { status: 400 })
  }

  const [booked, waiting, crew] = await Promise.all([
    // Anything that OVERLAPS the window: starts before its end, and either has
    // no finish or finishes after its start.
    db.from('service_calls').select(CALL_COLS).eq('company_id', companyId)
      .not('scheduled_start', 'is', null)
      .lt('scheduled_start', to.toISOString())
      .gte('scheduled_start', new Date(from.getTime() - 86_400_000).toISOString())
      .order('scheduled_start', { ascending: true }),
    db.from('service_calls').select(CALL_COLS).eq('company_id', companyId)
      .eq('status', 'new').order('created_at', { ascending: true }).limit(200),
    crewOf(db, companyId),
  ])
  // A read that did not complete is not an emptier board: a dispatcher who
  // sees a free afternoon books somebody into it.
  if (booked.error || waiting.error || crew === null) {
    console.error('[dispatch] read failed', { company: companyId, error: (booked.error ?? waiting.error)?.message ?? 'crew' })
    return NextResponse.json({ error: 'Could not load the board. Try again.' }, { status: 500 })
  }
  const calls = (booked.data ?? []) as any[]
  const clash = conflicts(calls)
  return NextResponse.json({
    crew: crew.filter(p => p.role !== 'read_only').map(p => ({ id: p.id, name: p.full_name ?? 'Unnamed', role: p.role })),
    calls,
    waiting: waiting.data ?? [],
    conflicts: Object.fromEntries(Array.from(clash.entries())),
  })
}

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { ensureOnCrew } from '@/lib/crew-self'

// The task picker's "Me": put the signed-in person on this job's crew (or find
// them there) and hand back their row, so a task can be assigned to yourself.
// The SAME two questions as adding anybody else to the team - `team: edit`
// and owning the job - because a roster line is what lets a field account see
// a job, and "add myself to every job" must not be a way round that.
// See lib/crew-self.ts.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'team', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const res = await ensureOnCrew(db, params.id, gate.actor.userId)
  if (!res.member) {
    console.error('[team/me] could not add to the crew:', res.error)
    return NextResponse.json({ error: 'Could not put you on this job\'s crew. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ member: res.member, added: res.added })
}

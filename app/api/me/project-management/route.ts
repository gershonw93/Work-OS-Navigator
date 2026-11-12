import { NextResponse } from 'next/server'
import { pmDb, pmGate, CARD_COLS } from '@/lib/project-management-server'

// Per person, per request - never prerendered or cached.
export const dynamic = 'force-dynamic'

// My Work: the caller's own cards on every job, with the job's name. The same
// owner filter as the board - there is no way to ask for anybody else's.
export async function GET(request: Request) {
  const db = pmDb()
  const gate = await pmGate(db, request, null)
  if ('denied' in gate) return gate.denied

  const [{ data: cards, error }, { data: columns, error: columnsError }] = await Promise.all([
    db.from('pm_cards').select(CARD_COLS).eq('owner_id', gate.owner).order('due_date', { nullsFirst: false }),
    db.from('pm_columns').select('id, name, is_done, project_id').eq('owner_id', gate.owner),
  ])
  if (error || columnsError) {
    console.error('[pm] my work read failed', error?.message ?? columnsError?.message)
    return NextResponse.json({ error: 'Could not load your cards. Try again.' }, { status: 500 })
  }

  const projectIds = Array.from(new Set((cards ?? []).map(c => c.project_id as string)))
  let projects: { id: string; name: string }[] = []
  if (projectIds.length) {
    const { data, error: projectsError } = await db.from('projects').select('id, name').in('id', projectIds)
    if (projectsError) {
      console.error('[pm] my work projects read failed', projectsError.message)
      return NextResponse.json({ error: 'Could not load your cards. Try again.' }, { status: 500 })
    }
    projects = (data ?? []) as { id: string; name: string }[]
  }
  return NextResponse.json({ cards: cards ?? [], columns: columns ?? [], projects })
}

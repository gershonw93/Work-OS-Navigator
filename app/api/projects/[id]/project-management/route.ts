import { NextResponse } from 'next/server'
import { pmDb, pmGate, readColumns, readCards, mayLink } from '@/lib/project-management-server'
import { PM_LINK_TYPES } from '@/lib/project-management'

// The caller's OWN board on this job: their columns and their cards. Nobody
// else's is reachable from here - see lib/project-management-server.ts.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id)
  if ('denied' in gate) return gate.denied

  const columns = await readColumns(db, gate.owner, params.id)
  const cards = columns ? await readCards(db, gate.owner, params.id) : null
  // A failed read is an error, never an empty board: "you have no cards" told
  // to somebody with forty of them is the worst thing this screen can say.
  if (!columns || !cards) return NextResponse.json({ error: 'Could not load your board. Try again.' }, { status: 500 })

  const linkTypes = Object.keys(PM_LINK_TYPES).filter(t => mayLink(gate, t))
  return NextResponse.json({ columns, cards, linkTypes })
}

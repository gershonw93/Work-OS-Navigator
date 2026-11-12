import { NextResponse } from 'next/server'
import { pmDb, pmGate, mayLink, linkOptions } from '@/lib/project-management-server'

// What a card on this job may point at, for one kind of record. `kind`, not
// `type` or `id`: a query param named like a path segment never arrives.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id)
  if ('denied' in gate) return gate.denied

  const kind = new URL(request.url).searchParams.get('kind') ?? ''
  if (!mayLink(gate, kind)) return NextResponse.json({ error: 'You cannot link to that on this job.' }, { status: 403 })

  const options = await linkOptions(db, params.id, kind)
  if (!options) return NextResponse.json({ error: 'Could not load the list. Try again.' }, { status: 500 })
  return NextResponse.json({ options })
}

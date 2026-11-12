import { NextResponse } from 'next/server'
import { pmDb, pmGate, readColumns, COLUMN_COLS } from '@/lib/project-management-server'
import { columnProblem, isUuid } from '@/lib/project-management'
import { friendlyDbError } from '@/lib/db-error'

const MAX_COLUMNS = 12

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const columns = await readColumns(db, gate.owner, params.id)
  if (!columns) return NextResponse.json({ error: 'Could not load your board. Try again.' }, { status: 500 })
  if (columns.length >= MAX_COLUMNS) {
    return NextResponse.json({ error: `A board holds ${MAX_COLUMNS} columns. Remove one before adding another.` }, { status: 400 })
  }
  const problem = columnProblem(body.name, columns.map(c => c.name))
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data, error } = await db.from('pm_columns').insert({
    owner_id: gate.owner,
    project_id: params.id,
    name: String(body.name).trim(),
    position: columns.length ? Math.max(...columns.map(c => c.position)) + 1 : 0,
  }).select(COLUMN_COLS).single()
  if (error) {
    console.error('[pm] column insert failed', error.message)
    return NextResponse.json({ error: error.code === '23505' ? 'You already have a column with that name.' : friendlyDbError(error) }, { status: error.code === '23505' ? 400 : 500 })
  }
  return NextResponse.json({ column: data })
}

// Reorder: the caller's column ids, left to right.
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const order = Array.isArray(body.order) ? body.order.filter(isUuid) : []
  if (!order.length) return NextResponse.json({ error: 'Nothing to reorder.' }, { status: 400 })

  const results = await Promise.all(order.map((columnId, i) =>
    db.from('pm_columns').update({ position: i })
      .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', columnId)))
  const failed = results.find(r => r.error)
  if (failed?.error) {
    console.error('[pm] column reorder failed', failed.error.message)
    return NextResponse.json({ error: 'Could not save the new order. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

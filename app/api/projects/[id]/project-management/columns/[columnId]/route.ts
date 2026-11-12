import { NextResponse } from 'next/server'
import { pmDb, pmGate, COLUMN_COLS } from '@/lib/project-management-server'
import { columnProblem } from '@/lib/project-management'
import { friendlyDbError } from '@/lib/db-error'

type Ctx = { params: { id: string; columnId: string } }

export async function PATCH(request: Request, { params }: Ctx) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const { data: columns } = await db.from('pm_columns').select(COLUMN_COLS)
    .eq('owner_id', gate.owner).eq('project_id', params.id)
  const column = (columns ?? []).find(c => c.id === params.columnId)
  if (!column) return NextResponse.json({ error: 'That column is not on your board.' }, { status: 404 })

  const patch: Record<string, unknown> = {}
  if ('name' in body) {
    const problem = columnProblem(body.name, (columns ?? []).filter(c => c.id !== column.id).map(c => c.name))
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    patch.name = String(body.name).trim()
  }
  if (typeof body.is_done === 'boolean') patch.is_done = body.is_done
  if (!Object.keys(patch).length) return NextResponse.json({ column })

  const { data, error } = await db.from('pm_columns').update(patch)
    .eq('owner_id', gate.owner).eq('id', column.id).select(COLUMN_COLS).single()
  if (error) {
    console.error('[pm] column update failed', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  // A column that BECOMES the finished one finishes what is in it, and one
  // that stops being it un-finishes them - "done" is where a card is, so the
  // date cannot disagree with the column.
  if (typeof body.is_done === 'boolean' && body.is_done !== column.is_done) {
    const stamp = db.from('pm_cards')
      .update({ completed_at: body.is_done ? new Date().toISOString() : null })
      .eq('owner_id', gate.owner).eq('column_id', column.id)
    const { error: stampError } = body.is_done ? await stamp.is('completed_at', null) : await stamp
    if (stampError) console.error('[pm] completed_at restamp failed', stampError.message)
  }
  return NextResponse.json({ column: data })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  // Cards CASCADE from their column, so a delete with cards in it would take
  // them silently. Refused, by count, and the screen asks the same question.
  const { count, error: countError } = await db.from('pm_cards').select('id', { count: 'exact', head: true })
    .eq('owner_id', gate.owner).eq('column_id', params.columnId)
  if (countError) return NextResponse.json({ error: 'Could not check that column. Try again.' }, { status: 500 })
  if (count) {
    return NextResponse.json({
      error: `That column still holds ${count} ${count === 1 ? 'card' : 'cards'}. Move or delete ${count === 1 ? 'it' : 'them'} first.`,
    }, { status: 409 })
  }

  const { data, error } = await db.from('pm_columns').delete()
    .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', params.columnId).select('id')
  if (error) {
    console.error('[pm] column delete failed', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'That column is not on your board.' }, { status: 404 })
  return NextResponse.json({ success: true })
}

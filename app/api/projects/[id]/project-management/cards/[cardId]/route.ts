import { NextResponse } from 'next/server'
import { pmDb, pmGate, mayLink, linkOptions, renumberCards, CARD_COLS } from '@/lib/project-management-server'
import { cardProblem, cleanLabels, cleanChecklist, placeAt } from '@/lib/project-management'
import { friendlyDbError } from '@/lib/db-error'

type Ctx = { params: { id: string; cardId: string } }

export async function PATCH(request: Request, { params }: Ctx) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const problem = cardProblem(body, { partial: true })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data: card } = await db.from('pm_cards').select('id, column_id, completed_at')
    .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', params.cardId).maybeSingle()
  if (!card) return NextResponse.json({ error: 'That card is not on your board.' }, { status: 404 })

  // A whitelist: only what is named here is ever written.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('title' in body) patch.title = String(body.title).trim()
  if ('notes' in body) patch.notes = String(body.notes ?? '').trim() || null
  if ('due_date' in body) patch.due_date = body.due_date ? String(body.due_date) : null
  if ('priority' in body) patch.priority = String(body.priority)
  if ('labels' in body) patch.labels = cleanLabels(body.labels)
  if ('checklist' in body) patch.checklist = cleanChecklist(body.checklist)

  if ('link_type' in body) {
    if (!body.link_type) {
      patch.link_type = null; patch.link_id = null; patch.link_label = null
    } else {
      const type = String(body.link_type)
      if (!mayLink(gate, type)) return NextResponse.json({ error: 'You cannot link to that on this job.' }, { status: 403 })
      const found = (await linkOptions(db, params.id, type))?.find(o => o.id === body.link_id)
      if (!found) return NextResponse.json({ error: 'That record is not on this job.' }, { status: 400 })
      patch.link_type = type; patch.link_id = found.id; patch.link_label = found.label
    }
  }

  // A move: another column, another place in this one, or both.
  const moving = 'column_id' in body || 'position' in body
  const targetId = 'column_id' in body ? String(body.column_id) : card.column_id
  let order: string[] | null = null
  if (moving) {
    const { data: target } = await db.from('pm_columns').select('id, is_done')
      .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', targetId).maybeSingle()
    if (!target) return NextResponse.json({ error: 'That column is not on your board.' }, { status: 400 })
    const { data: there } = await db.from('pm_cards').select('id')
      .eq('owner_id', gate.owner).eq('column_id', target.id).order('position')
    const index = typeof body.position === 'number' ? body.position : null
    order = placeAt((there ?? []).map(r => r.id as string), card.id, index)
    if (target.id !== card.column_id) {
      patch.column_id = target.id
      // Done is where the card IS, so the date moves with it: stamped on the
      // way into a Done column, cleared on the way out. Never from the body.
      patch.completed_at = target.is_done ? (card.completed_at ?? new Date().toISOString()) : null
    }
  }

  const { error } = await db.from('pm_cards').update(patch).eq('owner_id', gate.owner).eq('id', card.id)
  if (error) {
    console.error('[pm] card update failed', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  if (order && !(await renumberCards(db, gate.owner, order))) {
    return NextResponse.json({ error: 'The card moved, but its place in the column was not saved. Reload and try again.' }, { status: 500 })
  }

  const { data: fresh } = await db.from('pm_cards').select(CARD_COLS)
    .eq('owner_id', gate.owner).eq('id', card.id).maybeSingle()
  return NextResponse.json({ card: fresh, order })
}

export async function DELETE(request: Request, { params }: Ctx) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const { data, error } = await db.from('pm_cards').delete()
    .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', params.cardId).select('id')
  if (error) {
    console.error('[pm] card delete failed', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'That card is not on your board.' }, { status: 404 })
  return NextResponse.json({ success: true })
}

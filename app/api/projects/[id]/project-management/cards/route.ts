import { NextResponse } from 'next/server'
import { pmDb, pmGate, mayLink, linkOptions, CARD_COLS } from '@/lib/project-management-server'
import { cardProblem, cleanLabels, cleanChecklist } from '@/lib/project-management'
import { friendlyDbError } from '@/lib/db-error'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = pmDb()
  const gate = await pmGate(db, request, params.id, { write: true })
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const problem = cardProblem(body)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // The column has to be one of the caller's own, on this job.
  const { data: column } = await db.from('pm_columns').select('id, is_done')
    .eq('owner_id', gate.owner).eq('project_id', params.id).eq('id', String(body.column_id)).maybeSingle()
  if (!column) return NextResponse.json({ error: 'That column is not on your board.' }, { status: 400 })

  // A link is checked against the job, and its label is read off the record -
  // never taken from the request.
  let link: { link_type: string | null; link_id: string | null; link_label: string | null } =
    { link_type: null, link_id: null, link_label: null }
  if (body.link_type) {
    const type = String(body.link_type)
    if (!mayLink(gate, type)) return NextResponse.json({ error: 'You cannot link to that on this job.' }, { status: 403 })
    const found = (await linkOptions(db, params.id, type))?.find(o => o.id === body.link_id)
    if (!found) return NextResponse.json({ error: 'That record is not on this job.' }, { status: 400 })
    link = { link_type: type, link_id: found.id, link_label: found.label }
  }

  const { count } = await db.from('pm_cards').select('id', { count: 'exact', head: true })
    .eq('owner_id', gate.owner).eq('column_id', column.id)

  const { data, error } = await db.from('pm_cards').insert({
    owner_id: gate.owner,
    project_id: params.id,
    column_id: column.id,
    title: String(body.title).trim(),
    notes: String(body.notes ?? '').trim() || null,
    due_date: body.due_date ? String(body.due_date) : null,
    priority: body.priority ? String(body.priority) : 'normal',
    labels: cleanLabels(body.labels),
    checklist: cleanChecklist(body.checklist),
    ...link,
    position: count ?? 0,
    // Derived from where the card lands, never from the body.
    completed_at: column.is_done ? new Date().toISOString() : null,
  }).select(CARD_COLS).single()

  if (error) {
    console.error('[pm] card insert failed', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ card: data })
}

import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx } from '@/lib/report-load'
import { normalizeConfig, configProblem } from '@/lib/report-builder'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'

/** Rename a saved report, or save new settings over it. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'create')
  if ('denied' in gate) return gate.denied
  const body = await request.json().catch(() => ({})) as any

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body?.name !== undefined) {
    const name = String(body.name ?? '').trim().slice(0, 120)
    if (!name) return NextResponse.json({ error: 'Give the report a name.' }, { status: 400 })
    updates.name = name
  }
  if (body?.config !== undefined) {
    const config = normalizeConfig(body.config)
    const problem = configProblem(config)
    if (problem) return NextResponse.json({ error: problem }, { status: 400 })
    updates.config = config
  }

  // The company is part of the WHERE: an id from another company updates nothing.
  const { data, error } = await db.from('saved_reports').update(updates)
    .eq('id', params.id).eq('company_id', gate.ctx.companyId)
    .select('id, name, config, created_by_name, created_at, updated_at').maybeSingle()
  if (error) {
    console.error('[saved reports] update', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'That saved report no longer exists.' }, { status: 404 })
  return NextResponse.json({ report: data })
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'delete')
  if ('denied' in gate) return gate.denied
  // Links already shared from it keep working: they hold their own snapshot,
  // and `saved_report_id` is SET NULL.
  const { error } = await db.from('saved_reports').delete().eq('id', params.id).eq('company_id', gate.ctx.companyId)
  if (error) {
    console.error('[saved reports] delete', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

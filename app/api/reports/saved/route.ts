import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx } from '@/lib/report-load'
import { normalizeConfig, configProblem } from '@/lib/report-builder'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'

/** The company's saved reports - settings only; each is re-run when opened. */
export async function GET(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const { data, error } = await db.from('saved_reports')
    .select('id, name, config, created_by_name, created_at, updated_at')
    .eq('company_id', gate.ctx.companyId)
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('[saved reports]', error)
    return NextResponse.json({ error: 'Could not load your saved reports.' }, { status: 500 })
  }
  return NextResponse.json({ reports: data ?? [] })
}

export async function POST(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'create')
  if ('denied' in gate) return gate.denied
  const body = await request.json().catch(() => ({})) as any
  const name = String(body?.name ?? '').trim().slice(0, 120)
  if (!name) return NextResponse.json({ error: 'Give the report a name.' }, { status: 400 })
  const config = normalizeConfig(body?.config)
  const problem = configProblem(config)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const { data, error } = await db.from('saved_reports').insert({
    company_id: gate.ctx.companyId, name, config,
    created_by: gate.ctx.actor.userId, created_by_name: gate.ctx.actorName,
  }).select('id, name, config, created_by_name, created_at, updated_at').single()
  if (error) {
    console.error('[saved reports] insert', error)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }
  return NextResponse.json({ report: data })
}

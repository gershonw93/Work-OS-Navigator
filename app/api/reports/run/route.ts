import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx, runReport } from '@/lib/report-load'
import { normalizeConfig, configProblem } from '@/lib/report-builder'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Run a report from its settings and hand back the finished document. */
export async function POST(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'view')
  if ('denied' in gate) return gate.denied

  const body = await request.json().catch(() => ({}))
  const config = normalizeConfig((body as any)?.config)
  const problem = configProblem(config)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const out = await runReport(db, gate.ctx, config)
  if ('error' in out) return out.error
  return NextResponse.json({ doc: out.doc, dropped: out.dropped, companyName: gate.ctx.companyName, logoUrl: gate.ctx.logoUrl })
}

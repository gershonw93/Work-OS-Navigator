import { NextResponse } from 'next/server'
import { admin, getValidConnection } from '@/lib/quickbooks'
import { processPending, runCdc } from '@/lib/quickbooks-pull'
import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// "Bring changes back from QuickBooks" on the Settings card (lib/quickbooks-pull.ts).
//
// GET   - is it on, when it last looked, whether Intuit's webhook is set up,
//         and the last few changes that came back.
// PATCH - { enabled }. Admin only. Turning it ON starts the cursor at now:
//         history is never imported, only what changes from here.
// POST  - "Check QuickBooks now": the same read the daily job makes, for this
//         company, applied straight away. Admin only.
// ─────────────────────────────────────────────────────────────────────────────

async function gate(request: Request) {
  const db = admin()
  const g = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(g)) return { res: g.denied }
  const companyId = g.actor.companyId
  if (!companyId) return { res: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  return { db, g, companyId }
}

export async function GET(request: Request) {
  const x = await gate(request)
  if ('res' in x) return x.res
  const [{ data: co }, { data: events }] = await Promise.all([
    x.db.from('companies').select('qbo_pull_enabled, qbo_pull_since').eq('id', x.companyId).maybeSingle(),
    x.db.from('quickbooks_inbound_events').select('entity, operation, status, message, received_at')
      .eq('company_id', x.companyId).neq('status', 'ignored').order('received_at', { ascending: false }).limit(5),
  ])
  return NextResponse.json({
    enabled: !!(co as any)?.qbo_pull_enabled,
    since: (co as any)?.qbo_pull_since ?? null,
    webhookConfigured: !!process.env.QBO_WEBHOOK_VERIFIER,
    canManage: mayManageCompanySetting(x.g.actor),
    recent: events ?? [],
  })
}

export async function PATCH(request: Request) {
  const x = await gate(request)
  if ('res' in x) return x.res
  if (!mayManageCompanySetting(x.g.actor)) return NextResponse.json({ error: 'Only an admin can change this.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (typeof body.enabled !== 'boolean') return NextResponse.json({ error: 'On or off?' }, { status: 400 })
  if (body.enabled && !(await getValidConnection(x.db, x.companyId))) {
    return NextResponse.json({ error: 'Connect QuickBooks first.' }, { status: 409 })
  }
  const { error } = await x.db.from('companies').update(body.enabled
    ? { qbo_pull_enabled: true, qbo_pull_since: new Date().toISOString() }
    : { qbo_pull_enabled: false }).eq('id', x.companyId)
  if (error) {
    console.error('[quickbooks/pull] toggle', error.message)
    return NextResponse.json({ error: 'Could not save. Nothing was changed.' }, { status: 500 })
  }
  await x.db.from('quickbooks_sync_log').insert({
    company_id: x.companyId, entity_type: 'connection', action: 'update', status: 'success', direction: 'pull',
    message: body.enabled
      ? 'Bringing changes back from QuickBooks: on. Payments, bill payments, voids and edits to records SyteNav sent come back from now on.'
      : 'Bringing changes back from QuickBooks: off.',
  })
  return NextResponse.json({ ok: true, enabled: body.enabled })
}

export async function POST(request: Request) {
  const x = await gate(request)
  if ('res' in x) return x.res
  if (!mayManageCompanySetting(x.g.actor)) return NextResponse.json({ error: 'Only an admin can do this.' }, { status: 403 })
  const read = await runCdc(x.db, x.companyId)
  if (!read.ok) return NextResponse.json({ error: read.message }, { status: 409 })
  const tally = await processPending(x.db, { companyId: x.companyId, budgetMs: 45_000 })
  return NextResponse.json({ ok: true, recorded: read.recorded, ...tally })
}

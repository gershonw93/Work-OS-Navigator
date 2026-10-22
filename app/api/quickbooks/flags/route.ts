import { NextResponse } from 'next/server'
import { admin } from '@/lib/quickbooks'
import { requirePermission, denied } from '@/lib/api-guard'
import { mayManageCompanySetting } from '@/lib/company-access'

export const runtime = 'nodejs'

// ─────────────────────────────────────────────────────────────────────────────
// Dismiss a "Voided / Deleted / Changed in QuickBooks" flag (lib/quickbooks-pull.ts).
//
// A flag is a question for a person - "QuickBooks says otherwise, which is
// right?" - and once answered it should stop asking. Admin only, and the row
// must belong to one of this company's jobs: the table and id come from the
// body, so both are checked rather than trusted.
// ─────────────────────────────────────────────────────────────────────────────
const TABLES = new Set(['client_payments', 'client_invoices', 'invoices'])

export async function POST(request: Request) {
  const db = admin()
  const g = await requirePermission(db, request, 'settings_company', 'view')
  if (denied(g)) return g.denied
  const companyId = g.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!mayManageCompanySetting(g.actor)) return NextResponse.json({ error: 'Only an admin can dismiss this.' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  if (!TABLES.has(body.table) || typeof body.id !== 'string') return NextResponse.json({ error: 'Which record?' }, { status: 400 })

  const { data: row } = await db.from(body.table).select('id, project_id').eq('id', body.id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { data: project } = await db.from('projects').select('id')
    .eq('id', (row as any).project_id).or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db.from(body.table)
    .update({ qbo_external_state: null, qbo_external_note: null, qbo_external_at: null }).eq('id', body.id)
  if (error) {
    console.error('[quickbooks/flags] clear', error.message)
    return NextResponse.json({ error: 'Could not dismiss it.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

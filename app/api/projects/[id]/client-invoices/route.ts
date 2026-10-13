import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cents, invoiceTotalCents, settlementOf } from '@/lib/invoice-settlement'
import { creditAvailableCents } from '@/lib/invoice-settlement-db'
import { requirePermission, denied } from '@/lib/api-guard'
import { createClientInvoice } from '@/lib/writes/client-invoice'
import { billableCosts } from '@/lib/client-billable'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return user ? { db, user } : null
}

/**
 * What can be billed to the client, and what already has been.
 *
 * "Billable" is cost that has been accepted - an approved sub invoice or a
 * material receipt - and that is not already on a client invoice. The
 * already-billed half is what stops the same electrician's bill going out
 * twice, which is the mistake that costs a relationship rather than just a
 * correction.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'payments', 'view')
  if (denied(viewGate)) return viewGate.denied

  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db } = ctx

  const [{ data: project }, { data: invoices }, { data: materials }, { data: bills }, { data: payments }] = await Promise.all([
    db.from('projects').select('contractor_fee_pct, client, name, gc_company_id').eq('id', params.id).maybeSingle(),
    db.from('invoices')
      .select('id, invoice_number, company_name, description, amount, status, markup_pct, markup_excluded, created_at')
      .eq('project_id', params.id),
    db.from('material_purchases')
      .select('id, store_name, category, amount, purchase_date, markup_pct, markup_excluded')
      .eq('project_id', params.id),
    db.from('client_invoices')
      .select('*, client_invoice_lines(*)')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    // The money side of each invoice. Without this the list could say an
    // invoice had reached QuickBooks but not whether the payment settling it
    // had - so an invoice sat "paid" here, green-ticked, and still open as a
    // receivable over there with nobody the wiser.
    // Read through client_payment_allocations - the one home for which
    // invoice a payment pays, and how much of it. A payment split across two
    // invoices counts its share against each, not its whole amount against both.
    db.from('client_payment_allocations')
      .select('client_invoice_id, amount, client_payments!inner(id, qbo_id, qb_entered, project_id)')
      .eq('client_payments.project_id', params.id),
  ])

  const projectPct = Number((project as any)?.contractor_fee_pct ?? 0) * 100

  // What is still to bill - one answer, shared with Claude's list_billable_costs.
  const billable = billableCosts({ invoices: invoices ?? [], materials: materials ?? [], bills: bills ?? [], projectPct })

  // What settles each invoice, so the list can tell the two QuickBooks truths
  // apart: the invoice is over there, and the money that settles it is too.
  // And how much of it is settled - "paid" is a sum, not a flag.
  const paidBy = new Map<string, { qbo_id: string | null; qb_entered: boolean; amount: number }[]>()
  for (const share of (payments ?? []) as any[]) {
    const pay = share.client_payments
    const list = paidBy.get(share.client_invoice_id) ?? []
    list.push({ qbo_id: pay?.qbo_id ?? null, qb_entered: !!pay?.qb_entered, amount: Number(share.amount || 0) })
    paidBy.set(share.client_invoice_id, list)
  }

  const withSettlement = (bills ?? []).map((b: any) => {
    const applied = paidBy.get(b.id) ?? []
    const s = settlementOf(
      invoiceTotalCents(b.client_invoice_lines),
      applied.reduce((sum, p) => sum + cents(p.amount), 0),
    )
    return {
      ...b,
      settlement: {
        recorded: applied.length > 0,
        // "In QuickBooks by hand" counts: the money is over there, we just
        // did not put it there.
        in_qbo: applied.length > 0 && applied.every(p => !!p.qbo_id || p.qb_entered === true),
        amount: s.paid,
        total: s.total,
        balance: s.balance,
        state: s.state,
      },
    }
  })

  // Only a company that HAS a QuickBooks gets told anything about QuickBooks.
  // A "not in QuickBooks" note on every invoice of a company that never
  // connected one is noise dressed up as a warning.
  const companyId = (project as any)?.gc_company_id ?? null
  const { data: conn } = companyId
    ? await db.from('quickbooks_connections')
      .select('company_id').eq('company_id', companyId).eq('status', 'connected').maybeSingle()
    : { data: null }

  // The client's money held on account and not yet applied - what "Apply
  // credit" on an invoice can draw on. Null when it could not be read, which
  // the list shows as nothing rather than as $0.
  const credit = await creditAvailableCents(db, params.id)

  return NextResponse.json({
    invoices: withSettlement,
    credit_available: credit === null ? null : credit / 100,
    billable,
    markup_pct: projectPct,
    client: (project as any)?.client ?? null,
    project_name: (project as any)?.name ?? null,
    quickbooks_connected: !!conn,
  })
}

/**
 * Raise a client invoice from chosen costs.
 *
 * Costs are copied onto the invoice as they stand right now. They are NOT
 * looked up again later: the source invoice can be edited, re-marked-up or
 * deleted, and none of that should quietly rewrite a bill the client has
 * already been handed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'payments', 'edit')
  if (denied(gate)) return gate.denied

  const ctx = await auth(request)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = ctx

  const body = await request.json().catch(() => ({}))

  // Everything after the gate is `createClientInvoice`, which Claude's MCP server calls too.
  const result = await createClientInvoice(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}

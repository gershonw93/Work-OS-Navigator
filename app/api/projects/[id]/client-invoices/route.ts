import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { markUp } from '@/lib/markup'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'
import { requirePermission, denied } from '@/lib/api-guard'

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
    db.from('client_payments')
      .select('id, client_invoice_id, qbo_id, qb_entered, amount')
      .eq('project_id', params.id),
  ])

  const projectPct = Number((project as any)?.contractor_fee_pct ?? 0) * 100

  const billedInvoiceIds = new Set<string>()
  const billedMaterialIds = new Set<string>()
  for (const b of bills ?? []) {
    // A voided invoice is not a bill any more, so its costs go back on the
    // billable list. Without this, voiding would strand them: unbillable
    // forever, attached to a document that no longer asks for anything.
    if ((b as any).status === 'void') continue
    for (const l of ((b as any).client_invoice_lines ?? [])) {
      if (l.source_invoice_id) billedInvoiceIds.add(l.source_invoice_id)
      if (l.source_material_id) billedMaterialIds.add(l.source_material_id)
    }
  }

  const billable = [
    ...(invoices ?? [])
      .filter(i => ACTUAL_STATUSES.has(String(i.status)) && !billedInvoiceIds.has(i.id))
      .map(i => {
        const m = markUp(i.amount, i as any, projectPct)
        return {
          kind: 'invoice' as const,
          source_id: i.id,
          description: [i.company_name, i.description].filter(Boolean).join(' - ') || i.invoice_number,
          reference: i.invoice_number,
          date: i.created_at,
          ...m,
        }
      }),
    ...(materials ?? [])
      .filter(m => !billedMaterialIds.has(m.id))
      .map(mat => {
        const m = markUp(mat.amount, mat as any, projectPct)
        return {
          kind: 'material' as const,
          source_id: mat.id,
          description: [mat.store_name, mat.category].filter(Boolean).join(' - ') || 'Materials',
          reference: null,
          date: mat.purchase_date,
          ...m,
        }
      }),
  ].sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')))

  // What settles each invoice, so the list can tell the two QuickBooks truths
  // apart: the invoice is over there, and the money that settles it is too.
  const paidBy = new Map<string, { id: string; qbo_id: string | null; qb_entered: boolean; amount: number }[]>()
  for (const pay of (payments ?? []) as any[]) {
    if (!pay.client_invoice_id) continue
    const list = paidBy.get(pay.client_invoice_id) ?? []
    list.push(pay)
    paidBy.set(pay.client_invoice_id, list)
  }

  const withSettlement = (bills ?? []).map((b: any) => {
    const applied = paidBy.get(b.id) ?? []
    return {
      ...b,
      settlement: {
        recorded: applied.length > 0,
        // "In QuickBooks by hand" counts: the money is over there, we just
        // did not put it there.
        in_qbo: applied.length > 0 && applied.every(p => !!p.qbo_id || p.qb_entered === true),
        amount: applied.reduce((s, p) => s + Number(p.amount || 0), 0),
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

  return NextResponse.json({
    invoices: withSettlement,
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
  const sources: { kind: string; source_id: string }[] = Array.isArray(body.sources) ? body.sources : []
  if (!sources.length) return NextResponse.json({ error: 'Pick at least one cost to bill.' }, { status: 400 })

  const { data: project } = await db.from('projects')
    .select('contractor_fee_pct').eq('id', params.id).maybeSingle()
  const projectPct = Number((project as any)?.contractor_fee_pct ?? 0) * 100

  const invoiceIds = sources.filter(s => s.kind === 'invoice').map(s => s.source_id)
  const materialIds = sources.filter(s => s.kind === 'material').map(s => s.source_id)

  const [{ data: invoices }, { data: materials }] = await Promise.all([
    invoiceIds.length
      ? db.from('invoices')
          .select('id, invoice_number, company_name, description, amount, status, markup_pct, markup_excluded, subcontract_id')
          .eq('project_id', params.id).in('id', invoiceIds)
      : Promise.resolve({ data: [] as any[] }),
    materialIds.length
      ? db.from('material_purchases')
          .select('id, store_name, category, amount, budget_line_id, markup_pct, markup_excluded')
          .eq('project_id', params.id).in('id', materialIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Only costs that are actually accepted. A pending invoice is not yours to
  // bill on yet, and the picker never offers one - but the id arrives from the
  // browser, so it is checked here too.
  const badStatus = (invoices ?? []).find(i => !ACTUAL_STATUSES.has(String(i.status)))
  if (badStatus) {
    return NextResponse.json(
      { error: `${badStatus.invoice_number} has not been approved yet, so it cannot be billed on.` },
      { status: 400 },
    )
  }

  const { count } = await db.from('client_invoices')
    .select('*', { count: 'exact', head: true }).eq('project_id', params.id)
  const invoice_number = body.invoice_number
    || `INV-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: bill, error } = await db.from('client_invoices').insert({
    project_id: params.id,
    invoice_number,
    status: 'draft',
    due_date: body.due_date || null,
    // The default is the safer one: a client who was never shown your margin
    // cannot be un-shown it.
    show_markup: !!body.show_markup,
    notes: body.notes || null,
    terms: body.terms || null,
    markup_pct: projectPct,
    created_by: user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = [
    ...(invoices ?? []).map((i, idx) => {
      const m = markUp(i.amount, i as any, projectPct)
      return {
        client_invoice_id: bill.id,
        description: [i.company_name, i.description].filter(Boolean).join(' - ') || i.invoice_number,
        source_invoice_id: i.id,
        cost: m.cost, markup_pct: m.pct, markup: m.markup, amount: m.clientPrice,
        sort_order: idx,
      }
    }),
    ...(materials ?? []).map((mat, idx) => {
      const m = markUp(mat.amount, mat as any, projectPct)
      return {
        client_invoice_id: bill.id,
        description: [mat.store_name, mat.category].filter(Boolean).join(' - ') || 'Materials',
        source_material_id: mat.id,
        budget_line_item_id: (mat as any).budget_line_id ?? null,
        cost: m.cost, markup_pct: m.pct, markup: m.markup, amount: m.clientPrice,
        sort_order: (invoices?.length ?? 0) + idx,
      }
    }),
  ]

  const { error: lineErr } = await db.from('client_invoice_lines').insert(rows)
  if (lineErr) {
    // The unique index on source ids is what makes double-billing impossible.
    // Roll the header back so a failed attempt does not leave an empty invoice.
    await db.from('client_invoices').delete().eq('id', bill.id)
    const dupe = lineErr.code === '23505'
    return NextResponse.json({
      error: dupe
        ? 'One of those costs is already on another client invoice.'
        : lineErr.message,
    }, { status: dupe ? 409 : 500 })
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const total = rows.reduce((s, r) => s + r.amount, 0)
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'GC', 'client_invoice_created',
    `Client invoice ${invoice_number} raised - $${total.toLocaleString()}`,
  )

  return NextResponse.json({ invoice: { ...bill, client_invoice_lines: rows } }, { status: 201 })
}

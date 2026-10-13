import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { markUp } from '@/lib/markup'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Raising a client invoice from chosen costs - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/client-invoices` unchanged. The route
// keeps the gate (`payments: edit`, which carries the billing lock); this is
// everything after it: the approved-cost check, the number, the header, the
// lines with their markup, and the activity line.
//
// AN INVOICE IS BORN `draft`, AND A DRAFT ASKS NOBODY FOR ANYTHING. Nothing is
// emailed here, the client portal and the /bill link refuse a draft, and the
// QuickBooks push runs only when somebody marks it `sent` (the PATCH route) -
// `pushClientInvoice` skips a draft even if asked. So a draft raised here is a
// document for a person to check and send, never a receivable.
//
// Costs are copied onto the invoice as they stand right now. They are NOT
// looked up again later: the source invoice can be edited, re-marked-up or
// deleted, and none of that should quietly rewrite a bill the client has
// already been handed.
// ─────────────────────────────────────────────────────────────────────────────

export async function createClientInvoice(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const user = { id: userId }
  const sources: { kind: string; source_id: string }[] = Array.isArray(body?.sources) ? body.sources : []
  if (!sources.length) return { status: 400, body: { error: 'Pick at least one cost to bill.' } }

  const { data: project } = await db.from('projects')
    .select('contractor_fee_pct').eq('id', projectId).maybeSingle()
  const projectPct = Number((project as any)?.contractor_fee_pct ?? 0) * 100

  const invoiceIds = sources.filter(s => s.kind === 'invoice').map(s => s.source_id)
  const materialIds = sources.filter(s => s.kind === 'material').map(s => s.source_id)

  const [{ data: invoices }, { data: materials }] = await Promise.all([
    invoiceIds.length
      ? db.from('invoices')
          .select('id, invoice_number, company_name, description, amount, status, markup_pct, markup_excluded, subcontract_id')
          .eq('project_id', projectId).in('id', invoiceIds)
      : Promise.resolve({ data: [] as any[] }),
    materialIds.length
      ? db.from('material_purchases')
          .select('id, store_name, category, amount, budget_line_id, markup_pct, markup_excluded')
          .eq('project_id', projectId).in('id', materialIds)
      : Promise.resolve({ data: [] as any[] }),
  ])

  // Only costs that are actually accepted. A pending invoice is not yours to
  // bill on yet, and the picker never offers one - but the id arrives from the
  // browser, so it is checked here too.
  const badStatus = (invoices ?? []).find(i => !ACTUAL_STATUSES.has(String(i.status)))
  if (badStatus) {
    return {
      status: 400,
      body: { error: `${badStatus.invoice_number} has not been approved yet, so it cannot be billed on.` },
    }
  }

  const { count } = await db.from('client_invoices')
    .select('*', { count: 'exact', head: true }).eq('project_id', projectId)
  const invoice_number = body.invoice_number
    || `INV-${String((count ?? 0) + 1).padStart(4, '0')}`

  const { data: bill, error } = await db.from('client_invoices').insert({
    project_id: projectId,
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

  if (error) return { status: 500, body: { error: error.message } }

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
    return {
      status: dupe ? 409 : 500,
      body: {
        error: dupe
          ? 'One of those costs is already on another client invoice.'
          : lineErr.message,
      },
    }
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const total = rows.reduce((s, r) => s + r.amount, 0)
  await logActivity(
    db, projectId, withVia((profile as any)?.full_name ?? 'GC', via), 'client_invoice_created',
    `Client invoice ${invoice_number} raised - $${total.toLocaleString()}`,
  )

  return { status: 201, body: { invoice: { ...bill, client_invoice_lines: rows } } }
}

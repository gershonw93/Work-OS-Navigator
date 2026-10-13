import { markUp } from '@/lib/markup'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'

// ─────────────────────────────────────────────────────────────────────────────
// WHAT IS STILL TO BILL THE CLIENT - one answer.
//
// Approved sub bills and material purchases on the job that are not already on
// a live client invoice, each with the job's markup applied the way the
// invoice will apply it. Moved out of the client-invoices GET so the Billing
// the client screen and Claude's `list_billable_costs` cannot disagree about
// what is billable - a cost one of them offers and the other refuses is a
// draft that fails for a reason nobody can see.
// ─────────────────────────────────────────────────────────────────────────────

export function billableCosts({ invoices, materials, bills, projectPct }: {
  invoices: any[]
  materials: any[]
  bills: any[]
  projectPct: number
}) {
  const billedInvoiceIds = new Set<string>()
  const billedMaterialIds = new Set<string>()
  for (const b of bills) {
    // A voided invoice is not a bill any more, so its costs go back on the
    // billable list. Without this, voiding would strand them: unbillable
    // forever, attached to a document that no longer asks for anything.
    if ((b as any).status === 'void') continue
    for (const l of ((b as any).client_invoice_lines ?? [])) {
      if (l.source_invoice_id) billedInvoiceIds.add(l.source_invoice_id)
      if (l.source_material_id) billedMaterialIds.add(l.source_material_id)
    }
  }

  return [
    ...invoices
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
    ...materials
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
}

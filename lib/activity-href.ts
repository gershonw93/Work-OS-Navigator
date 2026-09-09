// ─────────────────────────────────────────────────────────────────────────────
// Where a Recent Activity line goes when you tap it.
//
// THE BUG. Every line on the dashboard linked to `/projects/<id>/plans`,
// whatever it said. "Invoice #14 marked paid" opened the drawings. "RFI 3
// answered" opened the drawings. The feed's whole job is to be the way back to
// the thing that happened, and it took you to the same page thirty-odd times.
//
// The tab is not guessable from the type string - `material_purchased` lives on
// `materials`, `client_payment_received` on `payments`, `member_added` on
// `team` - so it is a table, kept beside the icon table it mirrors. An unknown
// type falls back to the project overview, which is at least the right project.
// ─────────────────────────────────────────────────────────────────────────────

/** type -> the project tab that shows the record. */
export const ACTIVITY_TAB: Record<string, string> = {
  plan_uploaded: 'plans',
  permit_added: 'permits',
  permit_updated: 'permits',
  inspection_added: 'inspections',
  inspection_updated: 'inspections',
  subcontractor_added: 'team',
  subcontractor_updated: 'team',
  daily_log_submitted: 'daily-logs',
  daily_log_update: 'daily-logs',
  rfi_submitted: 'rfis',
  rfi_responded: 'rfis',
  submittal_added: 'submittals',
  submittal_updated: 'submittals',
  task_created: 'tasks',
  task_updated: 'tasks',
  change_order_created: 'change-orders',
  change_order_updated: 'change-orders',
  compliance_added: 'compliance',
  compliance_updated: 'compliance',
  compliance_document_added: 'compliance',
  invoice_created: 'invoices',
  invoice_updated: 'invoices',
  file_uploaded: 'plans',
  member_added: 'team',
  team_member_added: 'team',
  team_member_removed: 'team',
  material_purchased: 'materials',
  client_payment_received: 'payments',
  equipment_checked_out: 'materials',
  equipment_checked_in: 'materials',
  time_clock_in: 'time',
  time_clock_out: 'time',
  budget_line_added: 'budget',
  budget_line_removed: 'budget',
  selection_chosen: 'selections',
  selection_ordered: 'selections',
}

/**
 * The link for one activity row. `null` when there is no project on it - a
 * company-wide event has nowhere to go, and a link to nowhere is worse than
 * text.
 */
export function activityHref(type: string, projectId: string | null | undefined): string | null {
  if (!projectId) return null
  return `/projects/${projectId}/${ACTIVITY_TAB[type] ?? 'overview'}`
}

/**
 * Who a project belongs to.
 *
 * A GC's project is worked by subcontractors who sign in and see the same
 * project shell, so "is this viewer on the owning side?" decides more than tab
 * visibility - it decides what the header is allowed to say. Who the GC's
 * client is, for instance, is not a sub's business.
 *
 * The rule lived only inside app/api/projects/[id]/viewer-context/route.ts. A
 * second copy in the layout would be two chances to get it wrong, and they
 * would drift the first time a company column was added.
 */
export function ownsProject(
  companyId: string | null | undefined,
  project: { gc_company_id?: string | null; created_by_company_id?: string | null } | null | undefined,
): boolean {
  if (!companyId || !project) return false
  return project.gc_company_id === companyId || project.created_by_company_id === companyId
}

/**
 * What to call the client on a project.
 *
 * The linked customer record wins - it is the one an invoice and QuickBooks
 * are built from. `projects.client` is free text typed on the project itself
 * and is the fallback for jobs created before customers existed, or entered in
 * a hurry. (The column is `client`; there is no `client_name`, and selecting
 * one would quietly return null for the whole row.)
 */
export function clientLabel(
  customerName?: string | null,
  projectClient?: string | null,
): string | null {
  return String(customerName ?? '').trim() || String(projectClient ?? '').trim() || null
}

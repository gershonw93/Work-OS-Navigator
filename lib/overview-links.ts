/**
 * Where each line on the project Overview goes, relative to `/projects/<id>/`.
 *
 * A LINE THAT NAMES ONE THING OPENS THAT THING. "1 RFI unanswered" opens that
 * RFI's answer box; "1 bill waiting for your approval" opens that bill. A line
 * counting several lands on the part of the page that holds them - the
 * compliance alerts, the payment requests - not on the top of a tab where
 * the person has to find again what the Overview already found.
 *
 * Every param here is READ by the page at the other end (`lib/use-land-on.ts`,
 * or `useOpenRecord` for `?open=`). Pinned both ways in
 * `lib/__tests__/overview-links.ts`: a param a page never reads is a link that
 * lands at the top of the list, which looks exactly like one that works.
 */

type Row = { id: string }

const oneOr = <T extends Row>(rows: T[], single: (r: T) => string, many: string) =>
  rows.length === 1 ? single(rows[0]) : many

export const overviewHref = {
  overdueTasks: (rows: Row[]) => oneOr(rows, r => `tasks?open=${r.id}`, 'tasks?filter=overdue'),
  openTasks: () => 'tasks?filter=open',
  allTasks: () => 'tasks',
  bills: (rows: Row[]) => oneOr(rows, r => `invoices?open=${r.id}`, 'invoices'),
  rfis: (rows: Row[]) => oneOr(rows, r => `rfis?answer=${r.id}`, 'rfis'),
  inspection: (id: string) => `inspections?inspection=${id}#insp-${id}`,
  inspectionsToBook: (rows: Row[]) => oneOr(rows, r => overviewHref.inspection(r.id), 'inspections#to-book'),
  signoffs: (rows: Row[]) => oneOr(rows, r => `tasks?open=${r.id}`, 'tasks'),
  paymentRequests: () => 'payments#payment-requests',
  certificates: () => 'compliance#needs-attention',
  /** Keyed on the COMPANY - a compliance card is a vendor, not a contract. */
  vendorsWithNothing: (companyIds: string[]) =>
    companyIds.length === 1 ? `compliance#vendor-${companyIds[0]}` : 'compliance',
  selections: () => 'selections',
  clientQuestions: () => 'overview#client-questions',
}

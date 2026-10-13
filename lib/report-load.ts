import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan, type ActorPerms } from '@/lib/server-permissions'
import { billingLock } from '@/lib/api-guard'
import {
  SECTIONS, sectionDef, buildReport, VENDOR_SUBJECTS,
  type ReportConfig, type ReportData, type ReportDoc, type SectionKey, EMPTY_DATA,
} from '@/lib/report-builder'

// ─────────────────────────────────────────────────────────────────────────────
// Reports - loading the rows. Server only.
//
// AN INCOMPLETE READ IS NOT A READ THAT SAID NO. Every table is PAGED (a
// PostgREST select stops at 1,000 rows and says nothing), and any refused
// query fails the whole report rather than printing a confident, smaller
// number - a report handed to a developer that silently lost half its bills
// is worse than one that did not run.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportCtx {
  actor: ActorPerms
  companyId: string
  actorName: string
  companyName: string | null
  logoUrl: string | null
}

/** Who is asking, and may they use Reports at all. */
export async function reportCtx(db: SupabaseClient, request: Request, action: 'view' | 'create' | 'delete' = 'view'):
  Promise<{ ctx: ReportCtx } | { denied: NextResponse }> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  const actor = await getActor(db, token)
  if (!actor) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!actor.companyId) return { denied: NextResponse.json({ error: 'Your account is not linked to a company yet.' }, { status: 403 }) }
  if (!actorCan(actor, 'reports', action)) {
    const verb = action === 'view' ? 'run reports' : action === 'create' ? 'save or share reports' : 'delete reports'
    return { denied: NextResponse.json({ error: `You do not have permission to ${verb}. Ask your company admin.` }, { status: 403 }) }
  }
  // Saving and sharing are writes, so a read-only account stops there - the
  // same lock every other write meets at requirePermission. Running one is a
  // read and always works.
  if (action !== 'view') {
    const locked = await billingLock(db, actor.companyId)
    if (locked) return { denied: locked }
  }
  const [{ data: me }, { data: company }] = await Promise.all([
    db.from('profiles').select('full_name').eq('id', actor.userId).maybeSingle(),
    db.from('companies').select('name, logo_url').eq('id', actor.companyId).maybeSingle(),
  ])
  return {
    ctx: {
      actor, companyId: actor.companyId,
      actorName: (me as any)?.full_name || 'Someone',
      companyName: (company as any)?.name ?? null,
      logoUrl: (company as any)?.logo_url ?? null,
    },
  }
}

/** The sections this person may put in a report. */
export function allowedSections(actor: ActorPerms): SectionKey[] {
  return SECTIONS.filter(s => actorCan(actor, s.resource, 'view')).map(s => s.key)
}

/** A config with every section the person may not see taken out - and SAID. */
export function permittedConfig(actor: ActorPerms, c: ReportConfig): { config: ReportConfig; dropped: string[] } {
  const ok = new Set(allowedSections(actor))
  const dropped = c.sections.filter(k => !ok.has(k)).map(k => sectionDef(k).label)
  return { config: { ...c, sections: c.sections.filter(k => ok.has(k)) }, dropped }
}

class ReadFailed extends Error {}

const PAGE = 1000

/** Every row, a page at a time. Throws on a refused page. */
async function all<T>(label: string, page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) {
      console.error(`[reports] ${label}`, error)
      throw new ReadFailed(label)
    }
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/** `.in()` over a long id list, in chunks, so the URL stays a sane length. */
async function inChunks<T>(label: string, ids: string[], q: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    out.push(...await all(label, (from, to) => q(chunk, from, to)))
  }
  return out
}

/** The jobs a company owns. */
export async function companyProjects(db: SupabaseClient, companyId: string) {
  return all<any>('projects', (from, to) => db.from('projects')
    .select('id, name, status, address, client, customer_id, sellout_amount, contractor_fee_pct, start_date, end_date')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
    .order('name').order('id').range(from, to))
}

/** Load what a config needs, and nothing it does not. */
export async function loadReportData(db: SupabaseClient, companyId: string, c: ReportConfig): Promise<ReportData> {
  const projects = await companyProjects(db, companyId)
  const ids = projects.map(p => p.id)
  if (!ids.length) return { ...EMPTY_DATA }

  const need = new Set<SectionKey>(c.sections)
  const vendor = VENDOR_SUBJECTS.includes(c.subject)
  const money = need.has('summary') || need.has('margin')
  const want = {
    subcontracts: true, // names every vendor row, and scopes a vendor report
    invoices: true,
    materials: vendor || need.has('materials') || need.has('summary'),
    changeOrders: need.has('summary') || need.has('contracts') || need.has('change_orders'),
    budget: need.has('budget') || need.has('margin'),
    allocations: need.has('margin'),
    clientInvoices: need.has('client_billing') || (money && !vendor),
    payments: need.has('client_billing') || (money && !vendor),
    schedule: need.has('schedule'),
    permits: need.has('permits'),
    inspections: need.has('inspections'),
    dailyLogs: need.has('daily_logs'),
    time: need.has('time'),
  }
  const byProject = <T>(label: string, table: string, cols: string, on: boolean, order = 'id') =>
    on ? inChunks<T>(label, ids, (chunk, from, to) => db.from(table).select(cols).in('project_id', chunk).order(order).range(from, to) as any) : Promise.resolve([] as T[])

  const [subcontracts, invoices, materials, changeOrders, budgetLines, clientInvoices, clientPayments, scheduleItems, permits, inspections, dailyLogs, timeEntries, customers] = await Promise.all([
    byProject<any>('subcontracts', 'subcontracts', 'id, project_id, company_id, trade, scope, contract_amount, status', want.subcontracts),
    byProject<any>('invoices', 'invoices', 'id, project_id, subcontract_id, company_id, company_name, invoice_number, description, amount, status, client_paid, escrow_paid, markup_pct, markup_excluded, created_at, submitted_at, due_date, paid_at', want.invoices),
    byProject<any>('materials', 'material_purchases', 'id, project_id, company_id, store_name, amount, tax, purchase_date, category, notes, created_at', want.materials),
    byProject<any>('change orders', 'change_orders', 'id, project_id, subcontract_id, title, amount, status, reason, created_at', want.changeOrders),
    byProject<any>('budget lines', 'budget_line_items', 'id, project_id, cost_code, category, description, section, budgeted_amount, committed_amount, actual_amount, subcontract_id, markup_pct, markup_excluded, progress_pct', want.budget),
    byProject<any>('client invoices', 'client_invoices', 'id, project_id, invoice_number, status, issue_date, due_date, created_at', want.clientInvoices),
    byProject<any>('client payments', 'client_payments', 'id, project_id, paid_date, amount, method, reference, memo, created_at', want.payments),
    byProject<any>('schedule', 'schedule_items', 'id, project_id, subcontract_id, label, trade, start_date, end_date, progress_pct', want.schedule),
    byProject<any>('permits', 'permits', 'id, project_id, permit_type, permit_number, status, issued_date, expiry_date, issuing_authority, created_at', want.permits),
    byProject<any>('inspections', 'inspections', 'id, project_id, type, status, scheduled_date, requested_date, completed_date, inspector_name, failure_reason, voided_at', want.inspections),
    byProject<any>('daily logs', 'daily_logs', 'id, project_id, log_date, workers_onsite, weather, notes, has_issues, issue_description, created_by_name', want.dailyLogs),
    byProject<any>('time', 'time_entries', 'id, project_id, worker_name, profile_id, clock_in_at, clock_out_at, approval_status', want.time),
    all<any>('customers', (from, to) => db.from('customers').select('id, name').eq('gc_company_id', companyId).order('id').range(from, to)),
  ])

  const clientInvoiceLines = clientInvoices.length
    ? await inChunks<any>('client invoice lines', clientInvoices.map((ci: any) => ci.id), (chunk, from, to) =>
        db.from('client_invoice_lines').select('id, client_invoice_id, amount').in('client_invoice_id', chunk).order('id').range(from, to) as any)
    : []

  const allocations = want.allocations && invoices.length
    ? await inChunks<any>('allocations', invoices.map((i: any) => i.id), (chunk, from, to) =>
        db.from('invoice_allocations').select('id, invoice_id, budget_line_item_id, amount').in('invoice_id', chunk).order('id').range(from, to) as any)
    : []

  // Every company a row names, plus the company's own Directory.
  const named = new Set<string>()
  for (const r of [...subcontracts, ...invoices, ...materials]) if (r.company_id) named.add(r.company_id)
  const [directory, referenced] = await Promise.all([
    all<any>('directory', (from, to) => db.from('companies').select('id, name, type, trade').eq('added_by_company_id', companyId).order('id').range(from, to)),
    named.size
      ? inChunks<any>('companies', Array.from(named), (chunk, from, to) => db.from('companies').select('id, name, type, trade').in('id', chunk).order('id').range(from, to) as any)
      : Promise.resolve([] as any[]),
  ])
  const companies = new Map<string, any>()
  for (const co of [...directory, ...referenced]) companies.set(co.id, co)

  return {
    projects, customers, companies: Array.from(companies.values()),
    subcontracts, invoices, changeOrders, materials, budgetLines, allocations,
    clientInvoices, clientInvoiceLines, clientPayments, scheduleItems,
    permits, inspections, dailyLogs, timeEntries,
  }
}

/** Today in the company's working day - Eastern, where the crews are. */
export function reportToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Load, build, and answer - or say plainly that it could not. */
export async function runReport(db: SupabaseClient, ctx: ReportCtx, config: ReportConfig):
  Promise<{ doc: ReportDoc; dropped: string[] } | { error: NextResponse }> {
  const { config: allowed, dropped } = permittedConfig(ctx.actor, config)
  if (!allowed.sections.length) {
    return { error: NextResponse.json({ error: 'You do not have access to any of the sections in this report.' }, { status: 403 }) }
  }
  let data: ReportData
  try {
    data = await loadReportData(db, ctx.companyId, allowed)
  } catch (e) {
    if (e instanceof ReadFailed) {
      return { error: NextResponse.json({ error: `Could not read the ${e.message} for this report, so it was not run - a report missing rows would print the wrong totals. Try again.` }, { status: 500 }) }
    }
    throw e
  }
  const names = new Map<string, string>()
  for (const p of data.projects) names.set(p.id, p.name)
  for (const cu of data.customers) names.set(cu.id, cu.name)
  for (const co of data.companies) names.set(co.id, co.name)
  const doc = buildReport(allowed, data, {
    today: reportToday(),
    generatedAt: new Date().toISOString(),
    pickedNames: allowed.ids.map(id => names.get(id) ?? '').filter(Boolean),
  })
  return { doc, dropped }
}

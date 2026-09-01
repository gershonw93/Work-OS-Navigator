import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { committedTotal } from '@/lib/committed'
import { ACTUAL_STATUSES } from '@/lib/invoice-budget'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Statuses taken from the live data, not from memory. Every one of these was
// checked against what is actually in the column - a status invented here reads
// as "nothing outstanding", which is the most dangerous possible way to be
// wrong on a screen whose whole job is to say what is outstanding.
const INVOICE_AWAITING = 'pending_approval'
const RFI_OPEN = 'open'
const INSPECTION_TO_BOOK = 'requested'
const SELECTION_OPEN = new Set(['pending', 'waiting'])

const days = (d: string | null | undefined): number | null => {
  if (!d) return null
  const then = new Date(d + (d.length === 10 ? 'T00:00:00' : ''))
  if (Number.isNaN(then.getTime())) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((then.getTime() - today.getTime()) / 86400000)
}

/**
 * Where this job stands, and what is waiting on whom.
 *
 * NOT A CHECKLIST. A GC knows how to run a job; a list of things to do would go
 * stale on day two and become noise. What they cannot know without opening six
 * tabs is what has piled up since they last looked - so this states facts and
 * links to them, and never tells anybody what to do about it.
 *
 * Two piles, because they need different responses. "Waiting on you" is work
 * you can clear this minute. "Waiting on someone else" is work you can only
 * chase. Mixing them is what makes a dashboard feel like nagging.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  const { data: project } = await db
    .from('projects')
    .select('id, name, status, gc_company_id, contractor_fee_pct, billing_mode, is_site')
    .eq('id', params.id)
    .single()
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // The money on this screen is the GC's position on the job. A subcontractor
  // must never be shown it, so the whole route is GC-side only; subs have their
  // own view of their own work at /my-jobs.
  const isGc = (project as any).gc_company_id === (profile as any)?.company_id
  if (!isGc) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // A site is a container - the building or the street. The budget, schedule
  // and crew live on the jobs underneath it, so an overview of one would be a
  // page of zeroes. Same answer as "you cannot see this": go somewhere useful.
  if ((project as any).is_site === true) {
    return NextResponse.json({ error: 'Sites have no overview' }, { status: 404 })
  }

  const [
    { data: invoices },
    { data: rfis },
    { data: inspections },
    { data: selections },
    { data: compliance },
    { data: payments },
    { data: paymentRequests },
    { data: schedule },
    { data: tasks },
    { data: subcontracts },
    { data: budgetLines },
  ] = await Promise.all([
    db.from('invoices').select('id, amount, status, company_name, created_at, client_paid, escrow_paid').eq('project_id', params.id),
    db.from('rfis').select('id, subject, status, created_at, company_name').eq('project_id', params.id),
    db.from('inspections').select('id, type, trade, status, scheduled_date, ready_marked_at').eq('project_id', params.id),
    db.from('project_selections').select('id, item, status, needed_by').eq('project_id', params.id),
    // Compliance is company-wide, not per project - a lapsed certificate is
    // lapsed everywhere. Narrowed to the companies actually on THIS job below.
    db.from('compliance_documents').select('id, company_id, type, status, expiry_date'),
    db.from('client_payments').select('amount').eq('project_id', params.id),
    db.from('client_payment_requests').select('id, label, amount, status, sent_at').eq('project_id', params.id).eq('status', 'pending'),
    db.from('schedule_items').select('id, label, start_date, end_date, subcontract_id').eq('project_id', params.id).order('start_date', { ascending: true }),
    db.from('project_tasks').select('id, title, status, due_date, signoff_requested_at, signoff_signed_at').eq('project_id', params.id),
    db.from('subcontracts').select('id, company_id, scope, trade, contract_amount, companies(name)').eq('project_id', params.id),
    // For Committed. Fetched alongside everything else rather than after it -
    // this route runs before the Summary can draw.
    db.from('budget_line_items').select('subcontract_id, committed_amount').eq('project_id', params.id),
  ])

  const inv = invoices ?? []
  const subs = subcontracts ?? []
  const onThisJob = new Set(subs.map((s: any) => s.company_id).filter(Boolean))
  const nameOf = (companyId: string) =>
    (subs.find((s: any) => s.company_id === companyId) as any)?.companies?.name ?? 'A vendor'

  // ── Money ────────────────────────────────────────────────────────────────
  const received = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
  const vendorBilled = inv
    .filter((i: any) => i.status !== 'draft' && i.status !== 'rejected')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0)
  const vendorPaid = inv
    .filter((i: any) => ACTUAL_STATUSES.has(String(i.status)) && i.status === 'paid')
    .reduce((s: number, i: any) => s + Number(i.amount || 0), 0)
  // ONE derivation, shared with the Budget tab and Master Money. Summing the
  // contracts alone lost every commitment that never became one, which is how
  // this screen and Budget came to disagree by a quarter of a million.
  const committed = committedTotal({ subcontracts: subs, lines: budgetLines ?? [] }).total

  // ── Waiting on you ───────────────────────────────────────────────────────
  const awaitingApproval = inv.filter((i: any) => i.status === INVOICE_AWAITING)
  const openRfis = (rfis ?? []).filter((r: any) => r.status === RFI_OPEN)
  const toBook = (inspections ?? []).filter((i: any) => i.status === INSPECTION_TO_BOOK)
  const signoffs = (tasks ?? []).filter((t: any) => t.signoff_requested_at && !t.signoff_signed_at)
  const unsentRequests = (paymentRequests ?? []).filter((r: any) => !r.sent_at)

  const waitingOnYou = [
    awaitingApproval.length && {
      key: 'invoices', count: awaitingApproval.length, href: 'invoices',
      label: `${awaitingApproval.length} bill${awaitingApproval.length === 1 ? '' : 's'} waiting for your approval`,
      detail: `$${awaitingApproval.reduce((s: number, i: any) => s + Number(i.amount || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} from ${new Set(awaitingApproval.map((i: any) => i.company_name)).size} vendor(s)`,
    },
    openRfis.length && {
      key: 'rfis', count: openRfis.length, href: 'rfis',
      label: `${openRfis.length} RFI${openRfis.length === 1 ? '' : 's'} unanswered`,
      detail: openRfis.slice(0, 2).map((r: any) => r.subject).filter(Boolean).join('; ') || null,
    },
    toBook.length && {
      key: 'inspections', count: toBook.length, href: 'inspections',
      label: `${toBook.length} inspection${toBook.length === 1 ? '' : 's'} to book`,
      detail: toBook.slice(0, 2).map((i: any) => i.trade || i.type).filter(Boolean).join('; ') || null,
    },
    signoffs.length && {
      key: 'signoffs', count: signoffs.length, href: 'tasks',
      label: `${signoffs.length} sign-off${signoffs.length === 1 ? '' : 's'} requested`,
      detail: signoffs.slice(0, 2).map((t: any) => t.title).join('; '),
    },
    unsentRequests.length && {
      key: 'unsent', count: unsentRequests.length, href: 'payments',
      label: `${unsentRequests.length} payment request${unsentRequests.length === 1 ? '' : 's'} raised but not sent`,
      detail: `$${unsentRequests.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} the client has not been told about`,
    },
  ].filter(Boolean)

  // ── Waiting on someone else ──────────────────────────────────────────────
  const sentRequests = (paymentRequests ?? []).filter((r: any) => r.sent_at)
  const lateSelections = (selections ?? []).filter((s: any) => {
    if (!SELECTION_OPEN.has(String(s.status))) return false
    const d = days(s.needed_by)
    return d != null && d < 0
  })
  const openSelections = (selections ?? []).filter((s: any) => SELECTION_OPEN.has(String(s.status)))
  const lapsed = (compliance ?? []).filter((c: any) => {
    if (!onThisJob.has(c.company_id)) return false
    const d = days(c.expiry_date)
    return d != null && d < 0
  })
  const expiring = (compliance ?? []).filter((c: any) => {
    if (!onThisJob.has(c.company_id)) return false
    const d = days(c.expiry_date)
    return d != null && d >= 0 && d <= 30
  })
  const noDocs = subs.filter((s: any) =>
    s.company_id && !(compliance ?? []).some((c: any) => c.company_id === s.company_id))

  const waitingOnOthers = [
    sentRequests.length && {
      key: 'requested', count: sentRequests.length, href: 'payments',
      label: `$${sentRequests.reduce((s: number, r: any) => s + Number(r.amount || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })} requested from the client, not yet paid`,
      detail: sentRequests.map((r: any) => r.label).join('; '),
      tone: 'warn',
    },
    lapsed.length && {
      key: 'lapsed', count: lapsed.length, href: 'compliance',
      label: `${lapsed.length} certificate${lapsed.length === 1 ? '' : 's'} expired`,
      detail: Array.from(new Set(lapsed.map((c: any) => nameOf(c.company_id)))).slice(0, 3).join(', '),
      tone: 'danger',
    },
    expiring.length && {
      key: 'expiring', count: expiring.length, href: 'compliance',
      label: `${expiring.length} certificate${expiring.length === 1 ? '' : 's'} expiring within 30 days`,
      detail: Array.from(new Set(expiring.map((c: any) => nameOf(c.company_id)))).slice(0, 3).join(', '),
      tone: 'warn',
    },
    noDocs.length && {
      key: 'nodocs', count: noDocs.length, href: 'compliance',
      label: `${noDocs.length} vendor${noDocs.length === 1 ? '' : 's'} with nothing on file`,
      detail: noDocs.slice(0, 3).map((s: any) => s.companies?.name).filter(Boolean).join(', '),
      tone: 'warn',
    },
    openSelections.length && {
      key: 'selections', count: openSelections.length, href: 'selections',
      label: `${openSelections.length} selection${openSelections.length === 1 ? '' : 's'} still to choose`,
      detail: lateSelections.length ? `${lateSelections.length} already past the date they were needed` : null,
      tone: lateSelections.length ? 'danger' : 'muted',
    },
  ].filter(Boolean)

  // ── What is happening next ───────────────────────────────────────────────
  const upcoming = (schedule ?? [])
    .map((s: any) => ({ ...s, inDays: days(s.start_date) }))
    .filter((s: any) => s.inDays != null && s.inDays >= -7 && s.inDays <= 21)
    .slice(0, 5)
    .map((s: any) => ({
      id: s.id,
      label: s.label ?? (subs.find((x: any) => x.id === s.subcontract_id) as any)?.companies?.name ?? 'Scheduled work',
      start_date: s.start_date,
      end_date: s.end_date,
      inDays: s.inDays,
    }))

  const booked = (inspections ?? [])
    .filter((i: any) => i.status === 'scheduled' && i.scheduled_date)
    .map((i: any) => ({ id: i.id, label: i.trade || i.type || 'Inspection', date: i.scheduled_date, inDays: days(i.scheduled_date) }))
    .filter((i: any) => i.inDays != null && i.inDays >= -1 && i.inDays <= 21)
    .slice(0, 5)

  const openTasks = (tasks ?? []).filter((t: any) => t.status !== 'completed')
  const overdueTasks = openTasks.filter((t: any) => {
    const d = days(t.due_date)
    return d != null && d < 0
  })

  return NextResponse.json({
    project: { id: (project as any).id, name: (project as any).name, status: (project as any).status },
    money: {
      received,
      committed,
      vendorBilled,
      vendorPaid,
      outstandingToVendors: Math.max(vendorBilled - vendorPaid, 0),
      feePct: Number((project as any).contractor_fee_pct ?? 0),
    },
    waitingOnYou,
    waitingOnOthers,
    upcoming,
    inspections: booked,
    tasks: { open: openTasks.length, overdue: overdueTasks.length },
    subcontracts: subs.length,
  })
}

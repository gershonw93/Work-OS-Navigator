import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { daysUntil, isOutstanding } from '@/lib/selections'
import { weightedProgress } from '@/lib/invoice-budget'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-success-solid' : 'bg-accent')}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-success-tint text-success',
    planning: 'bg-info-tint text-info',
    on_hold: 'bg-warn-tint text-warn',
    completed: 'bg-muted text-muted-fg',
    cancelled: 'bg-danger-tint text-danger',
    // permits
    pending: 'bg-warn-tint text-warn',
    submitted: 'bg-info-tint text-info',
    issued: 'bg-success-tint text-success',
    expired: 'bg-danger-tint text-danger',
    closed: 'bg-muted text-muted-fg',
    not_started: 'bg-muted text-muted-fg',
    approved: 'bg-success-tint text-success',
    rejected: 'bg-danger-tint text-danger',
  }
  const cls = map[status] ?? 'bg-muted text-muted-fg'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function MilestoneDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'bg-success-solid' :
    status === 'in_progress' ? 'bg-accent' :
    'bg-muted2'
  return <span className={cn('inline-block h-2.5 w-2.5 rounded-full shrink-0 mt-1', color)} />
}

export default async function PortalPage({ params }: { params: { token: string } }) {
  const db = admin()

  const { data: project } = await db
    .from('projects')
    .select('*')
    .eq('client_portal_token', params.token)
    .single()

  if (!project) notFound()

  // Fetch all data in parallel
  const [
    { data: subcontracts },
    { data: progressLines },
    { data: milestones },
    { data: permits },
    { data: dailyLogs },
    { data: selections },
    { data: paymentRequests },
    { data: clientInvoices },
    { data: clientPayments },
  ] = await Promise.all([
    db.from('subcontracts').select('*').eq('project_id', project.id),
    // Progress comes from the budget lines, same as the Progress tab. Reading
    // subcontracts.progress_percent showed the client 0% on every trade,
    // because that field is only written when a sub bills by percentage.
    db.from('budget_line_items').select('budgeted_amount, progress_pct').eq('project_id', project.id),
    db.from('schedule_items').select('*').eq('project_id', project.id).order('start_date', { ascending: true }),
    db.from('permits').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    db.from('daily_logs').select('*').eq('project_id', project.id).order('log_date', { ascending: false }).limit(5),
    db.from('project_selections').select('id, item, location, status, needed_by').eq('project_id', project.id),
    // Only what is still being asked for. A client does not need to read back
    // through deposits they already paid or requests that were withdrawn.
    db.from('client_payment_requests')
      .select('id, label, amount, due_hint, sent_at')
      .eq('project_id', project.id)
      .eq('status', 'pending')
      .not('sent_at', 'is', null)   // never sent = not yet asked; do not surprise them with it
      .order('created_at', { ascending: true }),
    // The invoices this client was actually billed. NEVER drafts - same rule
    // as the sent_at gate above: the portal must not show them something the
    // GC has not sent yet. Totals come from the lines, exactly as the /bill
    // page computes them, so the two can never disagree.
    db.from('client_invoices')
      .select('id, invoice_number, status, issue_date, due_date, paid_at, token, client_invoice_lines(amount)')
      .eq('project_id', project.id)
      .in('status', ['sent', 'paid'])
      .order('created_at', { ascending: false }),
    // The money the client has already paid. This is the ledger, not an ask -
    // requests and invoices vanish once answered, and without this the moment
    // a deposit was marked paid the portal showed no trace that money ever
    // moved. "Did they even get my money?" is the exact anxiety this page
    // exists to remove. method/qb_entered/created_by stay out on purpose:
    // internal bookkeeping, not the client's business.
    db.from('client_payments')
      .select('id, paid_date, amount, memo, retainer')
      .eq('project_id', project.id)
      .order('paid_date', { ascending: false }),
  ])

  // The one place in an otherwise read-only portal where the client owes US
  // something. Surfaced first, with the count, because a soft "have a look
  // sometime" is how selections end up late.
  const dueFromClient = paymentRequests ?? []
  const dueTotal = dueFromClient.reduce((sum: number, r: any) => sum + Number(r.amount ?? 0), 0)

  const invoices = (clientInvoices ?? []).map((b: any) => ({
    ...b,
    total: (b.client_invoice_lines ?? []).reduce((s: number, l: any) => s + Number(l.amount ?? 0), 0),
    overdue: b.status === 'sent' && b.due_date ? (daysUntil(b.due_date) ?? 0) < 0 : false,
  }))
  const paymentsMade = clientPayments ?? []
  const paidTotal = paymentsMade.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0)

  const invoicesOutstanding = invoices
    .filter((b: any) => b.status === 'sent')
    .reduce((s: number, b: any) => s + b.total, 0)
  const anyOverdue = invoices.some((b: any) => b.overdue)

  const owed = (selections ?? []).filter(s => isOutstanding(s.status))
  const owedLate = owed.filter(s => { const d = daysUntil(s.needed_by); return d != null && d < 0 }).length

  // Weighted by what each line is worth, not a flat average of trades - the
  // old version gave a $2,000 gutter line the same say as a $300,000 frame.
  // null means nobody has marked any progress, which is NOT the same as none
  // having been made, so the section is hidden rather than asserting 0%.
  const overallPct = weightedProgress(progressLines ?? [])

  const lastUpdated = project.updated_at
    ? new Date(project.updated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen bg-surface">
      {/* Header bar */}
      <div className="bg-panel border-b border-line px-4 sm:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <svg width="32" height="32" viewBox="0 0 48 48" className="shrink-0" aria-hidden>
              <rect width="48" height="48" rx="10" fill="rgb(var(--ink))" />
              <path d="M14 13 L37 22 L26 26 L22 37 Z" fill="rgb(var(--accent))" />
            </svg>
            <span className="font-display font-bold uppercase tracking-tight text-ink text-base">SYTE<span className="text-accent-fg">NAV</span></span>
          </div>
          <span className="text-xs text-faint">Client Portal · Read-only view</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">

        {/* Project identity */}
        <div className="bg-panel rounded-xl border border-line p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-ink">{project.name}</h1>
              {project.address && <p className="text-muted-fg mt-1">{project.address}</p>}
              {project.client && (
                <p className="text-sm text-muted-fg mt-1">Client: <span className="font-medium text-ink-soft">{project.client}</span></p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {project.status && <StatusBadge status={project.status} />}
              {lastUpdated && <p className="text-xs text-faint">Last updated {lastUpdated}</p>}
            </div>
          </div>
        </div>

        {/* Progress summary */}
        <div className="bg-panel rounded-xl border border-line p-4 sm:p-6">
          <h2 className="text-base font-semibold text-ink-soft mb-4">Progress Summary</h2>
          {overallPct != null ? (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-medium text-muted-fg">Overall Progress</span>
                <span className="text-sm font-bold text-ink-soft">{overallPct}%</span>
              </div>
              <ProgressBar pct={overallPct} />
            </div>
          ) : (
            <p className="text-sm text-faint">Progress has not been marked up yet.</p>
          )}
          {subcontracts && subcontracts.length > 0 && (
            <div className="space-y-3 mt-5">
              {subcontracts.map((sub) => {
                // A trade with no figure gets no bar. Printing 0% next to work
                // the client can watch happening outside their window is how a
                // portal loses its credibility in one glance.
                const pct = sub.progress_percent
                return (
                  <div key={sub.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-fg">{sub.trade ?? sub.scope_summary ?? 'Subcontract'}</span>
                      <span className="text-xs font-semibold text-ink-soft">
                        {pct == null || pct === 0 ? 'In progress' : `${pct}%`}
                      </span>
                    </div>
                    {pct != null && pct > 0 && <ProgressBar pct={pct} />}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Schedule / Milestones */}
        <div className="bg-panel rounded-xl border border-line p-4 sm:p-6">
          <h2 className="text-base font-semibold text-ink-soft mb-4">Schedule</h2>
          {milestones && milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-start gap-3">
                  <MilestoneDot status={m.status ?? 'not_started'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-soft">{m.title}</span>
                      <StatusBadge status={m.status ?? 'not_started'} />
                    </div>
                    {(m.start_date || m.end_date) && (
                      <p className="text-xs text-faint mt-0.5">
                        {m.start_date && new Date(m.start_date + 'T00:00:00').toLocaleDateString()}
                        {m.start_date && m.end_date && ' – '}
                        {m.end_date && new Date(m.end_date + 'T00:00:00').toLocaleDateString()}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No schedule items on record.</p>
          )}
        </div>

        {/* Money the client still owes us.
            Above selections because it is the more consequential ask, and it
            only ever appears once the request has actually been sent - see the
            query. Read-only, like the rest of the portal: this states what is
            owed and why, it does not take a payment. */}
        {dueFromClient.length > 0 && (
          <div className="rounded-xl border border-warn/40 bg-warn-tint/50 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Payment requested</h2>
                <p className="text-sm text-muted-fg mt-0.5">
                  {dueFromClient.length === 1
                    ? 'One payment is being requested on this job.'
                    : `${dueFromClient.length} payments are being requested on this job.`}
                </p>
              </div>
              <span className="text-xl font-bold text-ink shrink-0">
                ${dueTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {dueFromClient.map((r: any) => (
                <div key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-warn/20 pt-1.5">
                  <span className="text-sm font-medium text-ink-soft">
                    {r.label}
                    {r.due_hint && <span className="ml-1.5 text-xs font-normal text-muted-fg">due {r.due_hint}</span>}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    ${Number(r.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-fg">
              Pay these the way you normally pay your contractor - get in touch with them if you are not sure how.
            </p>
          </div>
        )}

        {/* The invoices they were billed. Every row opens the invoice's own
            page - the same link the email carried, so a client who lost the
            email finds the bill here instead of asking for it again. */}
        {invoices.length > 0 && (
          <div className={cn('rounded-xl border p-4 sm:p-6',
            anyOverdue ? 'border-danger/30 bg-danger-tint/20' : 'border-line bg-panel')}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Invoices</h2>
                <p className="text-sm text-muted-fg mt-0.5">
                  {invoicesOutstanding > 0
                    ? `$${invoicesOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })} currently due.`
                    : 'Everything billed so far has been paid.'}
                </p>
              </div>
              {invoicesOutstanding > 0 && (
                <span className="text-xl font-bold text-ink shrink-0">
                  ${invoicesOutstanding.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5">
              {invoices.map((b: any) => (
                <a key={b.id} href={`/bill/${b.token}`} target="_blank" rel="noreferrer"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panel px-3 py-2.5 transition-colors hover:border-accent">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">Invoice {b.invoice_number}</span>
                    <span className="block text-xs text-muted-fg">
                      {b.issue_date && new Date(b.issue_date + 'T00:00:00').toLocaleDateString()}
                      {b.status === 'sent' && b.due_date && ` · due ${new Date(b.due_date + 'T00:00:00').toLocaleDateString()}`}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-bold text-ink">
                      ${b.total.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                    <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold',
                      b.status === 'paid' ? 'bg-success-tint text-success'
                        : b.overdue ? 'bg-danger-tint text-danger'
                        : 'bg-warn-tint text-warn')}>
                      {b.status === 'paid' ? 'Paid' : b.overdue ? 'Overdue' : 'Due'}
                    </span>
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-fg">
              Open an invoice to see the full breakdown. Pay the way you normally pay your contractor.
            </p>
          </div>
        )}

        {/* Money the client has paid. The one card on this page that is pure
            good news, and it stays after everything is settled - the asks above
            disappear once answered, this is the standing record. */}
        {paymentsMade.length > 0 && (
          <div className="rounded-xl border border-success/30 bg-success-tint/30 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Payments</h2>
                <p className="text-sm text-muted-fg mt-0.5">Received and recorded. Thank you.</p>
              </div>
              <span className="text-xl font-bold text-success shrink-0">
                ${paidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} paid
              </span>
            </div>
            <div className="mt-3 space-y-1.5">
              {paymentsMade.map((p: any) => (
                <div key={p.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-success/20 pt-1.5">
                  <span className="min-w-0 text-sm text-ink-soft">
                    {p.paid_date && (
                      <span className="font-medium">{new Date(p.paid_date + 'T00:00:00').toLocaleDateString()}</span>
                    )}
                    {p.memo && <span className="text-muted-fg"> · {p.memo}</span>}
                    {p.retainer && (
                      <span className="ml-1.5 rounded-full bg-success-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-success">deposit</span>
                    )}
                  </span>
                  <span className="text-sm font-semibold text-ink">
                    ${Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Selections the client still owes us */}
        {(selections?.length ?? 0) > 0 && (
          <Link href={`/portal/${params.token}/selections`}
            className={cn('block rounded-xl border p-4 sm:p-6 transition-colors hover:border-accent',
              owed.length ? 'bg-accent-tint border-accent/40' : 'bg-panel border-line')}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-ink">Your selections</h2>
                <p className="text-sm text-muted-fg mt-0.5">
                  {owed.length === 0
                    ? 'Everything is decided - nothing is waiting on you.'
                    : `${owed.length} choice${owed.length === 1 ? '' : 's'} still needed from you${owedLate ? `, ${owedLate} past due` : ''}.`}
                </p>
              </div>
              <span className="rounded-lg bg-accent text-accent-ink text-sm font-semibold px-4 py-2 shrink-0">
                {owed.length ? 'Make your picks' : 'View selections'}
              </span>
            </div>
          </Link>
        )}

        {/* Permits */}
        <div className="bg-panel rounded-xl border border-line p-4 sm:p-6">
          <h2 className="text-base font-semibold text-ink-soft mb-4">Permits</h2>
          {permits && permits.length > 0 ? (
            <div className="divide-y divide-line-soft">
              {permits.map((p) => (
                <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink-soft">{p.permit_type}</p>
                    {p.permit_number && <p className="text-xs text-faint">#{p.permit_number}</p>}
                    {p.issuing_authority && <p className="text-xs text-faint">{p.issuing_authority}</p>}
                  </div>
                  <StatusBadge status={p.status ?? 'pending'} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No permits on record.</p>
          )}
        </div>

        {/* Recent Daily Logs */}
        <div className="bg-panel rounded-xl border border-line p-4 sm:p-6">
          <h2 className="text-base font-semibold text-ink-soft mb-4">Recent Daily Logs</h2>
          {dailyLogs && dailyLogs.length > 0 ? (
            <div className="space-y-4">
              {dailyLogs.map((log) => (
                <div key={log.id} className="border border-line-soft rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-ink-soft">
                      {log.log_date
                        ? new Date(log.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : 'Date unknown'}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-muted-fg">
                      {log.weather && <span>☀ {log.weather}</span>}
                      {log.worker_count != null && <span>👷 {log.worker_count} crew</span>}
                    </div>
                  </div>
                  {log.notes && <p className="text-sm text-muted-fg leading-relaxed">{log.notes}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-faint">No daily logs on record.</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-faint space-y-1">
          <p className="font-medium text-muted-fg">SyteNav</p>
          <p>This is a read-only client portal. For questions, contact your project manager.</p>
        </div>
      </div>
    </div>
  )
}

import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import { cn } from '@/lib/utils'

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
    { data: milestones },
    { data: permits },
    { data: dailyLogs },
  ] = await Promise.all([
    db.from('subcontracts').select('*').eq('project_id', project.id),
    db.from('schedule_items').select('*').eq('project_id', project.id).order('start_date', { ascending: true }),
    db.from('permits').select('*').eq('project_id', project.id).order('created_at', { ascending: false }),
    db.from('daily_logs').select('*').eq('project_id', project.id).order('log_date', { ascending: false }).limit(5),
  ])

  const overallPct =
    subcontracts && subcontracts.length > 0
      ? Math.round(
          subcontracts.reduce((sum, s) => sum + (s.progress_percent ?? 0), 0) / subcontracts.length,
        )
      : 0

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
              {project.client_name && (
                <p className="text-sm text-muted-fg mt-1">Client: <span className="font-medium text-ink-soft">{project.client_name}</span></p>
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
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-muted-fg">Overall Progress</span>
              <span className="text-sm font-bold text-ink-soft">{overallPct}%</span>
            </div>
            <ProgressBar pct={overallPct} />
          </div>
          {subcontracts && subcontracts.length > 0 ? (
            <div className="space-y-3 mt-5">
              {subcontracts.map((sub) => {
                const pct = sub.progress_percent ?? 0
                return (
                  <div key={sub.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-muted-fg">{sub.trade ?? sub.scope_summary ?? 'Subcontract'}</span>
                      <span className="text-xs font-semibold text-ink-soft">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-faint">No subcontracts on record.</p>
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

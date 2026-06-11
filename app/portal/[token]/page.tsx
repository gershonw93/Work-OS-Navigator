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
    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
      <div
        className={cn('h-full rounded-full transition-all', pct === 100 ? 'bg-green-500' : 'bg-orange-500')}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    planning: 'bg-blue-100 text-blue-700',
    on_hold: 'bg-yellow-100 text-yellow-700',
    completed: 'bg-slate-100 text-slate-600',
    cancelled: 'bg-red-100 text-red-600',
    // permits
    pending: 'bg-yellow-100 text-yellow-700',
    submitted: 'bg-blue-100 text-blue-700',
    issued: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-600',
    closed: 'bg-slate-100 text-slate-500',
    not_started: 'bg-slate-100 text-slate-500',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-600',
  }
  const cls = map[status] ?? 'bg-slate-100 text-slate-600'
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>
      {status.replace(/_/g, ' ')}
    </span>
  )
}

function MilestoneDot({ status }: { status: string }) {
  const color =
    status === 'completed' ? 'bg-green-500' :
    status === 'in_progress' ? 'bg-orange-500' :
    'bg-slate-200'
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
    <div className="min-h-screen bg-slate-50">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-orange-500 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-sm">W</span>
            </div>
            <span className="font-semibold text-slate-700 text-sm">WorkOS Navigator</span>
          </div>
          <span className="text-xs text-slate-400">Client Portal · Read-only view</span>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8 space-y-6">

        {/* Project identity */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
              {project.address && <p className="text-slate-500 mt-1">{project.address}</p>}
              {project.client_name && (
                <p className="text-sm text-slate-500 mt-1">Client: <span className="font-medium text-slate-700">{project.client_name}</span></p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              {project.status && <StatusBadge status={project.status} />}
              {lastUpdated && <p className="text-xs text-slate-400">Last updated {lastUpdated}</p>}
            </div>
          </div>
        </div>

        {/* Progress summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Progress Summary</h2>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-slate-600">Overall Progress</span>
              <span className="text-sm font-bold text-slate-800">{overallPct}%</span>
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
                      <span className="text-sm text-slate-600">{sub.trade ?? sub.scope_summary ?? 'Subcontract'}</span>
                      <span className="text-xs font-semibold text-slate-700">{pct}%</span>
                    </div>
                    <ProgressBar pct={pct} />
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No subcontracts on record.</p>
          )}
        </div>

        {/* Schedule / Milestones */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Schedule</h2>
          {milestones && milestones.length > 0 ? (
            <div className="space-y-3">
              {milestones.map((m) => (
                <div key={m.id} className="flex items-start gap-3">
                  <MilestoneDot status={m.status ?? 'not_started'} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-800">{m.title}</span>
                      <StatusBadge status={m.status ?? 'not_started'} />
                    </div>
                    {(m.start_date || m.end_date) && (
                      <p className="text-xs text-slate-400 mt-0.5">
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
            <p className="text-sm text-slate-400">No schedule items on record.</p>
          )}
        </div>

        {/* Permits */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Permits</h2>
          {permits && permits.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {permits.map((p) => (
                <div key={p.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.permit_type}</p>
                    {p.permit_number && <p className="text-xs text-slate-400">#{p.permit_number}</p>}
                    {p.issuing_authority && <p className="text-xs text-slate-400">{p.issuing_authority}</p>}
                  </div>
                  <StatusBadge status={p.status ?? 'pending'} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No permits on record.</p>
          )}
        </div>

        {/* Recent Daily Logs */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-4">Recent Daily Logs</h2>
          {dailyLogs && dailyLogs.length > 0 ? (
            <div className="space-y-4">
              {dailyLogs.map((log) => (
                <div key={log.id} className="border border-slate-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-slate-700">
                      {log.log_date
                        ? new Date(log.log_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                        : 'Date unknown'}
                    </span>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      {log.weather && <span>☀ {log.weather}</span>}
                      {log.worker_count != null && <span>👷 {log.worker_count} crew</span>}
                    </div>
                  </div>
                  {log.notes && <p className="text-sm text-slate-600 leading-relaxed">{log.notes}</p>}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No daily logs on record.</p>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 text-xs text-slate-400 space-y-1">
          <p className="font-medium text-slate-500">WorkOS Navigator</p>
          <p>This is a read-only client portal. For questions, contact your project manager.</p>
        </div>
      </div>
    </div>
  )
}

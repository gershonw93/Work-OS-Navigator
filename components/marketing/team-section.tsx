import { Users, ShieldCheck, CheckSquare, Clock, Check } from 'lucide-react'

const TEAM = [
  { name: 'Garry W.', role: 'Owner / Admin', tone: 'bg-accent-tint text-accent-fg' },
  { name: 'Marcus T.', role: 'Project Manager', tone: 'bg-info-tint text-info' },
  { name: 'Dani R.', role: 'Field Supervisor', tone: 'bg-success-tint text-success' },
  { name: 'Sal P.', role: 'Office', tone: 'bg-warn-tint text-warn' },
  { name: 'Crew (×6)', role: 'Worker', tone: 'bg-muted text-muted-fg' },
]

// Team members & management, roles, assignments, approvals.
export function TeamSection() {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid lg:grid-cols-2 gap-10 items-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Team & management</p>
        <h2 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">Your whole crew, on the same page</h2>
        <p className="mt-3 text-muted-fg">Invite the office, PMs, field supervisors, and crew, then control exactly what each person sees and can do. Assign work, approve timesheets and invoices, and keep everyone moving.</p>
        <ul className="mt-5 space-y-2.5">
          {[
            { icon: Users, t: 'Invite your team in seconds, by email' },
            { icon: ShieldCheck, t: 'Role-based access: admin, PM, office, field, crew' },
            { icon: CheckSquare, t: 'Assign tasks with priority and due dates' },
            { icon: Clock, t: 'Approve timesheets, invoices, and change orders' },
          ].map(x => (
            <li key={x.t} className="flex items-start gap-2.5 text-sm text-ink-soft"><x.icon className="h-4 w-4 text-accent-fg mt-0.5 shrink-0" /> {x.t}</li>
          ))}
        </ul>
      </div>

      {/* Team roster mock */}
      <div className="rounded-2xl border border-line bg-panel p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-semibold text-ink-soft inline-flex items-center gap-2"><Users className="h-4 w-4 text-accent-fg" /> Team</span>
          <span className="text-xs rounded-md bg-accent text-accent-ink font-semibold px-2 py-1">Invite</span>
        </div>
        <div className="divide-y divide-line-soft">
          {TEAM.map(m => (
            <div key={m.name} className="flex items-center justify-between gap-3 py-2.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold ${m.tone}`}>{m.name.slice(0, 1)}</span>
                <span className="text-sm text-ink-soft truncate">{m.name}</span>
              </div>
              <span className="text-xs text-muted-fg shrink-0">{m.role}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-surface border border-line-soft px-3 py-2 flex items-center gap-2 text-xs text-muted-fg">
          <Check className="h-3.5 w-3.5 text-success" /> Permissions set per role, change anytime
        </div>
      </div>
    </section>
  )
}

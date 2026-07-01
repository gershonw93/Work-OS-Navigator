import { AlertTriangle, CalendarDays, Sparkles } from 'lucide-react'

// A subcontractor's week across multiple jobs, with a crew-overlap warning.
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

// start/span are day indexes into DAYS.
const JOBS = [
  { name: 'Maple St · rough-in', start: 0, span: 4, tone: 'bg-accent text-accent-ink', crew: '3 crew' },
  { name: 'Harborview · panel swap', start: 3, span: 2, tone: 'bg-info/80 text-surface', crew: '2 crew' },
  { name: 'Riverside · trim-out', start: 5, span: 1, tone: 'bg-success-solid/80 text-surface', crew: '2 crew' },
] as const

export function ScheduleMock() {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl text-left">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink">
          <CalendarDays className="h-4 w-4 text-accent-fg" /> My week · all jobs
        </span>
        <span className="text-[11px] text-faint font-mono">Jun 29 – Jul 4</span>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-6 gap-1 mb-1">
        {DAYS.map(d => (
          <div key={d} className={`text-center text-[10px] font-semibold py-1 rounded ${d === 'Thu' ? 'bg-warn-tint text-warn' : 'text-muted-fg'}`}>
            {d}
          </div>
        ))}
      </div>

      {/* Job bars */}
      <div className="space-y-1.5">
        {JOBS.map(j => (
          <div key={j.name} className="grid grid-cols-6 gap-1">
            <div
              className={`rounded-md px-2 py-1.5 text-[10px] font-semibold truncate ${j.tone}`}
              style={{ gridColumnStart: j.start + 1, gridColumnEnd: `span ${j.span}` }}
            >
              {j.name} <span className="opacity-70 font-normal hidden sm:inline">· {j.crew}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Overlap warning */}
      <div className="mt-3 flex items-start gap-2 rounded-lg bg-warn-tint border border-warn/30 px-3 py-2.5">
        <AlertTriangle className="h-4 w-4 text-warn shrink-0 mt-px" />
        <div className="text-[11px] leading-snug">
          <p className="font-semibold text-warn">Overlap on Thursday</p>
          <p className="text-muted-fg mt-0.5">Maple St and Harborview both need your crew, 5 required, 4 available.</p>
        </div>
      </div>
      <div className="mt-1.5 flex items-start gap-2 rounded-lg bg-accent-tint/60 px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-accent-fg shrink-0 mt-px" />
        <p className="text-[11px] text-accent-fg leading-snug">
          <span className="font-semibold">Suggestion:</span> shift Harborview to start Friday. No milestones slip.
        </p>
      </div>
    </div>
  )
}

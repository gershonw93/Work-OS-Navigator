import { Search, Plus, FolderKanban, MapPin } from 'lucide-react'

// A busy "Projects" page mock — used as the screen content in the scroll hero.
const PROJECTS = [
  ['Maple Street Residences', 'Brooklyn, NY', 'Active', 74, '$1.2M'],
  ['Linden Ave Remodel', 'Linden, NJ', 'Active', 38, '$420K'],
  ['Princeton Commercial', 'Princeton, NJ', 'Planning', 12, '$3.1M'],
  ['Oak Park Townhomes', 'Newark, NJ', 'Active', 91, '$880K'],
  ['Harborview Lofts', 'Jersey City, NJ', 'Active', 56, '$2.4M'],
  ['Cedar Lane Duplex', 'Edison, NJ', 'On hold', 22, '$310K'],
  ['Summit Office Fit-out', 'Summit, NJ', 'Active', 67, '$640K'],
  ['Garden State Plaza Unit 4', 'Paramus, NJ', 'Planning', 5, '$1.7M'],
  ['Riverside Kitchen Reno', 'Hoboken, NJ', 'Active', 83, '$190K'],
] as const

const STATUS: Record<string, string> = {
  Active: 'bg-success-tint text-success', Planning: 'bg-info-tint text-info', 'On hold': 'bg-warn-tint text-warn',
}

export function ProjectsMock() {
  return (
    <div className="bg-surface text-left h-full overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-panel">
        <div className="flex items-center gap-2"><FolderKanban className="h-4 w-4 text-accent-fg" /><span className="text-sm font-bold text-ink">Projects</span><span className="text-xs text-faint">· 18 active</span></div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-faint"><Search className="h-3 w-3" /> Search projects…</div>
          <div className="rounded-md bg-accent text-accent-ink text-[11px] font-semibold px-2.5 py-1 inline-flex items-center gap-1"><Plus className="h-3 w-3" /> New</div>
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3">
        {PROJECTS.map(([name, loc, status, pct, val]) => (
          <div key={name as string} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs font-semibold text-ink leading-tight">{name}</span>
              <span className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 ${STATUS[status as string]}`}>{status}</span>
            </div>
            <p className="text-[10px] text-faint flex items-center gap-1 mb-2"><MapPin className="h-2.5 w-2.5" /> {loc}</p>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-1.5"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
            <div className="flex items-center justify-between text-[10px]"><span className="text-muted-fg">{pct}% complete</span><span className="font-semibold text-ink">{val}</span></div>
          </div>
        ))}
      </div>
    </div>
  )
}

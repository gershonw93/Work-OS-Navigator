import { Search, Plus, FolderKanban, MapPin, AlertTriangle, CalendarDays } from 'lucide-react'

// A busy "Projects" screen, the star of the scroll hero. Dense enough to read
// as a real day at a real company, no real data.
const PROJECTS = [
  { name: 'Maple Street Residences', loc: 'Brooklyn, NY', status: 'Active', pct: 74, val: '$1.2M', due: 'Inspection Thu', crew: ['M', 'D', 'K'] },
  { name: 'Linden Ave Remodel', loc: 'Linden, NJ', status: 'Active', pct: 38, val: '$420K', due: 'Draw #2 due', crew: ['S', 'J'] },
  { name: 'Princeton Commercial', loc: 'Princeton, NJ', status: 'Planning', pct: 12, val: '$3.1M', due: '3 bids in', crew: ['G'] },
  { name: 'Oak Park Townhomes', loc: 'Newark, NJ', status: 'Active', pct: 91, val: '$880K', due: 'Punch list', crew: ['M', 'A', 'R'] },
  { name: 'Harborview Lofts', loc: 'Jersey City, NJ', status: 'Active', pct: 56, val: '$2.4M', due: 'Delivery Mon', crew: ['D', 'T'] },
  { name: 'Cedar Lane Duplex', loc: 'Edison, NJ', status: 'On hold', pct: 22, val: '$310K', due: 'Permit pending', crew: ['S'] },
  { name: 'Summit Office Fit-out', loc: 'Summit, NJ', status: 'Active', pct: 67, val: '$640K', due: 'RFI open', crew: ['K', 'J', 'A'] },
  { name: 'Garden State Plaza Unit 4', loc: 'Paramus, NJ', status: 'Planning', pct: 5, val: '$1.7M', due: 'RFQ sent', crew: ['G', 'M'] },
  { name: 'Riverside Kitchen Reno', loc: 'Hoboken, NJ', status: 'Active', pct: 83, val: '$190K', due: 'Final invoice', crew: ['D'] },
  { name: 'Bergen Point Warehouse', loc: 'Bayonne, NJ', status: 'Active', pct: 44, val: '$2.9M', due: 'Steel Tue', crew: ['M', 'T'] },
  { name: 'Palisade Ave Brownstone', loc: 'Weehawken, NJ', status: 'Active', pct: 61, val: '$530K', due: 'Rough-in', crew: ['K', 'D'] },
  { name: 'Montclair Dental Fit-out', loc: 'Montclair, NJ', status: 'Planning', pct: 8, val: '$760K', due: '2 bids in', crew: ['G', 'A'] },
  { name: 'Fort Lee High-Rise 12B', loc: 'Fort Lee, NJ', status: 'Active', pct: 29, val: '$1.1M', due: 'Submittal due', crew: ['J', 'R'] },
  { name: 'Morristown Cafe Build-out', loc: 'Morristown, NJ', status: 'On hold', pct: 15, val: '$280K', due: 'CO pending', crew: ['S'] },
  { name: 'Hackensack Medical Suite', loc: 'Hackensack, NJ', status: 'Active', pct: 72, val: '$940K', due: 'Trim-out', crew: ['A', 'K', 'T'] },
]

const STATUS: Record<string, string> = {
  Active: 'bg-success-tint text-success',
  Planning: 'bg-info-tint text-info',
  'On hold': 'bg-warn-tint text-warn',
}

const AVATAR_TONES = ['bg-accent-tint text-accent-fg', 'bg-info-tint text-info', 'bg-success-tint text-success']

export function ProjectsMock() {
  return (
    <div className="bg-surface text-left h-full overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-line bg-panel shrink-0">
        <div className="flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-accent-fg" />
          <span className="text-sm font-bold text-ink">Projects</span>
          <span className="text-xs text-faint">· $10.8M under contract</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-faint">
            <Search className="h-3 w-3" /> Search projects…
          </div>
          <div className="rounded-md bg-accent text-accent-ink text-[11px] font-semibold px-2.5 py-1 inline-flex items-center gap-1">
            <Plus className="h-3 w-3" /> New project
          </div>
        </div>
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-line-soft shrink-0">
        {[['All', '18', true], ['Active', '12', false], ['Planning', '4', false], ['On hold', '2', false]].map(([label, n, on]) => (
          <span
            key={label as string}
            className={`text-[10px] font-semibold rounded-full px-2.5 py-1 ${on ? 'bg-ink text-surface' : 'bg-muted text-muted-fg'}`}
          >
            {label as string} <span className="opacity-60">{n as string}</span>
          </span>
        ))}
        <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-[10px] text-warn font-medium">
          <AlertTriangle className="h-3 w-3" /> 3 items need attention
        </span>
      </div>

      {/* Grid. Rows stretch to fill tall screens (no empty glass at the bottom
          of the hero monitor) and clip on short ones, like a real app. */}
      <div className="p-4 grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 auto-rows-[minmax(9rem,1fr)] overflow-hidden">
        {PROJECTS.map(p => (
          <div key={p.name} className="rounded-lg border border-line bg-panel p-3">
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <span className="text-xs font-semibold text-ink leading-tight">{p.name}</span>
              <span className={`text-[9px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 ${STATUS[p.status]}`}>{p.status}</span>
            </div>
            <p className="text-[10px] text-faint flex items-center gap-1 mb-2">
              <MapPin className="h-2.5 w-2.5" /> {p.loc}
            </p>
            <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-accent" style={{ width: `${p.pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] mb-2">
              <span className="text-muted-fg">{p.pct}% complete</span>
              <span className="font-semibold text-ink">{p.val}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex -space-x-1.5">
                {p.crew.map((c, i) => (
                  <span key={i} className={`h-5 w-5 rounded-full border border-panel text-[8px] font-bold flex items-center justify-center ${AVATAR_TONES[i % AVATAR_TONES.length]}`}>
                    {c}
                  </span>
                ))}
              </div>
              <span className="inline-flex items-center gap-1 text-[9px] text-muted-fg">
                <CalendarDays className="h-2.5 w-2.5" /> {p.due}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

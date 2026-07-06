import { ReactNode } from 'react'
import {
  Camera, Check, Clock, CloudSun, MapPin, Plus, ScanLine, Sparkles, Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// A phone frame for field-view mockups. Pass one of the screens below.
export function PhoneMock({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-[280px] rounded-[2.6rem] border-[9px] border-[#202126] bg-[#202126] shadow-2xl shadow-black/25 overflow-hidden', className)}>
      <div className="relative bg-surface">
        {/* Notch */}
        <div aria-hidden className="absolute top-2.5 left-1/2 -translate-x-1/2 h-5 w-24 rounded-full bg-[#202126] z-10" />
        <div className="pt-11 pb-5 px-4 min-h-[540px] flex flex-col">{children}</div>
      </div>
    </div>
  )
}

function ScreenHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-4">
      <p className="text-sm font-bold text-ink">{title}</p>
      <p className="text-[11px] text-faint flex items-center gap-1"><MapPin className="h-2.5 w-2.5" /> {sub}</p>
    </div>
  )
}

// Daily log: weather, crew, photos, notes, one big submit.
export function LogScreen() {
  return (
    <>
      <ScreenHeader title="Daily log" sub="Maple Street Residences" />
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-faint mb-1">Weather</p>
          <p className="text-xs font-semibold text-ink flex items-center gap-1.5"><CloudSun className="h-3.5 w-3.5 text-warn" /> 72° Clear</p>
        </div>
        <div className="rounded-xl border border-line bg-panel px-3 py-2.5">
          <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-faint mb-1">Crew on site</p>
          <p className="text-xs font-semibold text-ink flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-info" /> 6 workers</p>
        </div>
      </div>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-faint mb-1.5">Photos</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="aspect-square rounded-lg bg-muted" />
        <div className="aspect-square rounded-lg bg-muted2" />
        <div className="aspect-square rounded-lg border-2 border-dashed border-line flex items-center justify-center">
          <Camera className="h-4 w-4 text-faint" />
        </div>
      </div>
      <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-faint mb-1.5">Work performed</p>
      <div className="rounded-xl border border-line bg-panel px-3 py-2.5 mb-4 space-y-1.5">
        <p className="text-[11px] text-ink-soft leading-snug">Second-floor rough-in complete, 18 of 24 points.</p>
        <p className="text-[11px] text-faint leading-snug">Inspector confirmed for Thu 9am.</p>
      </div>
      <div className="mt-auto rounded-xl bg-accent text-accent-ink text-center text-sm font-bold py-3">
        File today&apos;s log
      </div>
    </>
  )
}

// Time clock: one giant button, location attached.
export function ClockScreen() {
  return (
    <>
      <ScreenHeader title="Time clock" sub="Maple Street Residences" />
      <div className="text-center my-4">
        <p className="font-mono text-4xl font-bold text-ink tracking-tight">6:58<span className="text-lg text-faint"> AM</span></p>
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-success-tint text-success text-[11px] font-semibold px-2.5 py-1">
          <Check className="h-3 w-3" /> Clocked in · on site
        </p>
      </div>
      <div className="rounded-xl border border-line bg-panel divide-y divide-line-soft mb-4">
        {[['Mon', '8h 15m'], ['Tue', '7h 50m'], ['Wed', '8h 05m'], ['Today', '2h 12m']].map(([d, h]) => (
          <div key={d} className="flex items-center justify-between px-3 py-2">
            <span className="text-[11px] text-muted-fg">{d}</span>
            <span className="text-[11px] font-mono font-semibold text-ink">{h}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-xl border-2 border-line text-ink text-center text-sm font-bold py-3 flex items-center justify-center gap-2">
        <Clock className="h-4 w-4" /> Clock out
      </div>
    </>
  )
}

// Camera scan: photograph a paper quote, AI extracts it.
export function ScanScreen() {
  return (
    <>
      <ScreenHeader title="Scan a document" sub="Camera · quote, receipt, permit" />
      <div className="relative rounded-xl bg-ink/90 dark:bg-muted aspect-[4/5] mb-3 overflow-hidden flex items-center justify-center">
        {/* Paper in the viewfinder */}
        <div className="w-3/4 h-4/5 rounded-sm bg-surface rotate-2 p-2.5 space-y-1.5">
          <div className="h-1.5 w-2/3 rounded bg-muted2" />
          <div className="h-1 w-1/2 rounded bg-muted" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <div className="h-1 rounded bg-muted flex-1" />
              <div className="h-1 w-5 rounded bg-muted2" />
            </div>
          ))}
        </div>
        {/* Corner guides + scan beam */}
        <div aria-hidden className="absolute top-3 left-3 h-6 w-6 border-t-2 border-l-2 border-accent rounded-tl-md" />
        <div aria-hidden className="absolute top-3 right-3 h-6 w-6 border-t-2 border-r-2 border-accent rounded-tr-md" />
        <div aria-hidden className="absolute bottom-3 left-3 h-6 w-6 border-b-2 border-l-2 border-accent rounded-bl-md" />
        <div aria-hidden className="absolute bottom-3 right-3 h-6 w-6 border-b-2 border-r-2 border-accent rounded-br-md" />
        <div aria-hidden className="absolute inset-x-6 top-1/3 h-7 bg-gradient-to-b from-transparent via-accent/30 to-transparent border-y border-accent/50" />
        <span className="absolute bottom-2.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 rounded-full bg-accent text-accent-ink text-[10px] font-bold px-2.5 py-1">
          <ScanLine className="h-3 w-3" /> Scanning…
        </span>
      </div>
      <div className="rounded-xl bg-accent-tint/60 border border-accent/30 px-3 py-2.5 mb-2 flex items-center justify-between">
        <span className="text-[11px] text-accent-fg font-semibold inline-flex items-center gap-1"><Sparkles className="h-3 w-3" /> 24 line items found</span>
        <span className="text-[11px] font-bold text-ink-soft font-mono">$13,025</span>
      </div>
      <div className="mt-auto rounded-xl bg-accent text-accent-ink text-center text-sm font-bold py-3">
        Review &amp; add to job
      </div>
    </>
  )
}

// Tasks: what the crew opens first thing.
export function TasksScreen() {
  const tasks = [
    { t: 'Set GFCIs, kitchen island', done: true },
    { t: 'Pull homeruns, bedrooms 2 & 3', done: true },
    { t: 'Panel labeling before inspection', done: false },
    { t: 'Photo of firestopping for log', done: false },
  ]
  return (
    <>
      <ScreenHeader title="My tasks" sub="Thu · Maple Street Residences" />
      <div className="space-y-2 mb-4">
        {tasks.map(x => (
          <div key={x.t} className="flex items-start gap-2.5 rounded-xl border border-line bg-panel px-3 py-2.5">
            <span className={cn('h-4 w-4 rounded flex items-center justify-center shrink-0 mt-px', x.done ? 'bg-accent text-accent-ink' : 'border-2 border-line')}>
              {x.done && <Check className="h-3 w-3" />}
            </span>
            <p className={cn('text-[11px] leading-snug', x.done ? 'text-faint line-through' : 'text-ink-soft')}>{x.t}</p>
          </div>
        ))}
      </div>
      <div className="mt-auto rounded-xl border-2 border-dashed border-line text-muted-fg text-center text-xs font-semibold py-3 flex items-center justify-center gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add a task
      </div>
    </>
  )
}

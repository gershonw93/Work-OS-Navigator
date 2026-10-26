import {
  Search, Plus, MapPin, User, Calendar, Pencil, Trash2, LayoutGrid, List, Map as MapIcon,
  LayoutDashboard, FolderKanban, Users, BookUser, Folder, Wrench, ShoppingCart, CheckSquare,
  CalendarDays, DollarSign, Bell, Building2, SlidersHorizontal, ArrowUpDown, ChevronsUpDown,
} from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { SAMPLE_PROJECTS as PROJECTS, STATUS_LABEL, fmtMoney, type SampleStatus as Status } from './sample-company'
import { MockImage } from './mock-image'

// The Projects screen, the star of the scroll hero. It is drawn to look like
// the REAL screen (app/(dashboard)/projects/page.tsx) - sidebar, stat boxes,
// toolbar, and the same card: status strip, type, address, client, dates,
// task progress, and the Contract / Paid / Outstanding tiles. A marketing
// picture of a screen the product does not have is a promise it cannot keep.
//
// THIS IS THE SOURCE OF A PICTURE, NOT A PAGE ELEMENT. `ProjectsScreen` is
// rendered once by scripts/render-mocks.mjs and screenshotted; the website
// shows `ProjectsMock`, the image. As live HTML it was the first 120 lines of
// text a crawler read on the homepage - and aria-hidden does not take text out
// of a fetch. The jobs are the shared sample company (sample-company.ts).

const STATUS_BADGE: Record<Status, string> = {
  active: 'bg-success-tint text-success',
  planning: 'bg-info-tint text-info',
  on_hold: 'bg-warn-tint text-warn',
  completed: 'bg-muted text-muted-fg',
}
// The strip across the top of the card is the status, in the badge's colour -
// the same rule as the real card.
const STATUS_STRIP: Record<Status, string> = {
  active: 'bg-success-solid',
  planning: 'bg-info-solid',
  on_hold: 'bg-warn-solid',
  completed: 'bg-muted2',
}
// Dates are offsets from the month the page was built, so the picture never
// shows a job "starting" two years ago. A fixed month table and UTC: this
// renders on the server, which must not ask its own machine how to spell a date.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function monthFrom(offset: number, day: number): string {
  const now = new Date()
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, day))
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`
}

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard' },
  { icon: FolderKanban, label: 'Projects', on: true },
  { icon: Users, label: 'Customers' },
  { icon: BookUser, label: 'Directory' },
  { icon: Folder, label: 'Files' },
  { icon: Wrench, label: 'Equipment' },
  { icon: ShoppingCart, label: 'Materials' },
  { icon: CheckSquare, label: 'Approvals' },
]

export function ProjectsScreen() {
  const count = (s: Status) => PROJECTS.filter(p => p.status === s).length
  const stats = [
    { label: 'Total', value: PROJECTS.length, tone: 'text-ink', on: true },
    { label: 'Active', value: count('active'), tone: 'text-success' },
    { label: 'Planning', value: count('planning'), tone: 'text-info' },
    { label: 'On Hold', value: count('on_hold'), tone: 'text-warn' },
    { label: 'Completed', value: count('completed'), tone: 'text-muted-fg' },
  ]

  return (
    <div className="bg-panel text-left h-full overflow-hidden flex">
      {/* Sidebar */}
      <aside className="hidden lg:flex w-44 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-1.5 px-4 h-11 border-b border-line">
          <SyteNavLogo size={18} />
        </div>
        <nav className="p-2 space-y-0.5">
          {NAV.map(n => (
            <div key={n.label} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11px] ${n.on ? 'bg-accent text-accent-ink font-semibold' : 'text-ink-soft'}`}>
              <n.icon className="h-3.5 w-3.5" /> {n.label}
            </div>
          ))}
          <p className="px-2.5 pt-3 pb-1 text-[9px] font-semibold tracking-wider text-faint">MASTER</p>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-ink-soft"><CalendarDays className="h-3.5 w-3.5" /> Master Calendar</div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-ink-soft"><DollarSign className="h-3.5 w-3.5" /> Master Money</div>
        </nav>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col bg-surface">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-3 px-5 h-11 border-b border-line bg-panel shrink-0">
          <span className="text-[11px] text-muted-fg">Projects</span>
          <div className="hidden sm:flex items-center gap-1.5 w-72 rounded-md border border-line px-2 py-1 text-[10px] text-faint">
            <Search className="h-3 w-3" /> Search jobs, line items, receipts, people…
          </div>
          <div className="flex items-center gap-2">
            <Bell className="h-3.5 w-3.5 text-muted-fg" />
            <span className="h-5 w-5 rounded-full bg-muted" />
          </div>
        </div>

        <div className="p-5 flex-1 min-h-0 flex flex-col">
          {/* Page header */}
          <div className="flex items-start justify-between gap-3 mb-3 shrink-0">
            <div>
              <p className="text-base font-bold text-ink">Projects</p>
              <p className="text-[10px] text-muted-fg">Manage all your construction projects.</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-md bg-muted px-2.5 py-1 text-[10px] font-medium text-ink">Bulk Add</span>
              <span className="rounded-md bg-accent px-2.5 py-1 text-[10px] font-semibold text-accent-ink inline-flex items-center gap-1">
                <Plus className="h-3 w-3" /> New Project
              </span>
            </div>
          </div>

          {/* Stat boxes */}
          <div className="hidden sm:grid grid-cols-5 gap-2 mb-3 shrink-0">
            {stats.map(s => (
              <div key={s.label} className={`rounded-lg border bg-panel px-3 py-2 ${s.on ? 'border-accent' : 'border-line'}`}>
                <p className={`text-sm font-bold ${s.tone}`}>{s.value}</p>
                <p className="text-[9px] text-muted-fg">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 shrink-0">
            <div className="flex-1 flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-faint">
              <Search className="h-3 w-3" /> Search by name, address, or client…
            </div>
            {[[Building2, 'All Types'], [SlidersHorizontal, 'All Statuses'], [ArrowUpDown, 'Newest first']].map(([Icon, label]) => {
              const I = Icon as typeof Building2
              return (
                <span key={label as string} className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-line bg-panel px-2 py-1.5 text-[10px] text-ink">
                  <I className="h-3 w-3 text-faint" /> {label as string} <ChevronsUpDown className="h-2.5 w-2.5 text-faint" />
                </span>
              )
            })}
            <span className="hidden md:inline-flex items-center gap-0.5 rounded-md border border-line bg-panel p-0.5">
              <span className="rounded bg-accent p-1"><LayoutGrid className="h-2.5 w-2.5 text-accent-ink" /></span>
              <span className="p-1"><List className="h-2.5 w-2.5 text-faint" /></span>
              <span className="p-1"><MapIcon className="h-2.5 w-2.5 text-faint" /></span>
            </span>
          </div>

          <p className="text-[10px] text-muted-fg mb-2 shrink-0">{PROJECTS.length} projects</p>

          {/* Cards - the real card, smaller. Clips at the bottom like a real
              screen, so the hero monitor never shows empty glass. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 flex-1 min-h-0 overflow-hidden content-start auto-rows-max">
            {PROJECTS.map(p => {
              const pct = Math.round((p.done / p.tasks) * 100)
              return (
              <div key={p.name} className="rounded-lg border border-line bg-panel overflow-hidden">
                <div className={`h-1 ${STATUS_STRIP[p.status]}`} />
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink truncate">{p.name}</p>
                      <p className="text-[9px] text-faint">{p.type}</p>
                    </div>
                    <span className={`text-[9px] font-medium rounded-full px-1.5 py-0.5 shrink-0 ${STATUS_BADGE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-[10px] text-muted-fg">
                    <p className="flex items-center gap-1.5 min-w-0"><MapPin className="h-2.5 w-2.5 shrink-0 text-faint" /><span className="truncate">{p.address}</span></p>
                    <p className="flex items-center gap-1.5 min-w-0"><User className="h-2.5 w-2.5 shrink-0 text-faint" /><span className="truncate">{p.client}</span></p>
                    <p className="flex items-center gap-1.5" suppressHydrationWarning><Calendar className="h-2.5 w-2.5 shrink-0 text-faint" />{monthFrom(p.start, 11)} → {monthFrom(p.start + p.months, 19)}</p>
                  </div>
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[9px] mb-1">
                      <span className="text-muted-fg">Progress</span>
                      <span className="font-semibold text-ink-soft">{pct}%<span className="font-normal text-faint"> · {p.done}/{p.tasks} tasks</span></span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${pct === 100 ? 'bg-success-solid' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                    <div className="rounded-md bg-surface py-1"><p className="text-[8px] text-faint">Contract</p><p className="text-[10px] font-semibold text-ink-soft">{fmtMoney(p.contract)}</p></div>
                    <div className="rounded-md bg-success-tint py-1"><p className="text-[8px] text-success/70">Paid</p><p className="text-[10px] font-semibold text-success">{fmtMoney(p.paid)}</p></div>
                    <div className="rounded-md bg-warn-tint py-1"><p className="text-[8px] text-warn/70">Outstanding</p><p className="text-[10px] font-semibold text-warn">{fmtMoney(p.owed)}</p></div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-line-soft px-3 py-1.5">
                  <span className="text-[10px] font-medium text-accent-fg">Open →</span>
                  <span className="flex items-center gap-2 text-faint"><Pencil className="h-2.5 w-2.5" /><Trash2 className="h-2.5 w-2.5" /></span>
                </div>
              </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** The Projects screen as the website shows it: a picture, with alt text. */
export function ProjectsMock({ priority = false }: { priority?: boolean }) {
  return (
    <MockImage
      name="projects"
      alt="SyteNav projects dashboard showing active jobs, budgets and progress"
      fill
      priority={priority}
    />
  )
}

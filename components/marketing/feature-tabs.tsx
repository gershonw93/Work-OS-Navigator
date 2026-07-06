'use client'

import { useState, type ComponentType, type ReactNode } from 'react'
import Link from 'next/link'
import {
  ScanLine, Scale, Sparkles, Wallet, Banknote, Receipt, Send, GitPullRequest, BarChart2,
  CalendarDays, BookOpen, CheckSquare, Clock, Camera, ShieldCheck, Wrench, ClipboardCheck,
  UsersRound, FolderOpen, Users, Lock, ArrowRight, FileText, Check, ReceiptText,
} from 'lucide-react'
import { QuoteScanMock } from './quote-scan-mock'
import { MoneyMock } from './money-mock'
import { ScheduleMock } from './schedule-mock'

type Item = { icon: ComponentType<{ className?: string }>; title: string; body: string }

// Compact inline visuals for the tabs that don't have a big dedicated mock.
function ComplianceVisual() {
  const rows = [
    { icon: ShieldCheck, name: 'Building permit · Maple St', state: 'Approved', tone: 'bg-success-tint text-success' },
    { icon: ClipboardCheck, name: 'Rough inspection · Thu 9am', state: 'Scheduled', tone: 'bg-info-tint text-info' },
    { icon: ClipboardCheck, name: 'Final inspection · assigned to Sal', state: 'Requested', tone: 'bg-warn-tint text-warn' },
    { icon: FileText, name: 'GL insurance · Volt Bros', state: 'Expires 12d', tone: 'bg-warn-tint text-warn' },
    { icon: Wrench, name: 'RFI #14 · beam detail', state: 'Answered', tone: 'bg-success-tint text-success' },
    { icon: FileText, name: 'Submittal · window package', state: 'In review', tone: 'bg-info-tint text-info' },
  ]
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl">
      <p className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent-fg" /> Compliance · this week
      </p>
      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.name} className="flex items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface px-3 py-2.5">
            <span className="inline-flex items-center gap-2 text-xs text-ink-soft min-w-0">
              <r.icon className="h-3.5 w-3.5 text-muted-fg shrink-0" />
              <span className="truncate">{r.name}</span>
            </span>
            <span className={`text-[9px] font-semibold rounded-full px-2 py-0.5 shrink-0 ${r.tone}`}>{r.state}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-fg flex items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-success" /> Expiry reminders on, nothing slips through
      </p>
    </div>
  )
}

function TeamVisual() {
  const team = [
    { name: 'Garry W.', role: 'Owner / Admin', tone: 'bg-accent-tint text-accent-fg' },
    { name: 'Marcus T.', role: 'Project Manager', tone: 'bg-info-tint text-info' },
    { name: 'Dani R.', role: 'Field Supervisor', tone: 'bg-success-tint text-success' },
    { name: 'Sal P.', role: 'Office', tone: 'bg-warn-tint text-warn' },
    { name: 'Crew (×6)', role: 'Worker', tone: 'bg-muted text-muted-fg' },
  ]
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 sm:p-5 shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-ink inline-flex items-center gap-2">
          <Users className="h-4 w-4 text-accent-fg" /> Team
        </span>
        <span className="text-[11px] rounded-md bg-accent text-accent-ink font-semibold px-2 py-1">Invite</span>
      </div>
      <div className="divide-y divide-line-soft">
        {team.map(m => (
          <div key={m.name} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-bold ${m.tone}`}>{m.name.slice(0, 1)}</span>
              <span className="text-sm text-ink-soft truncate">{m.name}</span>
            </div>
            <span className="text-xs text-muted-fg shrink-0">{m.role}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg bg-surface border border-line-soft px-3 py-2 flex items-center gap-2 text-[11px] text-muted-fg">
        <Lock className="h-3.5 w-3.5 text-accent-fg" /> Each role sees exactly what it should, nothing more
      </div>
    </div>
  )
}

const TABS: { key: string; label: string; blurb: string; items: Item[]; visual: ReactNode }[] = [
  {
    key: 'ai',
    label: 'AI & documents',
    blurb: 'The paperwork does itself. Upload any document and SyteNav reads it into structured, usable data.',
    items: [
      { icon: ScanLine, title: 'AI quote scanning', body: 'PDF or phone photo in, sections, line items, quantities, and payment terms out.' },
      { icon: Scale, title: 'Bid comparison', body: 'Competing quotes side by side, with the gaps each one is hiding.' },
      { icon: FileText, title: 'Invoice & permit reading', body: 'Key fields pulled off invoices and permits automatically. No retyping.' },
      { icon: Sparkles, title: 'Smart recommendations', body: 'The best bid for your requirements, flagged before you award.' },
    ],
    visual: <QuoteScanMock />,
  },
  {
    key: 'money',
    label: 'Money',
    blurb: 'One honest picture of the money, from the first deposit to the last vendor payment.',
    items: [
      { icon: Wallet, title: 'Budgets & line items', body: 'Budgeted vs committed vs actual, or quote-driven line items for subs.' },
      { icon: Banknote, title: 'Client payments & escrow', body: 'Funds in, fee earned, escrow held, vendors owed. Always current.' },
      { icon: Receipt, title: 'Invoices & approvals', body: 'Create, route, and track invoices with the client-vs-escrow split built in.' },
      { icon: ReceiptText, title: 'Materials & receipts', body: 'Snap the receipt, AI reads it, and the cost rolls into the budget actuals.' },
      { icon: Send, title: 'RFQs out, bids in', body: 'Send plans to subs and collect bids on a private link. No account needed.' },
      { icon: GitPullRequest, title: 'Change orders', body: 'Scope changes captured and priced, so the budget stays honest.' },
      { icon: BarChart2, title: 'Financial reports', body: 'Job-level numbers and company-wide rollups, one click apart.' },
    ],
    visual: <MoneyMock />,
  },
  {
    key: 'field',
    label: 'The field',
    blurb: 'Built for phones with gloves on. The crew logs it once and the office sees it live.',
    items: [
      { icon: CalendarDays, title: 'Scheduling', body: 'Milestones, deliveries, and crew dates, with cross-job overlap warnings.' },
      { icon: BookOpen, title: 'Daily logs', body: 'Weather, crew counts, photos, and notes filed from the jobsite in minutes.' },
      { icon: CheckSquare, title: 'Tasks & progress', body: 'Progress tracked per line item, tasks assigned with priority and due dates.' },
      { icon: Clock, title: 'Time clock', body: 'Clock in and out with location, approve timesheets, export to payroll.' },
      { icon: Camera, title: 'Plans & photos', body: 'Drawings and site photos where the crew can actually find them.' },
    ],
    visual: <ScheduleMock />,
  },
  {
    key: 'compliance',
    label: 'Compliance & office',
    blurb: 'Permits, inspections, insurance, and paperwork, tracked so nothing expires quietly.',
    items: [
      { icon: ShieldCheck, title: 'Permits & inspections', body: 'Request an inspection, assign who books it, and get notified when it is scheduled and when it passes or fails.' },
      { icon: Wrench, title: 'Submittals & RFIs', body: 'Questions, answers, and approvals in one thread, not forty emails.' },
      { icon: ClipboardCheck, title: 'Insurance & licenses', body: 'COIs and licenses with expiry warnings, per sub and per job.' },
      { icon: UsersRound, title: 'Directory & customers', body: 'Subs, suppliers, and clients in one shared address book.' },
      { icon: FolderOpen, title: 'Files', body: 'Every document for every job, organized and searchable.' },
    ],
    visual: <ComplianceVisual />,
  },
  {
    key: 'team',
    label: 'Team & control',
    blurb: 'Everyone on the same page, and only the pages they should see.',
    items: [
      { icon: Users, title: 'Roles & permissions', body: 'Admin, PM, office, field, crew. Each role gets exactly the right access.' },
      { icon: CheckSquare, title: 'Assignments & approvals', body: 'Assign work, approve timesheets, invoices, and change orders.' },
      { icon: Lock, title: 'Delete protection', body: 'A secret key guards destructive actions on money and files.' },
      { icon: Clock, title: 'Works everywhere', body: 'Phone, tablet, or PC. Nothing to install, nothing to sync.' },
    ],
    visual: <TeamVisual />,
  },
]

// The home page feature explorer: one tab per product area, each with a
// borderless feature list and a product visual.
export function FeatureTabs() {
  const [active, setActive] = useState(0)
  const tab = TABS[active]

  return (
    <div>
      {/* Tabs */}
      <div className="flex flex-wrap justify-center gap-2 mb-10 sm:mb-12" role="tablist" aria-label="Product areas">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={i === active}
            onClick={() => setActive(i)}
            className={[
              'rounded-full px-4 py-2 text-sm font-semibold transition-colors border',
              i === active
                ? 'bg-ink text-surface border-ink'
                : 'bg-transparent text-muted-fg border-line hover:text-ink hover:border-muted2',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
        <div>
          <p className="text-lg text-ink-soft leading-relaxed mb-8">{tab.blurb}</p>
          <ul className="space-y-6">
            {tab.items.map(f => (
              <li key={f.title} className="flex items-start gap-4">
                <span className="h-10 w-10 rounded-xl bg-accent-tint flex items-center justify-center shrink-0">
                  <f.icon className="h-5 w-5 text-accent-fg" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-ink">{f.title}</h3>
                  <p className="text-sm text-muted-fg mt-1 leading-relaxed">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <Link href="/homepage/features" className="mt-8 inline-flex items-center gap-1.5 text-sm font-semibold text-accent-fg hover:gap-2.5 transition-all">
            Explore all features <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="min-w-0">{tab.visual}</div>
      </div>
    </div>
  )
}

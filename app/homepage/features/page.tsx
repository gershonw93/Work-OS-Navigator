import Link from 'next/link'
import type { Metadata } from 'next'
import {
  ArrowRight, FileText, CalendarDays, CheckSquare, Receipt, DollarSign, ShieldCheck,
  Wallet, Send, Camera, Clock, Users, BarChart2,
} from 'lucide-react'
import { BrowserMock } from '@/components/marketing/browser-mock'
import { DashboardMock } from '@/components/marketing/dashboard-mock'
import { ProjectsMock } from '@/components/marketing/projects-mock'

export const metadata: Metadata = { title: 'Features — SyteNav' }

const GROUPS = [
  {
    name: 'Money',
    items: [
      { icon: FileText, title: 'AI quote capture', body: 'Upload a quote PDF — AI reads it into sections, line items, quantities, and a payment schedule.' },
      { icon: Wallet, title: 'Budgets & line items', body: 'Track budgeted vs committed vs actual, or run line-item budgets straight from a quote.' },
      { icon: DollarSign, title: 'Payments & escrow', body: 'Client funds in, contractor fee, escrow balance, and outstanding to vendors — the full cash picture.' },
      { icon: Receipt, title: 'Invoices & approvals', body: 'Create and route invoices, split client vs escrow payments, and see what’s billed and paid.' },
      { icon: Send, title: 'Request & compare quotes', body: 'Send RFQs to subs, collect bids, and let AI compare them side by side before you award.' },
    ],
  },
  {
    name: 'Field',
    items: [
      { icon: CalendarDays, title: 'Scheduling', body: 'Plan the work and key dates — milestones, deliveries, and crew assignments.' },
      { icon: Camera, title: 'Daily logs', body: 'Capture weather, crew, photos, and notes from the jobsite on any phone.' },
      { icon: CheckSquare, title: 'Tasks & progress', body: 'Track progress per line item and spin off assignable tasks with priority and due dates.' },
      { icon: Clock, title: 'Time clock', body: 'Clock crew in and out with location, approve timesheets, export for payroll.' },
    ],
  },
  {
    name: 'Office & compliance',
    items: [
      { icon: ShieldCheck, title: 'Permits & compliance', body: 'Permits, inspections, and insurance docs in one place — with expiry reminders.' },
      { icon: Users, title: 'Team & roles', body: 'Role-based access for office, PMs, field supervisors, and crew. Invite in seconds.' },
      { icon: BarChart2, title: 'Master views', body: 'Calendar and money rolled up across every project for the boss’s-eye view.' },
    ],
  },
]

export default function FeaturesPage() {
  return (
    <>
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-10 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Features</p>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-ink max-w-3xl mx-auto leading-tight">One app from the first quote to the final payment</h1>
        <p className="mt-4 text-lg text-muted-fg max-w-2xl mx-auto">Built for the way contractors actually work — office and field, GC and sub.</p>
        <div className="mt-10 max-w-5xl mx-auto"><BrowserMock url="app.sytenav.com/projects"><div className="h-[460px] overflow-hidden"><ProjectsMock /></div></BrowserMock></div>
      </section>

      {GROUPS.map(g => (
        <section key={g.name} className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <h2 className="text-2xl font-bold text-ink mb-6">{g.name}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {g.items.map(f => (
              <div key={f.title} className="rounded-2xl border border-line bg-panel p-6">
                <div className="h-10 w-10 rounded-xl bg-accent-tint flex items-center justify-center mb-4"><f.icon className="h-5 w-5 text-accent-fg" /></div>
                <h3 className="font-bold text-ink">{f.title}</h3>
                <p className="text-sm text-muted-fg mt-1.5 leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="bg-panel border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h2 className="text-3xl font-bold text-ink">The boss’s-eye view</h2>
            <p className="mt-3 text-muted-fg">Every job, every dollar, one screen — then drill into any project for the detail.</p>
            <Link href="/signup" className="mt-6 inline-flex items-center gap-2 rounded-xl bg-accent text-accent-ink font-bold px-6 py-3 hover:bg-accent/90">Start free <ArrowRight className="h-4 w-4" /></Link>
          </div>
          <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
        </div>
      </section>
    </>
  )
}

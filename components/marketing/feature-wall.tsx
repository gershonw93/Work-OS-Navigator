import {
  FileText, ScanLine, Scale, Sparkles, Wallet, Banknote, Receipt, Send, GitPullRequest,
  BarChart2, CalendarDays, BookOpen, CheckSquare, Clock, Camera, ShieldCheck, Wrench,
  ClipboardCheck, UsersRound, FolderOpen, Users, Lock, Smartphone,
} from 'lucide-react'

const GROUPS: { group: string; items: { icon: any; title: string; body: string }[] }[] = [
  {
    group: 'AI that does the paperwork',
    items: [
      { icon: ScanLine, title: 'AI quote scan', body: 'Upload a quote PDF or photo — it reads sections, line items, quantities, and the payment schedule.' },
      { icon: Scale, title: 'AI compare quotes', body: 'Drop in competing bids and get a side-by-side breakdown with what each one is missing.' },
      { icon: FileText, title: 'AI permit & invoice reading', body: 'Pull key details off permits and invoices automatically — no manual entry.' },
      { icon: Sparkles, title: 'Smart recommendations', body: 'AI flags the best bid against your requirements and surfaces gaps before you award.' },
    ],
  },
  {
    group: 'Money',
    items: [
      { icon: Wallet, title: 'Budgets & line items', body: 'Budgeted vs committed vs actual — or quote-driven line items for subs.' },
      { icon: Banknote, title: 'Payments & escrow', body: 'Client funds in, contractor fee, escrow balance, and outstanding to vendors.' },
      { icon: Receipt, title: 'Invoices & approvals', body: 'Create, route, and track invoices — client-vs-escrow split included.' },
      { icon: Send, title: 'Request quotes (RFQ)', body: 'Send plans to subs, collect bids on a private link — no account needed.' },
      { icon: GitPullRequest, title: 'Change orders', body: 'Capture scope changes and keep the budget honest.' },
      { icon: BarChart2, title: 'Financials & reports', body: 'Job-level numbers and company-wide rollups at a glance.' },
    ],
  },
  {
    group: 'The field',
    items: [
      { icon: CalendarDays, title: 'Scheduling', body: 'Milestones, deliveries, and crew dates — built for the field.' },
      { icon: BookOpen, title: 'Daily logs', body: 'Weather, crew, photos, and notes captured from the jobsite.' },
      { icon: CheckSquare, title: 'Tasks & progress', body: 'Track progress per line item; spin off assignable tasks.' },
      { icon: Clock, title: 'Time clock', body: 'Clock crew in/out with location, approve, export to payroll.' },
      { icon: Camera, title: 'Plans & photos', body: 'Keep drawings and jobsite photos where the crew can find them.' },
    ],
  },
  {
    group: 'Compliance & office',
    items: [
      { icon: ShieldCheck, title: 'Permits & inspections', body: 'Track status and never miss an inspection.' },
      { icon: Wrench, title: 'Submittals & RFIs', body: 'Manage submittals, approvals, and questions in one thread.' },
      { icon: ClipboardCheck, title: 'Compliance & insurance', body: 'COIs and licenses with expiry reminders.' },
      { icon: UsersRound, title: 'Directory & customers', body: 'Your subs, suppliers, and clients in one address book.' },
      { icon: FolderOpen, title: 'Files', body: 'Every document for every job, searchable.' },
      { icon: Users, title: 'Team & roles', body: 'Granular role-based access for office, PMs, and crew.' },
      { icon: Lock, title: 'Delete protection', body: 'A secret key guards deleting money & files.' },
      { icon: Smartphone, title: 'Works on any device', body: 'Phone, tablet, or PC — nothing to install.' },
    ],
  },
]

// The full feature wall — grouped, responsive (1 col on mobile up to 4 on desktop).
export function FeatureWall({ heading = true }: { heading?: boolean }) {
  return (
    <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-16">
      {heading && (
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent-fg mb-2">Everything in the box</p>
          <h2 className="text-3xl sm:text-4xl font-bold text-ink">A ton of features — one app</h2>
          <p className="mt-3 text-muted-fg">From the AI that reads your quotes to the invoice that closes the job.</p>
        </div>
      )}
      <div className="space-y-10">
        {GROUPS.map(g => (
          <div key={g.group}>
            <h3 className="text-sm font-bold uppercase tracking-wide text-muted-fg mb-4">{g.group}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {g.items.map(f => (
                <div key={f.title} className="rounded-xl border border-line bg-panel p-4">
                  <div className="h-9 w-9 rounded-lg bg-accent-tint flex items-center justify-center mb-3"><f.icon className="h-4 w-4 text-accent-fg" /></div>
                  <h4 className="text-sm font-bold text-ink">{f.title}</h4>
                  <p className="text-xs text-muted-fg mt-1 leading-relaxed">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

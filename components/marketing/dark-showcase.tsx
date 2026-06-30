import { Moon, Check } from 'lucide-react'
import { BrowserMock } from './browser-mock'
import { DashboardMock } from './dashboard-mock'

// A section locked to dark mode (nested `.dark` makes the tokens resolve dark
// regardless of the visitor's theme) — shows the app looks great after dark.
export function DarkShowcase() {
  return (
    <section className="dark">
      <div className="bg-surface text-ink border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted-fg mb-4">
              <Moon className="h-3.5 w-3.5 text-accent-fg" /> Dark mode
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">Easy on the eyes — in the trailer or at 6am</h2>
            <p className="mt-3 text-muted-fg">Every screen has a built-in dark theme. One tap and the whole app — dashboard, quotes, logs, invoices — goes dark.</p>
            <ul className="mt-5 space-y-2.5">
              {['One-tap light / dark toggle', 'Consistent across the app and the field views', 'Saves your preference on every device'].map(t => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-soft"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>
          <BrowserMock url="app.sytenav.com/dashboard"><DashboardMock /></BrowserMock>
        </div>
      </div>
    </section>
  )
}

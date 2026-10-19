import Link from 'next/link'
import type { Metadata } from 'next'
import { supportMailto } from '@/lib/support-email'

// ─────────────────────────────────────────────────────────────────────────────
// Intuit's "Disconnect URL": where QuickBooks sends somebody who removes
// SyteNav from their Connected Apps over THERE. It needs no session - they
// arrive from Intuit, often signed out of SyteNav - and it says what happened
// to their data in both directions, because that is the question they have.
//
// The grant is already gone by the time anyone reads this. The next push or
// the morning refresh (cron/quickbooks-refresh) is told invalid_grant and the
// Settings card turns to "Reconnect QuickBooks" - nothing here has to write.
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: 'QuickBooks disconnected',
  robots: { index: false, follow: false },
}

export default function QuickBooksDisconnected() {
  return (
    <main className="min-h-dvh bg-surface px-6 py-16">
      <div className="mx-auto max-w-lg rounded-2xl border border-line bg-panel p-6">
        <h1 className="text-xl font-semibold text-ink">SyteNav is disconnected from QuickBooks</h1>
        <div className="mt-3 space-y-3 text-sm text-ink-soft">
          <p>SyteNav will not send anything more to your QuickBooks company.</p>
          <p>
            Nothing already in QuickBooks has been changed or deleted, and nothing in SyteNav has been
            removed - your jobs, invoices, bills and payments are all still there.
          </p>
          <p>
            To connect again, sign in to SyteNav and open Settings, then Integrations, and press
            Reconnect QuickBooks. Records you add in the meantime are sent across when you do.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/settings?tab=integrations"
            className="inline-flex items-center rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-ink">
            Open SyteNav settings
          </Link>
          <a href={supportMailto('QuickBooks disconnected')}
            className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink">
            Contact support
          </a>
        </div>
      </div>
    </main>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { Loader2, AlertTriangle, Printer } from 'lucide-react'
import { SyteNavLogo } from '@/components/ui/logo'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { ReportView } from '@/components/reports/report-view'
import type { ReportDoc } from '@/lib/report-builder'
import { formatDate } from '@/lib/dates'

interface Data {
  doc: ReportDoc
  message: string | null
  recipient_name: string | null
  from_person: string | null
  from_company: string | null
  from_logo: string | null
  sent_at: string
}

// What a developer, a sub or a supplier sees when a report is shared with
// them: the report as it read when it was sent, who sent it, and a way to save
// it as a PDF. No account, no sign-up - the link is the whole of it.
export default function SharedReportPage({ params }: { params: { token: string } }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/report-share/${params.token}`)
        const d = await res.json().catch(() => ({}))
        if (!res.ok) setError(d.error ?? 'This link is not valid.')
        else setData(d)
      } catch {
        setError('Could not reach the server. Check your connection and reload.')
      } finally {
        setLoading(false)
      }
    })()
  }, [params.token])

  return (
    <div className="min-h-dvh bg-surface print:bg-white">
      <header className="border-b border-line bg-panel print:hidden">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <SyteNavLogo size={24} />
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 print:max-w-none print:p-0">
        {loading ? (
          <p className="py-20 text-center text-sm text-faint"><Loader2 className="inline h-5 w-5 animate-spin" /></p>
        ) : error || !data ? (
          <div className="mx-auto max-w-lg rounded-2xl border border-danger/30 bg-danger-tint p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-danger" />
            <p className="font-semibold text-ink">{error || 'This link is not valid.'}</p>
            <p className="mt-1 text-sm text-muted-fg">Ask whoever sent it to share it again.</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="print:hidden flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-muted-fg">
                  Shared by {[data.from_person, data.from_company].filter(Boolean).join(', ') || 'your contractor'} on {formatDate(data.sent_at)}
                </p>
                {data.message && (
                  <p className="mt-2 whitespace-pre-line rounded-xl border border-line bg-panel px-4 py-3 text-sm text-ink">{data.message}</p>
                )}
              </div>
              <button
                onClick={() => window.print()}
                className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink"
              >
                <Printer className="h-4 w-4" /> Save as PDF / Print
              </button>
            </div>
            <div className="rounded-2xl border border-line bg-panel p-5 sm:p-6 print:border-0 print:p-0">
              <ReportView doc={data.doc} companyName={data.from_company} logoUrl={data.from_logo} />
            </div>
            <p className="print:hidden text-center text-xs text-faint">
              This is a copy of the report as it read when it was shared. It does not update.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}

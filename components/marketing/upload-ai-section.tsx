import { ScanLine, FileText, Camera, Smartphone, Check, Sparkles, ArrowRight } from 'lucide-react'

// Dark-colored section emphasizing easy upload + AI reading any document, on the go.
export function UploadAISection() {
  return (
    <section className="dark">
      <div className="bg-surface text-ink border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1 text-xs font-medium text-muted-fg mb-4">
              <Sparkles className="h-3.5 w-3.5 text-accent-fg" /> AI document scanning
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-ink leading-tight">Snap it, upload it — AI does the data entry</h2>
            <p className="mt-3 text-muted-fg">Take a photo on the jobsite or drop in a PDF. SyteNav reads quotes, invoices, permits, and plans into clean, structured data — line items, quantities, totals, and payment terms. No typing.</p>
            <ul className="mt-5 space-y-2.5">
              {[
                'Any document — quotes, invoices, permits, plans',
                'Reads sections, line items, quantities & payment terms',
                'Works from your phone, right on the jobsite',
                'PDF or photo — upload in seconds',
              ].map(t => (
                <li key={t} className="flex items-start gap-2 text-sm text-ink-soft"><Check className="h-4 w-4 text-success mt-0.5 shrink-0" /> {t}</li>
              ))}
            </ul>
          </div>

          {/* Upload → AI → structured result visual */}
          <div className="rounded-2xl border border-line bg-panel p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <span className="inline-flex items-center gap-2 text-sm text-ink-soft"><FileText className="h-4 w-4 text-accent-fg" /> electrical_proposal.pdf</span>
              <span className="inline-flex items-center gap-1 text-xs text-success"><ScanLine className="h-3.5 w-3.5" /> Scanned</span>
            </div>
            <div className="space-y-2">
              {[['New receptacle & switch points', '24 × $185', '$4,440'], ['GFCI devices', '6 × $145', '$870'], ['Recessed LED rough-in', '18 × $155', '$2,790'], ['Dedicated 20A circuits', '3 × $575', '$1,725']].map(r => (
                <div key={r[0]} className="flex items-center justify-between rounded-lg border border-line-soft bg-surface px-3 py-2">
                  <div className="min-w-0"><p className="text-xs text-ink-soft truncate">{r[0]}</p><p className="text-[10px] text-faint">{r[1]}</p></div>
                  <span className="text-xs font-semibold text-ink shrink-0">{r[2]}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-accent-tint/50 border border-accent/30 px-3 py-2 text-xs">
              <span className="text-accent-fg font-semibold inline-flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Payment schedule extracted</span>
              <span className="text-ink-soft font-bold">5 stages</span>
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-muted-fg">
              <Camera className="h-3.5 w-3.5" /> Photo
              <span className="text-faint">·</span>
              <FileText className="h-3.5 w-3.5" /> PDF
              <span className="text-faint">·</span>
              <Smartphone className="h-3.5 w-3.5" /> On the go
              <ArrowRight className="h-3.5 w-3.5 ml-auto text-accent-fg" />
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

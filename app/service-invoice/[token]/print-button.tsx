'use client'

import { Printer } from 'lucide-react'

/** Print or save the invoice as a PDF - the browser's own dialog. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} aria-label="Print or save as PDF" title="Print or save as PDF"
      className="print:hidden inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-line bg-panel px-3 text-sm font-medium text-ink hover:bg-surface">
      <Printer className="h-4 w-4" /> Print
    </button>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { InvoiceEditor } from '@/components/service-calls/invoice-editor'
import { useScreenAccess, ScreenAccessNotice } from '@/components/ui/screen-access'
import { callFetch } from '@/lib/service-calls-client'

// The invoice for one call. It asks the call's route which invoice that is -
// the live one, never a void - and shows the editor; a call with none yet
// sends you back to the call, where "Bill this call" starts one.
export default function CallInvoicePage({ params }: { params: { callId: string } }) {
  const { access } = useScreenAccess('service-billing')
  const [state, setState] = useState<'loading' | 'failed' | 'none' | 'ready'>('loading')
  const [invoiceId, setInvoiceId] = useState<string | null>(null)

  useEffect(() => {
    if (access !== 'yes') return
    let live = true
    ;(async () => {
      try {
        const res = await callFetch(`/api/service-calls/${params.callId}/invoice`)
        const json = await res.json().catch(() => ({}))
        if (!live) return
        if (!res.ok) { setState('failed'); return }
        if (!json.invoice) { setState('none'); return }
        setInvoiceId(json.invoice.id)
        setState('ready')
      } catch {
        if (live) setState('failed')
      }
    })()
    return () => { live = false }
  }, [access, params.callId])

  if (access !== 'yes') return <ScreenAccessNotice access={access} what="billing" />

  return (
    <div className="p-6 space-y-4">
      <Link href={`/service-calls/${params.callId}`} className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Back to the call
      </Link>
      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>Could not load the invoice for this call. Nothing was changed.</p>
          <Button variant="outline" onClick={() => window.location.reload()}>Try again</Button>
        </div>
      )}
      {state === 'none' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink">
          <p>This call has not been billed yet. Open the call and press Bill this call.</p>
        </div>
      )}
      {state === 'ready' && invoiceId && <InvoiceEditor invoiceId={invoiceId} callId={params.callId} />}
    </div>
  )
}

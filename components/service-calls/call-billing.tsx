'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useNotice } from '@/components/ui/notice'
import { usePermissions } from '@/lib/use-permissions'
import { callFetch } from '@/lib/service-calls-client'
import { fetchProblem } from '@/lib/fetch-error'
import { BILL_STATUS_LABEL, usd, type BillStatus } from '@/lib/service-billing'

// THE CALL'S BILL, on the call page: "Bill this call" once it is Done, and
// after that the invoice's number, where it stands and what is owed. Shown
// only to somebody who holds `service-billing` - crew work a call and do not
// see what it was billed at (the routes refuse them too).
export function CallBilling({ callId, status }: { callId: string; status: string }) {
  const { can, loading } = usePermissions()
  const router = useRouter()
  const notice = useNotice()
  const allowed = !loading && can('service-billing', 'view')
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [inv, setInv] = useState<any>(null)
  const [settlement, setSettlement] = useState<any>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await callFetch(`/api/service-calls/${callId}/invoice`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState('failed'); return }
      setInv(json.invoice ?? null)
      setSettlement(json.settlement ?? null)
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [callId])
  useEffect(() => { if (allowed) load() }, [allowed, load])

  if (!allowed) return null

  async function start() {
    setBusy(true)
    try {
      const d = new Date()
      const issue_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const res = await callFetch(`/api/service-calls/${callId}/invoice`, { method: 'POST', body: JSON.stringify({ issue_date }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'Could not start the invoice. Try again.'); return }
      router.push(`/service-calls/${callId}/invoice`)
    } catch (e) {
      notice(fetchProblem(e, 'starting the invoice'))
    } finally {
      setBusy(false)
    }
  }

  const billable = status === 'done' || status === 'invoiced'
  return (
    <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Receipt className="h-4 w-4 text-faint" aria-hidden />
        <p className="text-sm font-semibold text-ink">Billing</p>
      </div>
      {state === 'loading' && <p className="text-sm text-faint">Loading...</p>}
      {state === 'failed' && <p className="text-sm text-muted-fg">Could not load the invoice. Reload to try again.</p>}
      {state === 'ready' && !inv && (
        billable ? (
          <>
            <p className="text-sm text-muted-fg">Not billed yet.</p>
            {can('service-billing', 'create') && (
              <Button onClick={start} disabled={busy}>{busy ? 'Starting...' : 'Bill this call'}</Button>
            )}
          </>
        ) : <p className="text-sm text-muted-fg">You can bill the customer once the call is Done.</p>
      )}
      {state === 'ready' && inv && (
        <>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink">{inv.invoice_number}</span>
            <Badge variant={inv.status === 'paid' ? 'success' : inv.status === 'sent' ? 'info' : 'muted'}>
              {inv.status === 'sent' && settlement?.state === 'partly_paid' ? 'Partly paid' : BILL_STATUS_LABEL[inv.status as BillStatus]}
            </Badge>
          </div>
          {settlement && inv.status !== 'draft' && (
            <p className="text-sm text-muted-fg">{usd(settlement.total)} - {settlement.balance > 0 ? `${usd(settlement.balance)} owed` : 'paid in full'}</p>
          )}
          <Link href={`/service-calls/${callId}/invoice`}
            className="inline-flex h-11 lg:h-9 w-full items-center justify-center rounded-md border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft hover:bg-surface">
            {inv.status === 'draft' ? 'Finish the invoice' : 'Open invoice'}
          </Link>
        </>
      )}
    </div>
  )
}

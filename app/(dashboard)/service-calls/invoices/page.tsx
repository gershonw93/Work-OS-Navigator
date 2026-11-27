'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, Receipt, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useScreenAccess, ScreenAccessNotice } from '@/components/ui/screen-access'
import { callFetch } from '@/lib/service-calls-client'
import { BILL_STATUS_LABEL, usd, type BillStatus } from '@/lib/service-billing'
import { callLabel } from '@/lib/service-calls'
import { formatDate, toDateInput } from '@/lib/dates'
import { cn } from '@/lib/utils'

// WHO OWES ME. Every service call invoice, the open ones first, with what is
// left on each and the total outstanding at the top. A row opens the call's
// invoice. A failed read says so - an empty list here is a claim that nobody
// owes anything.

type Row = {
  id: string; call_id: string | null; call_number: number | null; customer_name: string; invoice_number: string
  status: BillStatus; issue_date: string; due_date: string | null
  settlement: { total: number; paid: number; balance: number; state: string }
}
type Filter = 'owed' | 'drafts' | 'paid' | 'all'
const FILTERS: { key: Filter; label: string; test: (r: Row) => boolean }[] = [
  { key: 'owed', label: 'Owed', test: r => r.status === 'sent' },
  { key: 'drafts', label: 'Drafts', test: r => r.status === 'draft' },
  { key: 'paid', label: 'Paid', test: r => r.status === 'paid' },
  { key: 'all', label: 'All', test: () => true },
]

export default function ServiceInvoicesPage() {
  const { access, perms } = useScreenAccess('service-billing')
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState<Filter>('owed')

  const load = useCallback(async () => {
    try {
      const res = await callFetch('/api/service-invoices')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState('failed'); return }
      setRows(json.invoices ?? [])
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])
  useEffect(() => { if (access === 'yes') load() }, [load, access])

  if (access !== 'yes') return <ScreenAccessNotice access={access} what="billing" />

  // The READER's day - a UTC date makes an invoice due today read overdue in the evening.
  const today = toDateInput(new Date())
  const owed = rows.filter(r => r.status === 'sent').reduce((s, r) => s + r.settlement.balance, 0)
  const overdue = rows.filter(r => r.status === 'sent' && r.due_date && r.due_date < today)
  const shown = rows.filter(FILTERS.find(f => f.key === filter)!.test)

  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Invoices</h1>
          <p className="mt-1 text-sm text-muted-fg">What your service customers owe, and what they have paid.</p>
        </div>
        <div className="row-even sm:flex gap-2">
          <Link href="/service-calls" className="inline-flex h-11 lg:h-9 items-center justify-center rounded-md border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft whitespace-nowrap hover:bg-surface">Service calls</Link>
          {perms.can('service-billing', 'edit') && (
            <Link href="/service-calls/prices" className="inline-flex h-11 lg:h-9 items-center justify-center gap-2 rounded-md border border-muted2 bg-panel px-4 text-sm font-medium text-ink-soft whitespace-nowrap hover:bg-surface">
              <Tags className="h-4 w-4" /> Price list
            </Link>
          )}
        </div>
      </div>

      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>Could not load your invoices. They are unchanged - this screen just could not read them.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}

      {state === 'ready' && (
        <>
          <div className="rounded-2xl border border-line bg-panel p-5 flex flex-wrap items-baseline gap-x-8 gap-y-2">
            <div>
              <p className="text-xs text-muted-fg">Owed to you</p>
              <p className="text-2xl font-bold text-ink">{usd(owed)}</p>
            </div>
            <p className={cn('text-sm', overdue.length ? 'font-medium text-danger' : 'text-muted-fg')}>
              {overdue.length ? `${overdue.length} overdue` : 'Nothing overdue'}
            </p>
          </div>

          <div className="scroll-fade flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(f => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                className={cn('shrink-0 inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium',
                  filter === f.key ? 'bg-ink border-ink text-panel' : 'bg-panel border-line text-muted-fg hover:text-ink-soft')}>
                {f.label}
                <span className={cn('rounded-full whitespace-nowrap px-1.5 text-xs', filter === f.key ? 'bg-panel/20' : 'bg-muted')}>{rows.filter(f.test).length}</span>
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <div className="rounded-2xl border border-line bg-panel p-10 text-center space-y-2">
              <Receipt className="h-8 w-8 text-faint mx-auto" aria-hidden />
              <p className="text-sm font-semibold text-ink">{rows.length ? 'Nothing here right now' : 'No invoices yet'}</p>
              <p className="text-sm text-muted-fg">{rows.length ? 'Pick another filter above.' : 'Open a call that is Done and press Bill this call.'}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
              {shown.map(r => {
                const late = r.status === 'sent' && r.due_date && r.due_date < today
                const href = r.call_id ? `/service-calls/${r.call_id}/invoice` : '#'
                return (
                  <Link key={r.id} href={href} className="flex items-center gap-4 px-4 py-3.5 hover:bg-surface transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="truncate text-sm font-semibold text-ink">{r.customer_name}</span>
                        {late && <span className="text-xs font-semibold text-danger whitespace-nowrap">Overdue</span>}
                      </div>
                      <p className="truncate text-xs text-muted-fg">
                        {r.invoice_number}{r.call_number ? ` - ${callLabel(r.call_number)}` : ''} - {formatDate(r.issue_date)}{r.due_date ? `, due ${formatDate(r.due_date)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-sm font-semibold text-ink">{usd(r.status === 'sent' ? r.settlement.balance : r.settlement.total)}</span>
                      <Badge variant={r.status === 'paid' ? 'success' : r.status === 'sent' ? 'info' : r.status === 'void' ? 'danger' : 'muted'}>
                        {r.status === 'sent' && r.settlement.state === 'partly_paid' ? 'Partly paid' : BILL_STATUS_LABEL[r.status]}
                      </Badge>
                    </div>
                    <ChevronRight className="h-4 w-4 text-faint shrink-0" aria-hidden />
                  </Link>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

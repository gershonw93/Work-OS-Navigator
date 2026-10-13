'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { RowMenu, MenuItem } from '@/components/ui/row-menu'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useNotice } from '@/components/ui/notice'
import { fetchProblem } from '@/lib/fetch-error'
import { todayDateInput, formatDate } from '@/lib/dates'
import { cents, dollars, type OpenInvoice } from '@/lib/invoice-settlement'
import { splitProblem, evenSplit, type HouseShareInput } from '@/lib/development-payment'
import { X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// One cheque, split across a development's houses - against each house's
// invoices, as an amount against no invoice (a deposit or a draw), or both.
// Rules: lib/development-payment.ts. Route: /api/projects/[id]/development-payments.
// ─────────────────────────────────────────────────────────────────────────────

const METHODS = ['Check', 'QuickPay', 'Wire', 'ACH', 'Cash', 'CC', 'Other']

interface House { id: string; name: string; lot: string | null; invoices: { id: string; invoice_number: string; balance: number }[] }
export interface PaymentGroup {
  id: string; amount: number | string; paid_date: string | null; method: string | null; reference: string | null
  memo: string | null; in_quickbooks: boolean; houses: string[]
}

async function call(url: string, init: RequestInit = {}) {
  const { data: { session } } = await createClient().auth.getSession()
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}`, ...(init.headers ?? {}) },
  })
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as any }
}

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** The cheques already split across this development's houses, each deletable as a whole. */
export function DevelopmentPayments({ developmentId, canEdit, reloadKey, onChanged }: {
  developmentId: string; canEdit: boolean; reloadKey: number; onChanged: () => void
}) {
  const [groups, setGroups] = useState<PaymentGroup[] | null>(null)
  const guard = useDeleteGuard()
  const notify = useNotice()
  useEffect(() => {
    let live = true
    call(`/api/projects/${developmentId}/development-payments`).then(r => { if (live && r.ok) setGroups(r.data.groups ?? []) }).catch(() => {})
    return () => { live = false }
  }, [developmentId, reloadKey])

  if (!groups?.length) return null
  return (
    <div className="rounded-2xl border border-line bg-panel lg:rounded-xl">
      <h2 className="px-4 pt-3 text-sm font-bold text-ink">Checks split across houses</h2>
      <div className="divide-y divide-line-soft">
        {groups.map(g => (
          <div key={g.id} className="flex items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-ink">
                <span className="font-semibold">{money(Number(g.amount))}</span>
                {g.reference ? ` · ${g.method ?? 'Check'} ${g.reference}` : g.method ? ` · ${g.method}` : ''}
                {g.paid_date ? ` · ${formatDate(g.paid_date)}` : ''}
              </p>
              <p className="truncate text-xs text-muted-fg">
                {g.houses.length} {g.houses.length === 1 ? 'house' : 'houses'}: {g.houses.join(', ')}{g.in_quickbooks ? ' · in QuickBooks' : ''}
              </p>
            </div>
            {canEdit && (
              <RowMenu label={`More for the ${money(Number(g.amount))} check`}>
                {close => (
                  <MenuItem danger onClick={() => {
                    close()
                    guard(async () => {
                      const r = await call(`/api/projects/${developmentId}/development-payments/${g.id}`, { method: 'DELETE' })
                      if (!r.ok) { notify(r.data.error ?? 'Could not delete the payment.'); return }
                      if (r.data.was_in_quickbooks) notify('Deleted here. It was already in QuickBooks - delete it there too, or the money is counted twice.')
                      onChanged()
                    }, {
                      title: 'Delete this check?',
                      body: `Its share comes off all ${g.houses.length} houses, and any invoice it paid goes back to owing that amount.`,
                      confirmLabel: 'Delete check',
                    })
                  }}>Delete check</MenuItem>
                )}
              </RowMenu>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface ShareState { invoices: Record<string, string>; other: string }

/** Record one check across houses. */
export function DevelopmentPaymentDialog({ developmentId, onClose, onSaved }: {
  developmentId: string; onClose: () => void; onSaved: (said: string) => void
}) {
  const [houses, setHouses] = useState<House[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [amount, setAmount] = useState('')
  const [paidDate, setPaidDate] = useState(todayDateInput())
  const [method, setMethod] = useState('Check')
  const [reference, setReference] = useState('')
  const [memo, setMemo] = useState('')
  const [shares, setShares] = useState<Record<string, ShareState>>({})
  const [onlyOwing, setOnlyOwing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await call(`/api/projects/${developmentId}/development-payments`)
      if (!r.ok) { setState('failed'); setError(r.data.error ?? null); return }
      setHouses(r.data.houses ?? [])
      setState('ready')
    } catch { setState('failed') }
  }, [developmentId])
  useEffect(() => { load() }, [load])

  const share = (id: string): ShareState => shares[id] ?? { invoices: {}, other: '' }
  const setShare = (id: string, next: ShareState) => setShares(prev => ({ ...prev, [id]: next }))

  // The same question the route asks, answered as you type.
  const byHouse = useMemo(() => new Map<string, OpenInvoice[]>(houses.map(h => [h.id, h.invoices.map(i => ({
    id: i.id, invoice_number: i.invoice_number, status: 'sent', balanceCents: cents(i.balance),
  }))])), [houses])
  const inputs: HouseShareInput[] = houses.map(h => ({
    project_id: h.id,
    invoices: Object.entries(share(h.id).invoices).map(([client_invoice_id, a]) => ({ client_invoice_id, amount: a.replace(/[$,\s]/g, '') })),
    other: share(h.id).other.replace(/[$,\s]/g, ''),
  })).filter(s => (s.invoices ?? []).some(a => cents(a.amount) !== 0) || cents(s.other) !== 0)
  const placedCents = inputs.reduce((t, s) => t + (s.invoices ?? []).reduce((u, a) => u + cents(a.amount), 0) + cents(s.other), 0)
  const totalCents = cents(amount.replace(/[$,\s]/g, ''))
  const name = (id: string) => houses.find(h => h.id === id)?.name ?? 'A house'

  function divideEvenly() {
    const ids = (onlyOwing ? houses.filter(h => h.invoices.length) : houses).map(h => h.id)
    const parts = evenSplit(amount.replace(/[$,\s]/g, ''), ids)
    if (!parts.size) { setError('Enter the check amount first, then divide it.'); return }
    setError(null)
    setShares(Object.fromEntries(ids.map(id => [id, { invoices: {}, other: String(dollars(parts.get(id)!)) }])))
  }

  async function save() {
    setError(null)
    const problem = splitProblem(amount.replace(/[$,\s]/g, ''), inputs, byHouse, name)
    if (problem) { setError(problem); return }
    if (!paidDate) { setError('Enter the date the check was received.'); return }
    setBusy(true)
    try {
      const r = await call(`/api/projects/${developmentId}/development-payments`, {
        method: 'POST',
        body: JSON.stringify({ amount: amount.replace(/[$,\s]/g, ''), paid_date: paidDate, method, reference, memo, shares: inputs }),
      })
      if (!r.ok) { setError(r.data.error ?? 'Could not record the payment.'); return }
      const qb = r.data.quickbooks === 'pushed' ? ' Sent to QuickBooks.'
        : r.data.quickbooks === 'skipped' && r.data.quickbooks_detail ? ` QuickBooks: ${r.data.quickbooks_detail} - it goes across once that is fixed.`
        : r.data.quickbooks === 'failed' ? ` QuickBooks did not take it (${r.data.quickbooks_detail ?? 'unknown'}) - it is in the sync backlog on Settings → QuickBooks.`
        : ''
      onSaved(`Recorded on ${r.data.houses} ${r.data.houses === 1 ? 'house' : 'houses'}.${qb}`)
    } catch (e) {
      // Not knowing is not failing: reload before trying again, or it is recorded twice.
      setError(fetchProblem(e, 'recording the payment'))
    } finally { setBusy(false) }
  }

  const shown = onlyOwing ? houses.filter(h => h.invoices.length) : houses
  const left = totalCents - placedCents

  return (
    <div className="overlay items-center justify-center bg-black/50" data-overlay onClick={() => !busy && onClose()}>
      <div className="flex w-full max-w-2xl flex-col rounded-xl bg-panel shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="min-w-0 truncate text-base font-semibold text-ink">Record a payment across houses</h2>
          <button onClick={onClose} aria-label="Close" title="Close" className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="dp-amount">Check amount *</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-fg">$</span>
                <Input id="dp-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" className="min-w-0 flex-1" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-date">Date received *</Label>
              <Input id="dp-date" type="date" value={paidDate} onChange={e => setPaidDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-method">Method *</Label>
              <Select id="dp-method" value={method} onChange={e => setMethod(e.target.value)}>
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-ref">Check # / reference <span className="font-normal text-faint">(optional)</span></Label>
              <Input id="dp-ref" value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. 10452" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-memo">Memo <span className="font-normal text-faint">(optional)</span></Label>
            <Input id="dp-memo" value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. Draw 3" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>Where it goes *</Label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-fg">
                <input type="checkbox" className="h-4 w-4 accent-[#C9F24A]" checked={onlyOwing} onChange={e => setOnlyOwing(e.target.checked)} />
                Only houses with open invoices
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={divideEvenly}>Divide evenly</Button>
            </div>
          </div>
          {state === 'loading' && <p className="text-sm text-faint">Loading the houses…</p>}
          {state === 'failed' && <p className="text-sm text-danger">{error ?? 'Could not load the houses. Reload and try again.'}</p>}
          {state === 'ready' && shown.length === 0 && <p className="text-sm text-muted-fg">No houses to show.</p>}
          {state === 'ready' && shown.length > 0 && (
            <div className="divide-y divide-line-soft rounded-lg border border-line">
              {shown.map(h => {
                const s = share(h.id)
                return (
                  <div key={h.id} className="space-y-2 px-3 py-2.5">
                    <p className="truncate text-sm font-semibold text-ink">{h.name}</p>
                    {h.invoices.map(inv => {
                      const ticked = s.invoices[inv.id] !== undefined
                      return (
                        <div key={inv.id} className="flex items-center gap-2">
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm text-ink-soft">
                            <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#C9F24A]" checked={ticked}
                              onChange={e => {
                                const next = { ...s.invoices }
                                if (e.target.checked) next[inv.id] = String(inv.balance); else delete next[inv.id]
                                setShare(h.id, { ...s, invoices: next })
                              }} />
                            <span className="truncate">{inv.invoice_number} <span className="text-faint">· owes {money(inv.balance)}</span></span>
                          </label>
                          {ticked && (
                            <Input aria-label={`Amount for ${inv.invoice_number}`} inputMode="decimal" className="w-28 shrink-0"
                              value={s.invoices[inv.id]} onChange={e => setShare(h.id, { ...s, invoices: { ...s.invoices, [inv.id]: e.target.value } })} />
                          )}
                        </div>
                      )
                    })}
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 text-sm text-muted-fg">{h.invoices.length ? 'Not on an invoice' : 'Amount'} <span className="text-faint">(deposit, draw)</span></span>
                      <Input aria-label={`Amount for ${h.name} not on an invoice`} inputMode="decimal" className="w-28 shrink-0" placeholder="0"
                        value={s.other} onChange={e => setShare(h.id, { ...s, other: e.target.value })} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {state === 'ready' && error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <div className="space-y-2 border-t border-line-soft px-5 py-3">
          <p className={left === 0 && totalCents > 0 ? 'text-sm text-success' : 'text-sm text-muted-fg'}>
            Placed {money(dollars(placedCents))} of {money(dollars(totalCents))}
            {totalCents > 0 && left !== 0 ? (left > 0 ? ` · ${money(dollars(left))} left to place` : ` · ${money(dollars(-left))} too much`) : ''}
          </p>
          <div className="row-even lg:flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Record payment'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

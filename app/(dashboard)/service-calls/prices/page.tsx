'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useNotice } from '@/components/ui/notice'
import { useDeleteGuard } from '@/components/ui/delete-guard'
import { useScreenAccess, ScreenAccessNotice } from '@/components/ui/screen-access'
import { callFetch } from '@/lib/service-calls-client'
import { fetchProblem } from '@/lib/fetch-error'
import { priceItemProblem, usd, UNITS, UNIT_LABEL, type Unit } from '@/lib/service-billing'

// THE PRICE LIST: what a company charges for the things it does often, so an
// invoice line is picked rather than typed. A line COPIES the name and price
// when it is picked, so changing or removing an item here never changes an
// invoice already written - and "remove" retires an item rather than deleting
// it, for the same reason.

type Item = { id: string; name: string; unit: Unit; unit_price: number | string }

export default function PriceListPage() {
  const { access, perms } = useScreenAccess('service-billing')
  const notice = useNotice()
  const guard = useDeleteGuard()
  const canEdit = perms.can('service-billing', 'edit')
  const [state, setState] = useState<'loading' | 'failed' | 'ready'>('loading')
  const [items, setItems] = useState<Item[]>([])
  const [draft, setDraft] = useState({ name: '', unit: 'each' as Unit, unit_price: '' })
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await callFetch('/api/service-prices')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setState('failed'); return }
      setItems(json.items ?? [])
      setState('ready')
    } catch {
      setState('failed')
    }
  }, [])
  useEffect(() => { if (access === 'yes') load() }, [load, access])

  async function send(url: string, init: RequestInit, done: string) {
    setBusy(true)
    try {
      const res = await callFetch(url, init)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { notice(json.error ?? 'That did not save. Try again.'); return false }
      notice(done, { tone: 'success' })
      return true
    } catch (e) {
      notice(fetchProblem(e, 'saving the price list'))
      return false
    } finally {
      setBusy(false)
      load()
    }
  }

  if (access !== 'yes') return <ScreenAccessNotice access={access} what="the price list" />

  return (
    <div className="p-6 space-y-5 max-w-3xl">
      <Link href="/service-calls/invoices" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Invoices
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Price list</h1>
        <p className="mt-1 text-sm text-muted-fg">What you charge for the things you do often. Pick them onto an invoice instead of typing them.</p>
      </div>

      {canEdit && (
        <div className="rounded-2xl border border-line bg-panel p-4 space-y-3">
          <p className="text-sm font-semibold text-ink">Add an item</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_140px]">
            <div className="space-y-1.5">
              <Label htmlFor="pi-name">Name *</Label>
              <Input id="pi-name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Service call fee" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pi-unit">Charged *</Label>
              <select id="pi-unit" value={draft.unit} onChange={e => setDraft(d => ({ ...d, unit: e.target.value as Unit }))}
                className="h-11 lg:h-9 w-full rounded-md border border-line bg-panel px-2 text-sm text-ink">
                {UNITS.map(u => <option key={u} value={u}>{u === 'each' ? 'Each' : 'Per hour'}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pi-price">Price ($) *</Label>
              <Input id="pi-price" inputMode="decimal" value={draft.unit_price} onChange={e => setDraft(d => ({ ...d, unit_price: e.target.value }))} placeholder="95.00" />
            </div>
          </div>
          {problem && <p className="text-sm text-danger">{problem}</p>}
          <div className="row-even lg:flex lg:justify-end gap-2">
            <Button disabled={busy} onClick={async () => {
              const why = priceItemProblem(draft)
              if (why) { setProblem(why); return }
              setProblem('')
              if (await send('/api/service-prices', { method: 'POST', body: JSON.stringify({ ...draft, unit_price: draft.unit_price || 0 }) }, 'Added to the price list.')) {
                setDraft({ name: '', unit: 'each', unit_price: '' })
              }
            }}><Plus className="h-4 w-4" /> Add item</Button>
          </div>
        </div>
      )}

      {state === 'loading' && <p className="text-sm text-faint py-12 text-center">Loading...</p>}
      {state === 'failed' && (
        <div className="rounded-2xl border border-line bg-panel p-6 text-sm text-ink space-y-3">
          <p>Could not load the price list. Nothing was changed.</p>
          <Button variant="outline" onClick={() => { setState('loading'); load() }}>Try again</Button>
        </div>
      )}
      {state === 'ready' && (
        items.length ? (
          <div className="rounded-2xl border border-line bg-panel divide-y divide-line-soft">
            {items.map(it => (
              <div key={it.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                  <p className="text-xs text-muted-fg">{usd(it.unit_price)} {UNIT_LABEL[it.unit]}</p>
                </div>
                {canEdit && (
                  <button type="button" aria-label={`Remove ${it.name}`} title="Remove from the price list" disabled={busy}
                    onClick={() => guard(() => { send(`/api/service-prices/${it.id}`, { method: 'DELETE' }, 'Removed from the price list.') }, {
                      label: it.name, title: `Remove ${it.name}?`, body: 'It leaves the price list. Invoices that already have it are not changed.', confirmLabel: 'Remove',
                    })}
                    className="h-11 w-11 lg:h-9 lg:w-9 shrink-0 flex items-center justify-center rounded-md text-faint hover:bg-surface hover:text-danger">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-line bg-panel p-8 text-center text-sm text-muted-fg">
            Nothing on your price list yet.{canEdit ? ' Add your service call fee and your hourly rate to start.' : ''}
          </div>
        )
      )}
    </div>
  )
}

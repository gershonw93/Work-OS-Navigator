'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressFields } from '@/components/ui/address-fields'
import { cn } from '@/lib/utils'
import { X, Building2, Layers, Milestone } from 'lucide-react'

type Mode = 'unit' | 'floor' | 'street'

const MODES: { key: Mode; label: string; hint: string; icon: typeof Building2 }[] = [
  { key: 'unit', label: 'Units', hint: 'One building, a job per unit', icon: Building2 },
  { key: 'floor', label: 'Floors', hint: 'One building, a job per floor', icon: Layers },
  { key: 'street', label: 'Street numbers', hint: 'A run of houses on one street', icon: Milestone },
]

/**
 * Create a batch of related projects.
 *
 * Everything created here is grouped under a site (the building or the street),
 * so the projects list shows one row instead of forty. The address is captured
 * properly - picked from autocomplete for a building, or built per house for a
 * street - because an address with "Unit 3" glued onto it can't be geocoded and
 * the job never reaches the map.
 */
export function BulkAddModal({
  token, customer, defaultClient, onClose, onSuccess,
}: {
  token: string
  customer?: { id: string; name: string } | null
  defaultClient?: string
  onClose: () => void
  onSuccess: (result: { count: number; located: number; siteId?: string | null }) => void
}) {
  const today = new Date().toISOString().split('T')[0]

  const [mode, setMode] = useState<Mode>('unit')
  const [namePrefix, setNamePrefix] = useState('')
  const [client, setClient] = useState(customer?.name ?? defaultClient ?? '')
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState(today)

  // Building address (unit + floor modes)
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })

  // Street mode
  const [streetName, setStreetName] = useState('')
  const [area, setArea] = useState('')
  const [firstNumber, setFirstNumber] = useState(1)
  const [increment, setIncrement] = useState(2)
  const [count, setCount] = useState(10)

  const [unitFrom, setUnitFrom] = useState(1)
  const [unitTo, setUnitTo] = useState(10)
  const [floorFrom, setFloorFrom] = useState(1)
  const [floorTo, setFloorTo] = useState(5)
  const [floorLabel, setFloorLabel] = useState('Floor')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // What the batch will actually produce, shown before they commit to it.
  const preview: string[] = (() => {
    const p = namePrefix.trim() || 'Project'
    if (mode === 'street') {
      const out: string[] = []
      let n = Number(firstNumber) || 1
      const inc = Number(increment) || 1
      for (let i = 0; i < Math.min(Number(count) || 0, 3); i++) { out.push(`${p} - ${n} ${streetName || 'Street'}`); n += inc }
      return out
    }
    if (mode === 'floor') {
      const out: string[] = []
      for (let f = Number(floorFrom) || 1; f <= Math.min(Number(floorTo) || 1, (Number(floorFrom) || 1) + 2); f++) {
        out.push(`${p} - ${floorLabel || 'Floor'} ${f}`)
      }
      return out
    }
    const out: string[] = []
    for (let u = Number(unitFrom) || 1; u <= Math.min(Number(unitTo) || 1, (Number(unitFrom) || 1) + 2); u++) {
      out.push(`${p} - Unit ${u}`)
    }
    return out
  })()

  const total = mode === 'street'
    ? Math.max(Number(count) || 0, 0)
    : mode === 'floor'
      ? Math.max((Number(floorTo) || 0) - (Number(floorFrom) || 0) + 1, 0)
      : Math.max((Number(unitTo) || 0) - (Number(unitFrom) || 0) + 1, 0)

  const needsBuilding = mode !== 'street'
  const canSubmit = !!namePrefix.trim() && total > 0 && total <= 100
    && (needsBuilding ? !!address.trim() : !!streetName.trim())

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true); setError('')

    const payload: Record<string, unknown> = {
      mode,
      name_prefix: namePrefix.trim(),
      client: client || null,
      type,
      start_date: startDate || null,
      ...(customer?.id ? { customer_id: customer.id } : {}),
    }

    if (mode === 'street') {
      Object.assign(payload, {
        street_name: streetName.trim(),
        address: area.trim(),
        first_number: firstNumber,
        increment,
        count,
      })
    } else {
      Object.assign(payload, { address: address.trim(), lat: coords.lat, lng: coords.lng })
      if (mode === 'floor') Object.assign(payload, { floor_start: floorFrom, floor_end: floorTo, floor_label: floorLabel })
      else Object.assign(payload, { unit_start: unitFrom, unit_end: unitTo })
    }

    const res = await fetch('/api/projects/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    })
    setSaving(false)
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'Could not create the projects')
      return
    }
    const d = await res.json()
    onSuccess({ count: d.count ?? 0, located: d.located ?? 0, siteId: d.site?.id ?? null })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div className="w-full max-w-xl rounded-xl bg-panel shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
          <h2 className="text-base font-semibold text-ink">Bulk Add Projects</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          {/* What kind of batch */}
          <div className="space-y-1.5">
            <Label>What are you setting up?</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {MODES.map(m => {
                const Icon = m.icon
                return (
                  <button key={m.key} type="button" onClick={() => setMode(m.key)}
                    className={cn('rounded-lg border px-3 py-2.5 text-left transition-colors',
                      mode === m.key ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-surface')}>
                    <span className="flex items-center gap-1.5 text-sm font-semibold"><Icon className="h-4 w-4" />{m.label}</span>
                    <span className="block text-xs text-muted-fg mt-0.5">{m.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-prefix">Name prefix</Label>
              <Input id="bulk-prefix" value={namePrefix} onChange={e => setNamePrefix(e.target.value)}
                required placeholder={mode === 'street' ? 'e.g. Maple Estates' : 'e.g. 95 Edgecomb'} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-client">Client</Label>
              <Input id="bulk-client" value={client} onChange={e => setClient(e.target.value)}
                readOnly={!!customer} disabled={!!customer}
                className={customer ? 'bg-surface cursor-not-allowed' : undefined}
                placeholder="Who this is for" />
            </div>
          </div>

          {/* Address */}
          {needsBuilding ? (
            <div className="space-y-1.5">
              <Label>Building address</Label>
              <AddressFields value={address} onChange={setAddress} onCoords={(lat, lng) => setCoords({ lat, lng })} />
              <p className="text-xs text-faint">
                One address for the whole building - the unit or floor is stored separately, so every job lands on the
                map at the right spot.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-street">Street name</Label>
                <Input id="bulk-street" value={streetName} onChange={e => setStreetName(e.target.value)} placeholder="e.g. Maple Ave" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-area">City, state &amp; ZIP</Label>
                <Input id="bulk-area" value={area} onChange={e => setArea(e.target.value)} placeholder="e.g. Lakewood, NJ 08701" />
              </div>
            </div>
          )}

          {/* Range */}
          {mode === 'unit' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-uf">First unit</Label>
                <Input id="bulk-uf" type="number" min={1} value={unitFrom} onChange={e => setUnitFrom(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-ut">Last unit</Label>
                <Input id="bulk-ut" type="number" min={unitFrom} value={unitTo} onChange={e => setUnitTo(Number(e.target.value))} />
              </div>
            </div>
          )}

          {mode === 'floor' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-fl">Call it</Label>
                <Select id="bulk-fl" value={floorLabel} onChange={e => setFloorLabel(e.target.value)}>
                  <option value="Floor">Floor</option>
                  <option value="Level">Level</option>
                  <option value="Suite">Suite</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-ff">First</Label>
                <Input id="bulk-ff" type="number" value={floorFrom} onChange={e => setFloorFrom(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-ft">Last</Label>
                <Input id="bulk-ft" type="number" min={floorFrom} value={floorTo} onChange={e => setFloorTo(Number(e.target.value))} />
              </div>
            </div>
          )}

          {mode === 'street' && (
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bulk-fn">First number</Label>
                <Input id="bulk-fn" type="number" min={1} value={firstNumber} onChange={e => setFirstNumber(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-inc">Increment</Label>
                <Select id="bulk-inc" value={String(increment)} onChange={e => setIncrement(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 10].map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bulk-count">How many</Label>
                <Input id="bulk-count" type="number" min={1} max={100} value={count} onChange={e => setCount(Number(e.target.value))} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="bulk-type">Project type</Label>
              <Select id="bulk-type" value={type} onChange={e => setType(e.target.value)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="mixed_use">Mixed Use</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bulk-start">Start date</Label>
              <Input id="bulk-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>

          {/* Preview */}
          <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
            <p className="text-xs font-semibold text-muted-fg">
              {total > 100
                ? <span className="text-danger">That is {total} projects - the most you can create at once is 100.</span>
                : <>Creates {total} project{total !== 1 ? 's' : ''} under one site</>}
            </p>
            {total > 0 && total <= 100 && (
              <p className="text-xs text-faint mt-1 truncate">
                {preview.join(' · ')}{total > preview.length ? ' · …' : ''}
              </p>
            )}
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving || !canSubmit}>
              {saving ? 'Creating…' : `Create ${total || ''} project${total !== 1 ? 's' : ''}`}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

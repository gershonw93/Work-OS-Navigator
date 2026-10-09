'use client'

import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { type LotForm, lotFormFilled } from '@/lib/lot-details'
import { ChevronDown } from 'lucide-react'

/**
 * Parcel, lot, utilities and garage side - every one optional.
 *
 * Collapsed until it holds something, because most custom jobs never fill it
 * in and nine boxes on the main path are a tax on everybody who does not. The
 * tap names what is inside so nobody opens it to find out.
 */
export function LotDetailsFields({
  value, onChange, idPrefix = 'lot',
}: {
  value: LotForm
  onChange: (next: LotForm) => void
  idPrefix?: string
}) {
  const [open, setOpen] = useState(() => lotFormFilled(value))
  const set = <K extends keyof LotForm>(k: K, v: LotForm[K]) => onChange({ ...value, [k]: v })
  const id = (k: string) => `${idPrefix}-${k}`

  return (
    <div className="rounded-lg border border-line">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-ink">Lot details <span className="font-normal text-faint">(optional)</span></span>
          <span className="block text-xs text-muted-fg">Parcel, lot and block, size, water and sewer, garage side</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-faint transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-line-soft px-3 py-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor={id('lot')}>Lot <span className="text-faint font-normal">(optional)</span></Label>
              <Input id={id('lot')} value={value.lot} onChange={e => set('lot', e.target.value)} placeholder="e.g. 5" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={id('block')}>Block <span className="text-faint font-normal">(optional)</span></Label>
              <Input id={id('block')} value={value.block} onChange={e => set('block', e.target.value)} placeholder="e.g. 58" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('parcel')}>Parcel ID <span className="text-faint font-normal">(optional)</span></Label>
            <Input id={id('parcel')} value={value.parcel_id} onChange={e => set('parcel_id', e.target.value)}
              placeholder="e.g. 07-11-31-7023-00580-0050" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('size')}>Lot size <span className="text-faint font-normal">(optional)</span></Label>
            <div className="flex items-center gap-2">
              <Input id={id('size')} type="number" min="0" step="any" inputMode="decimal" className="min-w-0 flex-1"
                value={value.lot_size} onChange={e => set('lot_size', e.target.value)} placeholder="e.g. 0.27" />
              <Choice value={value.lot_size_unit} onChange={v => set('lot_size_unit', v)}
                options={[{ v: 'acres', label: 'Acres' }, { v: 'sqft', label: 'Sq ft' }]} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>City water <span className="text-faint font-normal">(optional)</span></Label>
              <Choice value={value.city_water} onChange={v => set('city_water', v)} allowClear
                options={[{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No - well' }]} />
            </div>
            <div className="space-y-1.5">
              <Label>City sewer <span className="text-faint font-normal">(optional)</span></Label>
              <Choice value={value.city_sewer} onChange={v => set('city_sewer', v)} allowClear
                options={[{ v: 'yes', label: 'Yes' }, { v: 'no', label: 'No - septic' }]} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Garage side <span className="text-faint font-normal">(optional)</span></Label>
            <Choice value={value.garage_side} onChange={v => set('garage_side', v)} allowClear
              options={[{ v: 'left', label: 'Left' }, { v: 'right', label: 'Right' }]} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={id('env')}>Environmental <span className="text-faint font-normal">(optional)</span></Label>
            <Input id={id('env')} value={value.environmental_notes} onChange={e => set('environmental_notes', e.target.value)}
              placeholder="e.g. Wetland on rear of lot" />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * A row of equal buttons, one per answer. Pressing the chosen one again clears
 * it when `allowClear` - "nobody knows" has to be reachable again after a
 * mis-tap, or the only way back to unknown is a wrong answer.
 */
function Choice<T extends string>({
  value, onChange, options, allowClear = true,
}: {
  value: T | ''
  onChange: (v: T | '') => void
  options: { v: T; label: string }[]
  allowClear?: boolean
}) {
  return (
    <div className="flex gap-1.5">
      {options.map(o => (
        <button key={o.v} type="button" aria-pressed={value === o.v}
          onClick={() => onChange(value === o.v && allowClear ? '' : o.v)}
          className={cn('min-h-[44px] lg:min-h-[36px] whitespace-nowrap rounded-lg border px-3 text-sm transition-colors',
            value === o.v ? 'border-accent bg-accent-tint font-semibold text-accent-fg' : 'border-line text-ink-soft hover:bg-surface')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

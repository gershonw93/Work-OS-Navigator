'use client'

import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AddressAutocomplete } from '@/components/ui/address-autocomplete'

// Separate Street / City / State / ZIP fields that combine into one address
// string (kept as the source of truth so the DB column and geocoder are
// unchanged). The Street field keeps the OSM autocomplete; picking a full
// suggestion back-fills city/state/zip.
export interface AddressParts { street: string; city: string; state: string; zip: string }

export function splitAddress(full?: string | null): AddressParts {
  const s = (full ?? '').trim()
  if (!s) return { street: '', city: '', state: '', zip: '' }
  const parts = s.split(',').map(p => p.trim()).filter(Boolean)
  const street = parts[0] ?? ''
  const city = parts.length >= 3 ? parts[1] : (parts.length === 2 ? parts[1].replace(/\s+[A-Z]{2}\s*\d{0,5}$/, '').trim() : '')
  const last = parts[parts.length - 1] ?? ''
  const m = last.match(/([A-Za-z]{2})\s*(\d{5})?/)
  const state = parts.length >= 2 ? (m?.[1] ?? '') : ''
  const zip = m?.[2] ?? ''
  return { street, city, state, zip }
}

export function joinAddress(p: AddressParts): string {
  const tail = [p.city, [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [p.street, tail].filter(Boolean).join(', ')
}

export function AddressFields({
  value, onChange, required,
}: {
  value: string
  onChange: (full: string) => void
  required?: boolean
}) {
  const initial = useMemo(() => splitAddress(value), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [street, setStreet] = useState(initial.street)
  const [city, setCity] = useState(initial.city)
  const [state, setState] = useState(initial.state)
  const [zip, setZip] = useState(initial.zip)

  function push(next: Partial<AddressParts>) {
    const parts = { street, city, state, zip, ...next }
    onChange(joinAddress(parts))
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="street">Street</Label>
        <AddressAutocomplete
          id="street"
          value={street}
          required={required}
          placeholder="Start typing the street address…"
          onChange={(v) => {
            // A picked suggestion looks like "123 Main St, City, ST 12345" —
            // spread it across the fields; a raw keystroke just updates street.
            if (v.includes(',')) {
              const p = splitAddress(v)
              setStreet(p.street); if (p.city) setCity(p.city); if (p.state) setState(p.state); if (p.zip) setZip(p.zip)
              onChange(joinAddress({ street: p.street, city: p.city || city, state: p.state || state, zip: p.zip || zip }))
            } else {
              setStreet(v); push({ street: v })
            }
          }}
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" value={city} onChange={e => { setCity(e.target.value); push({ city: e.target.value }) }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="state">State</Label>
          <Input id="state" value={state} maxLength={2} onChange={e => { const v = e.target.value.toUpperCase(); setState(v); push({ state: v }) }} placeholder="NJ" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="zip">ZIP</Label>
          <Input id="zip" value={zip} onChange={e => { setZip(e.target.value); push({ zip: e.target.value }) }} placeholder="08701" />
        </div>
      </div>
    </div>
  )
}

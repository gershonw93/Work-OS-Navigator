'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressFields } from '@/components/ui/address-fields'
import {
  type ContractType, CONTRACT_TYPES, CONTRACT_LABEL, CONTRACT_BLURB, asContractType,
} from '@/lib/contract-type'

/**
 * The one form that creates a project.
 *
 * There used to be two. This one, and a shorter copy inside the Add Project
 * modal on a customer's page which collected four fields: name, address, type
 * and start date. It had simply never been updated as fields were added here.
 *
 * That was not a cosmetic gap. The copy never asked two questions the money
 * model is built on:
 *
 *   * BILLING MODE. It is NOT NULL with a database default of 'simple', so the
 *     modal did not leave it empty - it silently stamped every job as simple
 *     invoicing. A commercial job that bills by AIA pay application came out
 *     the same as a small residential one, and nothing flagged it, because
 *     'simple' looks like an answer somebody gave.
 *   * CONTRACT TYPE. Nullable, so it stayed null. lib/contract-type.ts returns
 *     nulls for everything without it, so the Budget tab cannot show profit at
 *     all - and lib/job-setup.ts marks it ESSENTIAL, so the job opened with a
 *     red "needed" badge and nothing explaining why.
 *
 * It also skipped lat/lng (a plain text input, no geocoding), end date and both
 * square-footage fields, and offered a "renovation" project type that exists
 * nowhere else in the app.
 *
 * One component, mounted in both places, is the actual fix. The missing fields
 * were a symptom of the duplication, not the disease.
 */

export interface CreatedProject { id: string; name?: string }

export function ProjectForm({
  lockedCustomer,
  submitLabel = 'Create Project',
  onCreated,
  onCancel,
}: {
  /**
   * Set when the form is opened from a customer's own page. The client is
   * already known there, so it is shown rather than asked - a picker in that
   * context only offers the chance to attach the job to the wrong person.
   */
  lockedCustomer?: { id: string; name: string } | null
  submitLabel?: string
  /** The caller decides what happens next - navigate, close a modal, refresh. */
  onCreated: (project: CreatedProject) => void
  onCancel: () => void
}) {
  const supabase = createClient()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [client, setClient] = useState(lockedCustomer?.name ?? '')
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [customerId, setCustomerId] = useState(lockedCustomer?.id ?? '')
  const [type, setType] = useState<'residential' | 'commercial' | 'mixed_use'>('commercial')
  const [interiorSqft, setInteriorSqft] = useState('')
  const [exteriorSqft, setExteriorSqft] = useState('')
  const [billingMode, setBillingMode] = useState<'simple' | 'aia'>('simple')
  // How the job pays. Left null rather than defaulted to anything - a wrong
  // guess here hides the control the job actually needs on the Budget tab, and
  // the Budget tab asks for it if it is still unanswered.
  const [contractType, setContractType] = useState<ContractType | null>(null)
  const [retainage, setRetainage] = useState('10')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Existing customers from the directory, so the client can be picked instead
  // of retyped. Skipped entirely when the customer is already known.
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      if (!lockedCustomer) {
        const res = await fetch('/api/customers', { headers: { Authorization: `Bearer ${session.access_token}` } })
        if (res.ok) {
          const d = await res.json()
          setCustomers((d.customers ?? []).map((c: any) => ({ id: c.id, name: c.name })))
        }
      }
      // Pre-fill billing from the company's account defaults.
      const s = await fetch('/api/settings', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (s.ok) {
        const c = (await s.json()).company
        if (c?.default_billing_mode === 'aia') setBillingMode('aia')
        if (c?.default_retainage_pct != null) setRetainage(String(c.default_retainage_pct))
        const ct = asContractType(c?.default_contract_type)
        if (ct) setContractType(ct)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setError('You must be signed in.')
      setLoading(false)
      return
    }

    if (!client.trim()) {
      setError('Pick or enter a client.')
      setLoading(false)
      return
    }

    const isNew = customerId === '__new__' || !customerId
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        name,
        address,
        client,
        type,
        start_date: startDate,
        end_date: endDate || null,
        customer_id: isNew ? null : customerId,
        lat: coords.lat, lng: coords.lng,
        interior_sqft: interiorSqft ? Number(interiorSqft) : null,
        exterior_sqft: exteriorSqft ? Number(exteriorSqft) : null,
        billing_mode: billingMode,
        ...(contractType ? { contract_type: contractType } : {}),
        ...(billingMode === 'aia' ? { default_retainage_pct: Number(retainage) || 0 } : {}),
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to create project.')
      setLoading(false)
      return
    }

    const { project } = await res.json()
    onCreated(project)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="name">Project Name</Label>
        <Input
          id="name"
          placeholder="e.g. Downtown Office Renovation"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>Address</Label>
        <AddressFields value={address} onChange={setAddress} onCoords={(lat, lng) => setCoords({ lat, lng })} required />
      </div>

      {lockedCustomer ? (
        <div className="space-y-1.5">
          <Label>Owner / Client</Label>
          <p className="rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink-soft">
            {lockedCustomer.name}
          </p>
        </div>
      ) : (
      <div className="space-y-1.5">
        <Label htmlFor="client">Owner / Client</Label>
        <Select
          value={customerId}
          onChange={(e) => {
            const v = e.target.value
            setCustomerId(v)
            const c = customers.find(x => x.id === v)
            setClient(c ? c.name : '')
          }}
        >
          <option value="" disabled>Select a client…</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          <option value="__new__">+ New client…</option>
        </Select>
        {customerId === '__new__' && (
          <Input
            id="client"
            placeholder="New client's name, e.g. Acme Corp"
            value={client}
            onChange={(e) => setClient(e.target.value)}
            required
            autoFocus
          />
        )}
      </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="type">Project Type</Label>
        <Select
          id="type"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="residential">Residential</option>
          <option value="commercial">Commercial</option>
          <option value="mixed_use">Mixed Use</option>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>How will you bill this job?</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" onClick={() => setBillingMode('simple')}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${billingMode === 'simple' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-panel'}`}>
            <span className="block text-sm font-semibold">Simple invoicing</span>
            <span className="block text-xs text-muted-fg mt-0.5">Invoices and client payments / escrow. Best for residential and smaller jobs.</span>
          </button>
          <button type="button" onClick={() => setBillingMode('aia')}
            className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${billingMode === 'aia' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-panel'}`}>
            <span className="block text-sm font-semibold">Progress billing (AIA)</span>
            <span className="block text-xs text-muted-fg mt-0.5">Monthly pay applications (G702/G703) with retainage. For commercial and bank-funded jobs.</span>
          </button>
        </div>
        {billingMode === 'aia' && (
          <div className="flex items-center gap-2 pt-1">
            <Label htmlFor="retainage" className="text-sm font-normal text-muted-fg">Default retainage</Label>
            <Input id="retainage" type="number" step="0.1" value={retainage} onChange={(e) => setRetainage(e.target.value)} className="w-24" />
            <span className="text-sm text-muted-fg">%</span>
          </div>
        )}
      </div>

      {/* How the job PAYS - a different question from how it bills, and
          the one the Budget tab needs to know whether to track a markup
          or a contract value. Optional here; the Budget tab asks if it
          was skipped. */}
      <div className="space-y-1.5">
        <Label>How does this job pay you? <span className="text-faint font-normal">(optional)</span></Label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CONTRACT_TYPES.map(t => (
            <button key={t} type="button" onClick={() => setContractType(contractType === t ? null : t)}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${contractType === t ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-panel'}`}>
              <span className="block text-sm font-semibold">{CONTRACT_LABEL[t]}</span>
              <span className="block text-xs text-muted-fg mt-0.5">{CONTRACT_BLURB[t]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="interiorSqft">Interior Sq Ft <span className="text-faint font-normal">(under A/C, optional)</span></Label>
          <Input
            id="interiorSqft"
            type="number"
            min="0"
            placeholder="e.g. 2400"
            value={interiorSqft}
            onChange={(e) => setInteriorSqft(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="exteriorSqft">Exterior Sq Ft <span className="text-faint font-normal">(under roof, optional)</span></Label>
          <Input
            id="exteriorSqft"
            type="number"
            min="0"
            placeholder="e.g. 600"
            value={exteriorSqft}
            onChange={(e) => setExteriorSqft(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startDate">Start Date</Label>
          <Input
            id="startDate"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endDate">Target End Date <span className="text-faint font-normal">(optional)</span></Label>
          <Input
            id="endDate"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-danger-tint border border-danger/30 px-4 py-2.5">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" disabled={loading}>
          {loading ? 'Creating...' : submitLabel}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

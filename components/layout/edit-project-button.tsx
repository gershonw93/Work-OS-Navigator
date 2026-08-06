'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressFields } from '@/components/ui/address-fields'
import { Settings, X } from 'lucide-react'

interface Props {
  projectId: string
  project: {
    name?: string | null
    address?: string | null
    client?: string | null
    type?: string | null
    status?: string | null
    start_date?: string | null
    end_date?: string | null
    customer_id?: string | null
    interior_sqft?: number | null
    exterior_sqft?: number | null
    billing_mode?: string | null
    default_retainage_pct?: number | null
  }
}

export function EditProjectButton({ projectId, project }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState(project.name ?? '')
  const [address, setAddress] = useState(project.address ?? '')
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [customerId, setCustomerId] = useState(project.customer_id ?? '')
  const [type, setType] = useState(project.type ?? 'residential')
  const [status, setStatus] = useState(project.status ?? 'planning')
  const [startDate, setStartDate] = useState((project.start_date ?? '').slice(0, 10))
  const [endDate, setEndDate] = useState((project.end_date ?? '').slice(0, 10))
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null } | null>(null)
  const [interiorSqft, setInteriorSqft] = useState(project.interior_sqft != null ? String(project.interior_sqft) : '')
  const [exteriorSqft, setExteriorSqft] = useState(project.exterior_sqft != null ? String(project.exterior_sqft) : '')
  const [billingMode, setBillingMode] = useState<'simple' | 'aia'>(project.billing_mode === 'aia' ? 'aia' : 'simple')
  const [retainage, setRetainage] = useState(project.default_retainage_pct != null ? String(project.default_retainage_pct) : '10')

  useEffect(() => {
    if (!open) return
    (async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/customers', { headers: { Authorization: `Bearer ${session?.access_token ?? ''}` } })
      if (res.ok) setCustomers(((await res.json()).customers ?? []).map((c: any) => ({ id: c.id, name: c.name })))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const { data: { session } } = await supabase.auth.getSession()
    const client = customers.find(c => c.id === customerId)?.name ?? project.client ?? null
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
      body: JSON.stringify({
        name, address, customer_id: customerId || null, client, type, status,
        start_date: startDate || null, end_date: endDate || null,
        interior_sqft: interiorSqft ? Number(interiorSqft) : null,
        exterior_sqft: exteriorSqft ? Number(exteriorSqft) : null,
        billing_mode: billingMode,
        default_retainage_pct: billingMode === 'aia' ? (Number(retainage) || 0) : null,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      }),
    })
    setSaving(false)
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error ?? 'Could not save'); return }
    setOpen(false)
    // Status/billing changes what the tab bar shows; it caches that on mount.
    window.dispatchEvent(new Event('sytenav:project-updated'))
    router.refresh()
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Project settings"
        className="inline-flex items-center justify-center rounded-lg border border-line bg-panel p-2 text-muted-fg hover:bg-muted hover:text-ink transition-colors"
      >
        <Settings className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-panel shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-line-soft px-5 py-4">
              <h2 className="text-base font-semibold text-ink">Project Settings</h2>
              <button onClick={() => setOpen(false)} className="text-faint hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            <form onSubmit={save} className="p-5 space-y-4">
              <div className="space-y-1.5">
                <Label>Project Name</Label>
                <Input value={name} onChange={e => setName(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label>Address</Label>
                <AddressFields value={address} onChange={setAddress} onCoords={(lat, lng) => setCoords({ lat, lng })} />
              </div>
              <div className="space-y-1.5">
                <Label>Owner / Client</Label>
                <Select value={customerId} onChange={e => setCustomerId(e.target.value)}>
                  <option value="">- No customer -</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Project Type</Label>
                  <Select value={type} onChange={e => setType(e.target.value)}>
                    <option value="residential">Residential</option>
                    <option value="commercial">Commercial</option>
                    <option value="mixed_use">Mixed Use</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Status</Label>
                  <Select value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On Hold</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
              </div>

              {/* Billing method decides which money tabs this job shows (AIA =
                  Pay Apps; simple = Invoices + Payments), so it has to be
                  changeable after setup - jobs get re-scoped. */}
              <div className="space-y-1.5">
                <Label>How will you bill this job?</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" onClick={() => setBillingMode('simple')}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${billingMode === 'simple' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-surface'}`}>
                    <span className="block text-sm font-semibold">Simple invoicing</span>
                    <span className="block text-xs text-muted-fg mt-0.5">Invoices and client payments. Best for residential and smaller jobs.</span>
                  </button>
                  <button type="button" onClick={() => setBillingMode('aia')}
                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${billingMode === 'aia' ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-surface'}`}>
                    <span className="block text-sm font-semibold">Progress billing (AIA)</span>
                    <span className="block text-xs text-muted-fg mt-0.5">Monthly pay applications (G702/G703) with retainage. For commercial and bank-funded jobs.</span>
                  </button>
                </div>
                {billingMode === 'aia' && (
                  <div className="flex items-center gap-2 pt-1">
                    <Label className="text-sm font-normal text-muted-fg">Default retainage</Label>
                    <Input type="number" step="0.1" value={retainage} onChange={e => setRetainage(e.target.value)} className="w-24" />
                    <span className="text-sm text-muted-fg">%</span>
                  </div>
                )}
                {billingMode !== (project.billing_mode === 'aia' ? 'aia' : 'simple') && (
                  <p className="text-xs text-warn">
                    Changing this switches which money tabs appear. Anything already billed the old way stays on the job.
                  </p>
                )}
              </div>

              {/* Drives the cost-per-sq-ft breakdown on the Budget tab. */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Interior Sq Ft <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="number" min="0" placeholder="e.g. 2400" value={interiorSqft} onChange={e => setInteriorSqft(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Exterior Sq Ft <span className="text-faint font-normal">(optional)</span></Label>
                  <Input type="number" min="0" placeholder="e.g. 600" value={exteriorSqft} onChange={e => setExteriorSqft(e.target.value)} />
                </div>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !name.trim()}>{saving ? 'Saving…' : 'Save Changes'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

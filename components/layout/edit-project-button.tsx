'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressFields } from '@/components/ui/address-fields'
import {
  type ContractType, CONTRACT_TYPES, CONTRACT_LABEL, CONTRACT_BLURB, asContractType,
} from '@/lib/contract-type'
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
    contract_type?: string | null
    contractor_fee_pct?: number | null
    default_retainage_pct?: number | null
    unit?: string | null
    floor?: string | null
    is_site?: boolean | null
    parent_project_id?: string | null
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
  const [contractType, setContractType] = useState<ContractType | null>(asContractType(project.contract_type))
  // Stored on the project as a fraction; shown here as a whole percent.
  const [markupPct, setMarkupPct] = useState(
    project.contractor_fee_pct != null ? String(Math.round(Number(project.contractor_fee_pct) * 1000) / 10) : '0',
  )
  const [retainage, setRetainage] = useState(project.default_retainage_pct != null ? String(project.default_retainage_pct) : '10')
  // Whether the setup checklist shows on this job, in this browser. Read when
  // the dialog opens rather than on mount, so it reflects a dismissal made
  // since the page loaded.
  const setupKey = `sytenav:setup-dismissed:${projectId}`
  const [showSetup, setShowSetup] = useState(true)
  const [unit, setUnit] = useState(project.unit ?? '')
  const [floor, setFloor] = useState(project.floor ?? '')
  // Only worth showing on a job inside a building. A standalone project has no
  // unit, and a site is the building itself.
  const showUnitFloor = !project.is_site && (!!project.parent_project_id || !!project.unit || !!project.floor)

  useEffect(() => {
    if (!open) return
    try { setShowSetup(localStorage.getItem(setupKey) !== '1') } catch { setShowSetup(true) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggleSetup(next: boolean) {
    setShowSetup(next)
    try {
      if (next) localStorage.removeItem(setupKey)
      else localStorage.setItem(setupKey, '1')
    } catch { /* private mode - the switch just will not persist */ }
    window.dispatchEvent(new Event('sytenav:setup-visibility'))
  }

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
        ...(showUnitFloor ? { unit: unit || null, floor: floor || null } : {}),
        interior_sqft: interiorSqft ? Number(interiorSqft) : null,
        exterior_sqft: exteriorSqft ? Number(exteriorSqft) : null,
        billing_mode: billingMode,
        // Only sent once answered - undefined leaves it alone, and null here
        // would mean "unset it", which is never what a save is asking for.
        ...(contractType ? { contract_type: contractType } : {}),
        // Same field as the contractor fee rate on Billing the client. Stored
        // as a fraction, entered here as a percent.
        ...(contractType === 'cost_plus' ? { contractor_fee_pct: Math.max(0, (Number(markupPct) || 0) / 100) } : {}),
        // Only meaningful on AIA billing. Omitted rather than nulled on simple -
        // the column is NOT NULL, and the old value does no harm sitting there.
        ...(billingMode === 'aia' ? { default_retainage_pct: Number(retainage) || 0 } : {}),
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
              {showUnitFloor && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Unit</Label>
                    <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="e.g. 3B" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Floor</Label>
                    <Input value={floor} onChange={e => setFloor(e.target.value)} placeholder="e.g. 4" />
                  </div>
                </div>
              )}
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

              {/* Brings back a checklist somebody hid with the x. Without this
                  a single mis-click would remove the guide for good. */}
              <div className="flex items-start gap-2 rounded-lg border border-line px-3 py-2.5">
                <input id="showSetup" type="checkbox" className="mt-0.5 accent-[#C9F24A]"
                  checked={showSetup} onChange={e => toggleSetup(e.target.checked)} />
                <Label htmlFor="showSetup" className="font-normal">
                  Show the setup checklist on this job
                  <span className="mt-0.5 block text-xs text-muted-fg">
                    The step-by-step bar above the tabs. It hides itself once every step is done.
                    This switch is for you on this device, not for the whole team.
                  </span>
                </Label>
              </div>

              {/* How the job PAYS, which is a different question from how it
                  bills. Without it the Budget tab could not tell a cost-plus
                  job from a fixed-price one, so it showed a contract-value box
                  AND a markup box and told you to leave one empty. */}
              <div className="space-y-1.5">
                <Label>How does this job pay you?</Label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {CONTRACT_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => setContractType(t)}
                      className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${contractType === t ? 'border-accent bg-accent-tint text-accent-fg' : 'border-line text-ink-soft hover:bg-surface'}`}>
                      <span className="block text-sm font-semibold">{CONTRACT_LABEL[t]}</span>
                      <span className="block text-xs text-muted-fg mt-0.5">{CONTRACT_BLURB[t]}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-fg">
                  Decides what the Budget tab tracks: your markup on cost-plus, or a contract value on the other two.
                </p>
                {/* The rate itself, where the rest of the job's settings are.
                    It is the same field as the contractor fee on Billing the
                    client - one number, one source of truth. */}
                {contractType === 'cost_plus' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Label className="text-sm font-normal text-muted-fg">Markup</Label>
                    <Input type="number" min="0" step="0.5" value={markupPct}
                      onChange={e => setMarkupPct(e.target.value)} className="w-24" />
                    <span className="text-sm text-muted-fg">%</span>
                    <span className="text-xs text-faint">
                      The default. A budget line or a single bill can still differ.
                    </span>
                  </div>
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

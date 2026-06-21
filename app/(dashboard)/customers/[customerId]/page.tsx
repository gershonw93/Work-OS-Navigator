'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { ArrowLeft, Pencil, Mail, Phone, Plus, ExternalLink } from 'lucide-react'
import Link from 'next/link'

// ─── Types ────────────────────────────────────────────────────────────────────

type Project = {
  id: string
  name: string
  status: string
  address: string
  start_date: string
  type: string
}

type Customer = {
  id: string
  name: string
  contact_name: string | null
  email: string | null
  phone: string | null
  billing_address: string | null
  notes: string | null
  gc_company_id: string
  created_at: string
  projects: Project[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_ACTIVE = ['planning', 'active', 'in_progress', 'on_hold']
const STATUS_DONE = ['completed', 'cancelled']

function statusIsActive(s: string) {
  if (STATUS_DONE.includes(s)) return false
  return true
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${on ? 'bg-orange-500' : 'bg-slate-200'}`}
      role="switch"
      aria-checked={on}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// ─── Edit Customer Modal ──────────────────────────────────────────────────────

function EditCustomerModal({
  customer,
  token,
  onClose,
  onSaved,
}: {
  customer: Customer
  token: string
  onClose: () => void
  onSaved: (c: Customer) => void
}) {
  const [name, setName] = useState(customer.name)
  const [contactName, setContactName] = useState(customer.contact_name ?? '')
  const [email, setEmail] = useState(customer.email ?? '')
  const [phone, setPhone] = useState(customer.phone ?? '')
  const [billingAddress, setBillingAddress] = useState(customer.billing_address ?? '')
  const [notes, setNotes] = useState(customer.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, contact_name: contactName, email, phone, billing_address: billingAddress, notes }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); setSaving(false); return }
      onSaved({ ...customer, name, contact_name: contactName || null, email: email || null, phone: phone || null, billing_address: billingAddress || null, notes: notes || null })
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Edit Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="ec-name">Name *</Label>
            <Input id="ec-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-contact">Contact Name</Label>
            <Input id="ec-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Jane Smith" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ec-email">Email</Label>
              <Input id="ec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ec-phone">Phone</Label>
              <Input id="ec-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-billing">Billing Address</Label>
            <Input id="ec-billing" value={billingAddress} onChange={(e) => setBillingAddress(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ec-notes">Notes</Label>
            <textarea
              id="ec-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Add Project Modal ────────────────────────────────────────────────────────

function AddProjectModal({
  customer,
  token,
  onClose,
  onSuccess,
}: {
  customer: Customer
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, address, client: customer.name, type, start_date: startDate, customer_id: customer.id }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); setSaving(false); return }
      onSuccess()
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Add Project</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="ap-name">Project Name</Label>
            <Input id="ap-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Main Street Remodel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ap-address">Address</Label>
            <Input id="ap-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="ap-type">Type</Label>
              <Select id="ap-type" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="renovation">Renovation</option>
                <option value="mixed_use">Mixed Use</option>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ap-date">Start Date</Label>
              <Input id="ap-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Project'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Bulk Add Modal ───────────────────────────────────────────────────────────

function BulkAddModal({
  customer,
  token,
  onClose,
  onSuccess,
}: {
  customer: Customer
  token: string
  onClose: () => void
  onSuccess: () => void
}) {
  const today = new Date().toISOString().split('T')[0]
  const [bulkMode, setBulkMode] = useState<'unit' | 'street'>('unit')
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Unit mode fields
  const [namePrefix, setNamePrefix] = useState('')
  const [addressPrefix, setAddressPrefix] = useState('')
  const [unitFrom, setUnitFrom] = useState(1)
  const [unitTo, setUnitTo] = useState(10)

  // Street mode fields
  const [streetNamePrefix, setStreetNamePrefix] = useState('')
  const [streetName, setStreetName] = useState('')
  const [firstNumber, setFirstNumber] = useState(1)
  const [increment, setIncrement] = useState(1)
  const [streetCount, setStreetCount] = useState(10)

  // Preview
  let previewLines: string[] = []
  let totalCount = 0

  if (bulkMode === 'unit') {
    const cappedTo = Math.min(unitTo, unitFrom + 99)
    totalCount = cappedTo >= unitFrom ? cappedTo - unitFrom + 1 : 0
    previewLines = Array.from({ length: Math.min(totalCount, 5) }, (_, i) => `${namePrefix || 'Project'} Unit ${unitFrom + i}`)
  } else {
    totalCount = Math.min(streetCount, 100)
    let num = firstNumber
    for (let i = 0; i < Math.min(totalCount, 5); i++) {
      previewLines.push(`${streetNamePrefix || 'House'} - ${num} ${streetName || 'Main St'}`)
      num += increment
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = bulkMode === 'unit'
        ? {
            mode: 'unit',
            client: customer.name,
            name_prefix: namePrefix,
            address_prefix: addressPrefix,
            unit_start: unitFrom,
            unit_end: Math.min(unitTo, unitFrom + 99),
            type,
            start_date: startDate,
            customer_id: customer.id,
          }
        : {
            mode: 'street',
            client: customer.name,
            name_prefix: streetNamePrefix,
            street_name: streetName,
            first_number: firstNumber,
            increment,
            count: Math.min(streetCount, 100),
            type,
            start_date: startDate,
            customer_id: customer.id,
          }

      const res = await fetch('/api/projects/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed'); setSaving(false); return }
      setSuccessMsg(`Created ${json.count} project${json.count === 1 ? '' : 's'}!`)
      setTimeout(() => { onSuccess() }, 1500)
    } catch {
      setError('Network error')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 sticky top-0 bg-white z-10">
          <h2 className="text-base font-semibold text-slate-900">Bulk Add Projects</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        {successMsg ? (
          <div className="p-10 text-center">
            <p className="text-lg font-semibold text-green-600">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {/* Mode selector */}
            <div>
              <Label className="mb-2 block">Mode</Label>
              <div className="flex gap-4">
                {(['unit', 'street'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="bulk-mode"
                      value={m}
                      checked={bulkMode === m}
                      onChange={() => setBulkMode(m)}
                      className="accent-orange-500"
                    />
                    <span className="text-sm font-medium text-slate-700">
                      {m === 'unit' ? 'Unit Numbers' : 'Street Numbers'}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Customer (pre-filled read-only) */}
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <Input value={customer.name} readOnly disabled className="bg-slate-50 cursor-not-allowed" />
            </div>

            {bulkMode === 'unit' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-name-prefix">Project Name Prefix</Label>
                    <Input id="bm-name-prefix" value={namePrefix} onChange={(e) => setNamePrefix(e.target.value)} required placeholder="e.g. House" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-addr-prefix">Address Prefix</Label>
                    <Input id="bm-addr-prefix" value={addressPrefix} onChange={(e) => setAddressPrefix(e.target.value)} placeholder="e.g. 95 Edgecomb Ave" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-from">Unit From</Label>
                    <Input id="bm-from" type="number" min={1} value={unitFrom} onChange={(e) => setUnitFrom(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-to">Unit To (max 100)</Label>
                    <Input id="bm-to" type="number" min={unitFrom} max={unitFrom + 99} value={unitTo} onChange={(e) => setUnitTo(Number(e.target.value))} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-street-prefix">Name Prefix</Label>
                    <Input id="bm-street-prefix" value={streetNamePrefix} onChange={(e) => setStreetNamePrefix(e.target.value)} required placeholder="e.g. House" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-street-name">Street Name</Label>
                    <Input id="bm-street-name" value={streetName} onChange={(e) => setStreetName(e.target.value)} required placeholder="e.g. Main St" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-first-num">First Number</Label>
                    <Input id="bm-first-num" type="number" min={1} value={firstNumber} onChange={(e) => setFirstNumber(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-increment">Increment</Label>
                    <Select id="bm-increment" value={String(increment)} onChange={(e) => setIncrement(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bm-count">Count (max 100)</Label>
                    <Input id="bm-count" type="number" min={1} max={100} value={streetCount} onChange={(e) => setStreetCount(Number(e.target.value))} />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bm-type">Type</Label>
                <Select id="bm-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="renovation">Renovation</option>
                  <option value="mixed_use">Mixed Use</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bm-date">Start Date</Label>
                <Input id="bm-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>

            {/* Preview */}
            {totalCount > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
                <p className="font-medium text-slate-800 mb-1">Preview ({totalCount} total):</p>
                <ul className="space-y-0.5">
                  {previewLines.map((line, i) => (
                    <li key={i} className="text-slate-600">{line}</li>
                  ))}
                  {totalCount > 5 && (
                    <li className="text-slate-400 italic">… and {totalCount - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving || totalCount === 0}>
                {saving ? 'Creating…' : `Create ${totalCount} Project${totalCount === 1 ? '' : 's'}`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const STATUS_FILTERS = ['All', 'Planning', 'Active', 'Completed']

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const customerId = params.customerId as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [activeTab, setActiveTab] = useState<'projects' | 'documents' | 'notes'>('projects')
  const [statusFilter, setStatusFilter] = useState('All')
  const [notesText, setNotesText] = useState('')
  const [notesSaving, setNotesSaving] = useState(false)
  const [notesSaved, setNotesSaved] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const load = useCallback(async (tok: string) => {
    const res = await fetch(`/api/customers/${customerId}`, {
      headers: { Authorization: `Bearer ${tok}` },
    })
    if (!res.ok) { setLoading(false); return }
    const json = await res.json()
    setCustomer(json.customer)
    setNotesText(json.customer?.notes ?? '')
    setLoading(false)
  }, [customerId])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const tok = session?.access_token ?? ''
      setToken(tok)
      load(tok)
    })
  }, [load])

  async function saveNotes() {
    if (!customer) return
    setNotesSaving(true)
    setNotesSaved(false)
    await fetch(`/api/customers/${customer.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ notes: notesText }),
    })
    setNotesSaving(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2000)
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-400 text-sm">Loading…</div>
  }

  if (!customer) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Customer not found.</p>
        <Button variant="secondary" onClick={() => router.push('/customers')} className="mt-4">
          ← Back to Customers
        </Button>
      </div>
    )
  }

  const projects = customer.projects ?? []
  const totalProjects = projects.length
  const activeProjects = projects.filter((p) => statusIsActive(p.status)).length
  const completedProjects = projects.filter((p) => p.status === 'completed').length

  const filteredProjects = statusFilter === 'All'
    ? projects
    : projects.filter((p) => p.status.toLowerCase() === statusFilter.toLowerCase())

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Back */}
      <Link
        href="/customers"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-orange-500 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Customers
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{customer.name}</h1>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-slate-600">
            {customer.contact_name && (
              <span>{customer.contact_name}</span>
            )}
            {customer.email && (
              <a href={`mailto:${customer.email}`} className="flex items-center gap-1 text-orange-500 hover:text-orange-600">
                <Mail className="h-3.5 w-3.5" />
                {customer.email}
              </a>
            )}
            {customer.phone && (
              <a href={`tel:${customer.phone}`} className="flex items-center gap-1 text-orange-500 hover:text-orange-600">
                <Phone className="h-3.5 w-3.5" />
                {customer.phone}
              </a>
            )}
          </div>
        </div>
        <Button onClick={() => setEditOpen(true)} variant="secondary">
          <Pencil className="h-4 w-4 mr-1.5" />
          Edit
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Projects" value={totalProjects} />
        <StatCard label="Active Projects" value={activeProjects} />
        <StatCard label="Completed" value={completedProjects} />
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <p className="text-2xl font-bold text-slate-400">—</p>
            <p className="text-xs text-slate-500 mt-0.5">View Financials</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-0">
          {(['projects', 'documents', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={[
                'px-4 py-2.5 text-sm font-medium capitalize border-b-2 transition-colors',
                activeTab === tab
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700',
              ].join(' ')}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Projects */}
      {activeTab === 'projects' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Status filter pills */}
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={[
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors',
                    statusFilter === f
                      ? 'bg-orange-500 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                  ].join(' ')}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Actions */}
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>Bulk Add</Button>
              <Button onClick={() => setAddProjectOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add Project
              </Button>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-400">No projects match this filter.</div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {filteredProjects.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {p.address && <p className="text-xs text-slate-500 truncate">{p.address}</p>}
                      {p.start_date && <p className="text-xs text-slate-400">{p.start_date}</p>}
                      {p.type && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 capitalize">
                          {p.type.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Badge variant={getStatusVariant(p.status)}>{p.status}</Badge>
                    <Link
                      href={`/projects/${p.id}/plans`}
                      className="flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Documents */}
      {activeTab === 'documents' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Documents are managed per project. Click any project to view its documents.
          </p>
          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {projects.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400 text-center">No projects yet.</p>
            ) : (
              projects.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}/plans`}
                  className="flex items-center justify-between px-4 py-3 bg-white hover:bg-slate-50 transition-colors"
                >
                  <span className="text-sm font-medium text-slate-800">{p.name}</span>
                  <ExternalLink className="h-4 w-4 text-slate-400" />
                </Link>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab: Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-3">
          <textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            rows={8}
            placeholder="Add notes about this customer…"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
          />
          <div className="flex items-center gap-3">
            <Button onClick={saveNotes} disabled={notesSaving}>
              {notesSaving ? 'Saving…' : 'Save Notes'}
            </Button>
            {notesSaved && <span className="text-sm text-green-600">Saved!</span>}
          </div>
        </div>
      )}

      {/* Modals */}
      {editOpen && (
        <EditCustomerModal
          customer={customer}
          token={token}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => {
            setCustomer((prev) => prev ? { ...prev, ...updated } : prev)
            setEditOpen(false)
          }}
        />
      )}
      {addProjectOpen && (
        <AddProjectModal
          customer={customer}
          token={token}
          onClose={() => setAddProjectOpen(false)}
          onSuccess={() => { setAddProjectOpen(false); load(token) }}
        />
      )}
      {bulkOpen && (
        <BulkAddModal
          customer={customer}
          token={token}
          onClose={() => setBulkOpen(false)}
          onSuccess={() => { setBulkOpen(false); load(token) }}
        />
      )}
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageHeader } from '@/components/ui/page-header'
import { Plus, ChevronDown, ChevronUp, ExternalLink, UserPlus } from 'lucide-react'
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

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function uniqueStatuses(projects: Project[]) {
  const seen = new Set<string>()
  return projects.filter((p) => p.status && !seen.has(p.status) && seen.add(p.status)).map((p) => p.status)
}

// ─── Add Project Modal ────────────────────────────────────────────────────────

function AddProjectModal({
  customer,
  onClose,
  onSuccess,
  token,
}: {
  customer: Customer
  onClose: () => void
  onSuccess: () => void
  token: string
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
      <div className="w-full max-w-md rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">Add Project for {customer.name}</h2>
          <button onClick={onClose} className="text-faint hover:text-muted-fg text-xl leading-none">&times;</button>
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
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Project'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── New Customer Modal ───────────────────────────────────────────────────────

function NewCustomerModal({
  onClose,
  onSuccess,
  token,
}: {
  onClose: () => void
  onSuccess: () => void
  token: string
}) {
  const [name, setName] = useState('')
  const [contactName, setContactName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, contact_name: contactName || undefined, email: email || undefined, phone: phone || undefined }),
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
      <div className="w-full max-w-sm rounded-xl bg-panel shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="text-base font-semibold text-ink">New Customer</h2>
          <button onClick={onClose} className="text-faint hover:text-muted-fg text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="nc-name">Customer Name *</Label>
            <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. John Smith" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-contact">Contact Name</Label>
            <Input id="nc-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="e.g. Jane Smith" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-email">Email</Label>
            <Input id="nc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nc-phone">Phone</Label>
            <Input id="nc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Customer'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Bulk Create Modal ────────────────────────────────────────────────────────

function BulkCreateModal({
  onClose,
  onSuccess,
  token,
}: {
  onClose: () => void
  onSuccess: () => void
  token: string
}) {
  const today = new Date().toISOString().split('T')[0]
  const [bulkMode, setBulkMode] = useState<'unit' | 'street'>('unit')
  const [client, setClient] = useState('')
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Unit mode
  const [namePrefix, setNamePrefix] = useState('')
  const [addressPrefix, setAddressPrefix] = useState('')
  const [unitFrom, setUnitFrom] = useState(1)
  const [unitTo, setUnitTo] = useState(10)

  // Street mode
  const [streetNamePrefix, setStreetNamePrefix] = useState('')
  const [streetName, setStreetName] = useState('')
  const [firstNumber, setFirstNumber] = useState(1)
  const [increment, setIncrement] = useState(1)
  const [streetCount, setStreetCount] = useState(10)

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
        ? { mode: 'unit', client, name_prefix: namePrefix, address_prefix: addressPrefix, unit_start: unitFrom, unit_end: Math.min(unitTo, unitFrom + 99), type, start_date: startDate }
        : { mode: 'street', client, name_prefix: streetNamePrefix, street_name: streetName, first_number: firstNumber, increment, count: Math.min(streetCount, 100), type, start_date: startDate }

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
      <div className="w-full max-w-lg rounded-xl bg-panel shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-line px-6 py-4 sticky top-0 bg-panel z-10">
          <h2 className="text-base font-semibold text-ink">Bulk Create Projects</h2>
          <button onClick={onClose} className="text-faint hover:text-muted-fg text-xl leading-none">&times;</button>
        </div>
        {successMsg ? (
          <div className="p-10 text-center">
            <p className="text-lg font-semibold text-success">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {/* Mode */}
            <div>
              <Label className="mb-2 block">Mode</Label>
              <div className="flex gap-4">
                {(['unit', 'street'] as const).map((m) => (
                  <label key={m} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="bulk-mode-list" value={m} checked={bulkMode === m} onChange={() => setBulkMode(m)} className="accent-[#C9F24A]" />
                    <span className="text-sm font-medium text-ink-soft">{m === 'unit' ? 'Unit Numbers' : 'Street Numbers'}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bc-client">Client Name</Label>
              <Input id="bc-client" value={client} onChange={(e) => setClient(e.target.value)} required placeholder="e.g. Edgecomb Homes" />
            </div>

            {bulkMode === 'unit' ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-name-prefix">Project Name Prefix</Label>
                    <Input id="bc-name-prefix" value={namePrefix} onChange={(e) => setNamePrefix(e.target.value)} required placeholder="e.g. House" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-addr-prefix">Address Prefix</Label>
                    <Input id="bc-addr-prefix" value={addressPrefix} onChange={(e) => setAddressPrefix(e.target.value)} placeholder="e.g. 95 Edgecomb Ave Unit" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-from">Unit From</Label>
                    <Input id="bc-from" type="number" min={1} value={unitFrom} onChange={(e) => setUnitFrom(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-to">Unit To (max 100)</Label>
                    <Input id="bc-to" type="number" min={unitFrom} max={unitFrom + 99} value={unitTo} onChange={(e) => setUnitTo(Number(e.target.value))} />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-street-prefix">Name Prefix</Label>
                    <Input id="bc-street-prefix" value={streetNamePrefix} onChange={(e) => setStreetNamePrefix(e.target.value)} required placeholder="e.g. House" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-street-name">Street Name</Label>
                    <Input id="bc-street-name" value={streetName} onChange={(e) => setStreetName(e.target.value)} required placeholder="e.g. Main St" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-first-num">First Number</Label>
                    <Input id="bc-first-num" type="number" min={1} value={firstNumber} onChange={(e) => setFirstNumber(Number(e.target.value))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-increment">Increment</Label>
                    <Select id="bc-increment" value={String(increment)} onChange={(e) => setIncrement(Number(e.target.value))}>
                      {[1, 2, 3, 4, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-count">Count (max 100)</Label>
                    <Input id="bc-count" type="number" min={1} max={100} value={streetCount} onChange={(e) => setStreetCount(Number(e.target.value))} />
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="bc-type">Type</Label>
                <Select id="bc-type" value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="residential">Residential</option>
                  <option value="commercial">Commercial</option>
                  <option value="renovation">Renovation</option>
                  <option value="mixed_use">Mixed Use</option>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bc-date">Start Date</Label>
                <Input id="bc-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            </div>

            {totalCount > 0 && (
              <div className="rounded-lg bg-surface border border-line px-4 py-3 text-sm text-muted-fg">
                <p className="font-medium text-ink-soft mb-1">Preview ({totalCount} total):</p>
                <ul className="space-y-0.5">
                  {previewLines.map((line, i) => <li key={i}>{line}</li>)}
                  {totalCount > 5 && <li className="text-faint italic">… and {totalCount - 5} more</li>}
                </ul>
              </div>
            )}

            {error && <p className="text-sm text-danger">{error}</p>}
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

// ─── Customer Card ────────────────────────────────────────────────────────────

function CustomerCard({
  customer,
  token,
  onRefresh,
}: {
  customer: Customer
  token: string
  onRefresh: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [addProjectOpen, setAddProjectOpen] = useState(false)

  const statuses = uniqueStatuses(customer.projects ?? [])

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink text-base font-bold">
                {getInitials(customer.name)}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold text-ink truncate">{customer.name}</CardTitle>
                <p className="text-xs text-muted-fg mt-0.5">
                  {(customer.projects ?? []).length} project{(customer.projects ?? []).length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setAddProjectOpen(true)}
              className="shrink-0 rounded-md p-1.5 text-faint hover:bg-muted hover:text-accent-fg transition-colors"
              title="Add Project"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <div className="flex flex-wrap gap-1.5">
            {statuses.map((s) => (
              <Badge key={s} variant={getStatusVariant(s)}>{s}</Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 justify-between"
              onClick={() => setExpanded((v) => !v)}
            >
              View Projects
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            <Link
              href={`/customers/${customer.id}`}
              className="inline-flex items-center gap-1 rounded-md bg-accent-tint px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent-tint transition-colors"
            >
              View →
            </Link>
          </div>
          {expanded && (
            <ul className="divide-y divide-line-soft border border-line rounded-lg overflow-hidden">
              {(customer.projects ?? []).map((p) => (
                <li key={p.id} className="px-3 py-2.5 flex items-start justify-between gap-2 bg-panel">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{p.name}</p>
                    {p.address && <p className="text-xs text-muted-fg truncate">{p.address}</p>}
                    {p.start_date && <p className="text-xs text-faint">{p.start_date}</p>}
                    <Badge variant={getStatusVariant(p.status)} className="mt-1">{p.status}</Badge>
                  </div>
                  <Link
                    href={`/projects/${p.id}/plans`}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-accent-fg hover:text-accent-fg"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {addProjectOpen && (
        <AddProjectModal
          customer={customer}
          token={token}
          onClose={() => setAddProjectOpen(false)}
          onSuccess={() => { setAddProjectOpen(false); onRefresh() }}
        />
      )}
    </>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [token, setToken] = useState('')
  const [newCustomerOpen, setNewCustomerOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  async function load(tok: string) {
    const res = await fetch('/api/customers', {
      headers: { Authorization: `Bearer ${tok}` },
    })
    const json = await res.json()
    setCustomers(json.customers ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      const tok = session?.access_token ?? ''
      setToken(tok)
      load(tok)
    })
  }, [])

  function refresh() {
    if (token) { setLoading(true); load(token) }
  }

  const filtered = customers.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        title="Customers"
        subtitle="All clients and their projects"
        action={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setBulkOpen(true)}>
              Bulk Create Units
            </Button>
            <Button onClick={() => setNewCustomerOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              New Customer
            </Button>
          </div>
        }
      />

      <Input
        placeholder="Search by customer name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-fg">Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No customers yet"
          description="Create your first customer to get started."
          action={{ label: 'New Customer', onClick: () => setNewCustomerOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CustomerCard key={c.id} customer={c} token={token} onRefresh={refresh} />
          ))}
        </div>
      )}

      {newCustomerOpen && (
        <NewCustomerModal
          token={token}
          onClose={() => setNewCustomerOpen(false)}
          onSuccess={() => { setNewCustomerOpen(false); refresh() }}
        />
      )}

      {bulkOpen && (
        <BulkCreateModal
          token={token}
          onClose={() => setBulkOpen(false)}
          onSuccess={() => { setBulkOpen(false); refresh() }}
        />
      )}
    </div>
  )
}

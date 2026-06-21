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

type Project = {
  id: string
  name: string
  status: string
  address: string
  start_date: string
  type: string
}

type Customer = {
  client: string
  project_count: number
  statuses: string[]
  latest_project_date: string
  projects: Project[]
}

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function AddProjectModal({
  clientName,
  onClose,
  onSuccess,
  token,
}: {
  clientName: string
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
        body: JSON.stringify({ name, address, client: clientName, type, start_date: startDate }),
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
          <h2 className="text-base font-semibold text-slate-900">Add Project for {clientName}</h2>
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

function NewCustomerModal({
  onClose,
  onSuccess,
  token,
}: {
  onClose: () => void
  onSuccess: () => void
  token: string
}) {
  const today = new Date().toISOString().split('T')[0]
  const [clientName, setClientName] = useState('')
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
        body: JSON.stringify({
          name: `${clientName} - New Project`,
          client: clientName,
          address: '',
          type: 'residential',
          start_date: today,
        }),
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
      <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">New Customer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <Label htmlFor="nc-name">Client Name</Label>
            <Input id="nc-name" value={clientName} onChange={(e) => setClientName(e.target.value)} required placeholder="e.g. John Smith" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

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
  const [client, setClient] = useState('')
  const [namePrefix, setNamePrefix] = useState('')
  const [addressPrefix, setAddressPrefix] = useState('')
  const [unitFrom, setUnitFrom] = useState(1)
  const [unitTo, setUnitTo] = useState(10)
  const [type, setType] = useState('residential')
  const [startDate, setStartDate] = useState(today)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const cappedTo = Math.min(unitTo, unitFrom + 99)
  const count = cappedTo >= unitFrom ? cappedTo - unitFrom + 1 : 0
  const previewNames = Array.from({ length: Math.min(count, 5) }, (_, i) => `${namePrefix || 'Project'} Unit ${unitFrom + i}`)
  const previewStr = count <= 5 ? previewNames.join(', ') : `${previewNames.join(', ')} … Unit ${cappedTo}`

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/projects/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          client,
          name_prefix: namePrefix,
          address_prefix: addressPrefix,
          unit_start: unitFrom,
          unit_end: cappedTo,
          type,
          start_date: startDate,
        }),
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
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900">Bulk Create Units</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none">&times;</button>
        </div>
        {successMsg ? (
          <div className="p-10 text-center">
            <p className="text-lg font-semibold text-green-600">{successMsg}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            <div className="space-y-1.5">
              <Label htmlFor="bc-client">Client Name</Label>
              <Input id="bc-client" value={client} onChange={(e) => setClient(e.target.value)} required placeholder="e.g. Edgecomb Homes" />
            </div>
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
            {count > 0 && (
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-4 py-3 text-sm text-slate-600">
                <span className="font-medium text-slate-800">Will create {count} project{count === 1 ? '' : 's'}:</span>{' '}
                {previewStr}
              </div>
            )}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={saving || count === 0}>{saving ? 'Creating…' : `Create ${count} Project${count === 1 ? '' : 's'}`}</Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

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

  return (
    <>
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-base font-bold">
                {getInitials(customer.client)}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-sm font-semibold text-slate-900 truncate">{customer.client}</CardTitle>
                <p className="text-xs text-slate-500 mt-0.5">
                  {customer.project_count} project{customer.project_count === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <button
              onClick={() => setAddProjectOpen(true)}
              className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-orange-500 transition-colors"
              title="Add Project"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0">
          <div className="flex flex-wrap gap-1.5">
            {customer.statuses.map((s) => (
              <Badge key={s} variant={getStatusVariant(s)}>{s}</Badge>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-between"
            onClick={() => setExpanded((v) => !v)}
          >
            View Projects
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {expanded && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden">
              {customer.projects.map((p) => (
                <li key={p.id} className="px-3 py-2.5 flex items-start justify-between gap-2 bg-white">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{p.name}</p>
                    {p.address && <p className="text-xs text-slate-500 truncate">{p.address}</p>}
                    {p.start_date && <p className="text-xs text-slate-400">{p.start_date}</p>}
                    <Badge variant={getStatusVariant(p.status)} className="mt-1">{p.status}</Badge>
                  </div>
                  <Link
                    href={`/projects/${p.id}/plans`}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-orange-500 hover:text-orange-600"
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
          clientName={customer.client}
          token={token}
          onClose={() => setAddProjectOpen(false)}
          onSuccess={() => { setAddProjectOpen(false); onRefresh() }}
        />
      )}
    </>
  )
}

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
    c.client.toLowerCase().includes(search.toLowerCase())
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
        placeholder="Search by client name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      {loading ? (
        <div className="py-16 text-center text-sm text-slate-500">Loading…</div>
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
            <CustomerCard key={c.client} customer={c} token={token} onRefresh={refresh} />
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

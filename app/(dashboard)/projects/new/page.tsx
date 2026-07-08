'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { AddressFields } from '@/components/ui/address-fields'

export default function NewProjectPage() {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number | null; lng: number | null }>({ lat: null, lng: null })
  const [client, setClient] = useState('')
  const [customers, setCustomers] = useState<{ id: string; name: string }[]>([])
  const [customerId, setCustomerId] = useState('')

  // Existing customers from the directory, so the client can be picked
  // instead of retyped (same as the edit form).
  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch('/api/customers', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (res.ok) {
        const d = await res.json()
        setCustomers((d.customers ?? []).map((c: any) => ({ id: c.id, name: c.name })))
      }
    })()
  }, [])
  const [type, setType] = useState<'residential' | 'commercial' | 'mixed_use'>('commercial')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

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
      }),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Failed to create project.')
      setLoading(false)
      return
    }

    const { project } = await res.json()
    router.push(`/projects/${project.id}/plans`)
  }

  return (
    <div className="p-4 sm:p-6 max-w-2xl">
      <PageHeader
        title="New Project"
        subtitle="Fill in the details to create your construction project."
      />

      <Card>
        <CardContent className="pt-6">
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
                {loading ? 'Creating...' : 'Create Project'}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

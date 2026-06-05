'use client'

import { useEffect, useState } from 'react'
import { Building2, Plus, X, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'

const TRADES = [
  '', 'Demolition', 'Concrete', 'Masonry', 'Structural Steel', 'Framing',
  'Roofing', 'Waterproofing', 'Insulation', 'Drywall', 'Doors & Hardware',
  'Glazing', 'Tile', 'Flooring', 'Paint', 'Electrical', 'Plumbing',
  'HVAC', 'Fire Protection', 'Elevators', 'Landscaping', 'Other',
]

interface Company {
  id: string
  name: string
  trade: string | null
  contact_email: string
  phone: string | null
  address: string | null
  insurance_status: string
  license_number: string | null
}

export default function DirectoryPage() {
  const supabase = createClient()
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [trade, setTrade] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [license, setLicense] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function fetchData() {
    setLoading(true)
    const token = await getToken()
    const res = await fetch('/api/directory', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setCompanies(data.companies)
    }
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  function resetForm() {
    setName(''); setTrade(''); setEmail(''); setPhone(''); setAddress(''); setLicense('')
    setAddError(null)
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAddError(null)
    setAddLoading(true)
    const token = await getToken()
    const res = await fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, trade, contact_email: email, phone, address, license_number: license }),
    })
    if (!res.ok) {
      const body = await res.json()
      setAddError(body.error)
      setAddLoading(false)
      return
    }
    resetForm()
    setShowAdd(false)
    setAddLoading(false)
    fetchData()
  }

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.trade ?? '').toLowerCase().includes(search.toLowerCase()) ||
    c.contact_email.toLowerCase().includes(search.toLowerCase())
  )

  const insuranceBadge = (status: string) => {
    if (status === 'active') return <Badge variant="success">Active</Badge>
    if (status === 'expired') return <Badge variant="danger">Expired</Badge>
    return <Badge variant="muted">Missing</Badge>
  }

  return (
    <div className="p-6">
      {/* Add Company Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add Subcontractor</h2>
              <button onClick={() => { setShowAdd(false); resetForm() }} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleAdd}>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="name">Company Name *</Label>
                    <Input id="name" placeholder="e.g. Citywide Electric" value={name} onChange={e => setName(e.target.value)} required autoFocus />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="trade">Trade</Label>
                    <Select id="trade" value={trade} onChange={e => setTrade(e.target.value)}>
                      <option value="">Select trade...</option>
                      {TRADES.filter(Boolean).map(t => <option key={t} value={t}>{t}</option>)}
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Contact Email *</Label>
                    <Input id="email" type="email" placeholder="contact@company.com" value={email} onChange={e => setEmail(e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input id="phone" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="license">License # <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input id="license" placeholder="e.g. LIC-123456" value={license} onChange={e => setLicense(e.target.value)} />
                  </div>
                  <div className="space-y-1.5 col-span-2">
                    <Label htmlFor="address">Address <span className="text-slate-400 font-normal">(optional)</span></Label>
                    <Input id="address" placeholder="123 Main St, City, State" value={address} onChange={e => setAddress(e.target.value)} />
                  </div>
                </div>
                {addError && <p className="text-sm text-red-600">{addError}</p>}
              </div>
              <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => { setShowAdd(false); resetForm() }}>Cancel</Button>
                <Button type="submit" disabled={addLoading}>{addLoading ? 'Adding...' : 'Add Subcontractor'}</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subcontractor Directory</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your approved vendor and subcontractor list.</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          Add Company
        </Button>
      </div>

      {/* Search */}
      <div className="relative mb-5 max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, trade, or email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={companies.length === 0 ? 'No companies in directory' : 'No matches found'}
          description={companies.length === 0
            ? 'Add subcontractors to your directory to invite them to bid on projects.'
            : 'Try a different search term.'}
          action={companies.length === 0 ? { label: 'Add Company', onClick: () => setShowAdd(true) } : undefined}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Company</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Trade</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Contact</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Phone</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">Insurance</th>
                <th className="text-left px-5 py-3 font-medium text-slate-600">License #</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(company => (
                <tr key={company.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-900">{company.name}</td>
                  <td className="px-5 py-3 text-slate-500">{company.trade ?? '—'}</td>
                  <td className="px-5 py-3">
                    <a href={`mailto:${company.contact_email}`} className="text-orange-600 hover:underline">
                      {company.contact_email}
                    </a>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{company.phone ?? '—'}</td>
                  <td className="px-5 py-3">{insuranceBadge(company.insurance_status)}</td>
                  <td className="px-5 py-3 font-mono text-slate-500">{company.license_number ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <Button variant="ghost" size="sm">Edit</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

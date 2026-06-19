'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, X, Phone, Mail, HardHat, Building2, DollarSign, UserCircle2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Badge, getStatusVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { cn } from '@/lib/utils'
import { ContactPicker } from '@/components/contact-picker'

const GC_ROLES = [
  'Project Manager', 'Site Manager', 'Superintendent', 'Foreman',
  'Laborer', 'Safety Officer', 'Quality Control', 'Other',
]

interface TeamMember {
  id: string
  name: string
  role: string
  phone: string | null
  email: string | null
}

interface Subcontract {
  id: string
  scope: string
  trade: string | null
  contract_amount: number
  status: string
  companies: { name: string; contact_email: string | null; phone: string | null } | null
}

export default function TeamPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([])
  const [loading, setLoading] = useState(true)

  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [role, setRole] = useState('Site Manager')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)

  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  async function getToken() {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? ''
  }

  async function load() {
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/team`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json()
      setMembers(data.members)
      setSubcontracts(data.subcontracts)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [params.id])

  async function addMember(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const token = await getToken()
    const res = await fetch(`/api/projects/${params.id}/team`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, role, phone: phone || null, email: email || null }),
    })
    if (res.ok) {
      setShowAdd(false)
      setName(''); setRole('Site Manager'); setPhone(''); setEmail('')
      load()
    }
    setSaving(false)
  }

  function openEditMember(member: TeamMember) {
    setEditMember(member)
    setEditName(member.name)
    setEditRole(member.role)
    setEditPhone(member.phone ?? '')
    setEditEmail(member.email ?? '')
  }

  async function handleEditMember(e: React.FormEvent) {
    e.preventDefault()
    if (!editMember) return
    setEditSaving(true)
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/team/${editMember.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editName,
        role: editRole,
        phone: editPhone || null,
        email: editEmail || null,
      }),
    })
    setEditSaving(false)
    setEditMember(null)
    load()
  }

  async function removeMember(id: string) {
    const token = await getToken()
    await fetch(`/api/projects/${params.id}/team/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    load()
  }

  const totalContractValue = subcontracts.reduce((sum, s) => sum + Number(s.contract_amount), 0)

  return (
    <div className="space-y-6">

      {/* Edit Member Modal */}
      {editMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Edit Team Member</h2>
              <button onClick={() => setEditMember(null)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleEditMember}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-name">Full Name <span className="text-red-500">*</span></Label>
                  <Input id="edit-name" required value={editName} onChange={e => setEditName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-role">Role <span className="text-red-500">*</span></Label>
                  <Select id="edit-role" value={editRole} onChange={e => setEditRole(e.target.value)}>
                    {GC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-phone">Phone</Label>
                    <Input id="edit-phone" type="tel" placeholder="(555) 000-0000" value={editPhone} onChange={e => setEditPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-email">Email</Label>
                    <Input id="edit-email" type="email" placeholder="name@company.com" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setEditMember(null)}>Cancel</Button>
                <Button type="submit" disabled={editSaving || !editName.trim()}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Member Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md min-w-0">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Add Team Member</h2>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={addMember}>
              <div className="px-4 sm:px-6 py-5 space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                  <ContactPicker
                    filterType="worker"
                    value={name}
                    onChange={(n, contact) => {
                      setName(n)
                      if (contact?.phone) setPhone(contact.phone)
                      if (contact?.contact_email && !contact.contact_email.includes('placeholder.com')) setEmail(contact.contact_email)
                    }}
                    placeholder="Search workers or type a name…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">Role <span className="text-red-500">*</span></Label>
                  <Select id="role" value={role} onChange={e => setRole(e.target.value)}>
                    {GC_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" type="tel" placeholder="(555) 000-0000" value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                </div>
              </div>
              <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-wrap gap-2 justify-end">
                <Button type="button" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
                <Button type="submit" disabled={saving || !name.trim()}>
                  {saving ? 'Adding...' : 'Add Member'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your crew and awarded subcontractors on this project.</p>
        </div>
        <Button onClick={() => setShowAdd(true)} className="self-start sm:self-auto shrink-0">
          <Plus className="h-4 w-4" />
          Add Member
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-12 text-center">Loading...</div>
      ) : (
        <div className="space-y-8">

          {/* GC Crew */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <HardHat className="h-4 w-4 text-slate-500" />
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">GC Crew</p>
            </div>
            {members.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <UserCircle2 className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No crew members added yet</p>
                <button onClick={() => setShowAdd(true)} className="mt-2 text-sm text-orange-500 hover:underline">Add your first member</button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {members.map(member => (
                  <div key={member.id} className="group bg-white rounded-xl border border-slate-200 px-4 py-3.5 flex items-start gap-3 hover:border-slate-300 transition-colors">
                    <div className="h-9 w-9 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-sm font-semibold text-orange-600">
                      {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-900 text-sm break-words">{member.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{member.role}</p>
                      {member.phone && (
                        <a href={`tel:${member.phone}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-1">
                          <Phone className="h-3 w-3" />{member.phone}
                        </a>
                      )}
                      {member.email && (
                        <a href={`mailto:${member.email}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mt-0.5">
                          <Mail className="h-3 w-3 shrink-0" /><span className="truncate min-w-0">{member.email}</span>
                        </a>
                      )}
                    </div>
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                      <button
                        onClick={() => openEditMember(member)}
                        className="text-slate-300 hover:text-slate-600 transition-colors"
                        title="Edit member"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => removeMember(member.id)}
                        className="text-slate-300 hover:text-red-400 transition-colors"
                        title="Remove member"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subcontractors */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Subcontractors ({subcontracts.length})
                </p>
              </div>
              {totalContractValue > 0 && (
                <div className="flex items-center gap-1 text-sm text-slate-500">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span className="font-semibold text-slate-700">{totalContractValue.toLocaleString()}</span>
                  <span className="text-xs">total contracted</span>
                </div>
              )}
            </div>
            {subcontracts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
                <Building2 className="h-8 w-8 text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No subcontractors yet</p>
                <p className="text-xs text-slate-400 mt-1">Award bids to populate this section automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {subcontracts.map(sub => (
                  <div key={sub.id} className="bg-white rounded-xl border border-slate-200 px-4 py-3.5 hover:border-slate-300 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="h-9 w-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0 text-sm font-semibold text-slate-600">
                        {(sub.companies?.name ?? '?').slice(0, 2).toUpperCase()}
                      </div>
                      <Badge variant={getStatusVariant(sub.status)}>{sub.status}</Badge>
                    </div>
                    <p className="font-semibold text-slate-900 text-sm">{sub.companies?.name ?? 'Unknown'}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{sub.scope}</p>
                    {sub.trade && (
                      <span className="inline-block mt-1.5 text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{sub.trade}</span>
                    )}
                    <p className="mt-2 text-sm font-semibold text-slate-800">${Number(sub.contract_amount).toLocaleString()}</p>
                    <div className="mt-2 space-y-0.5">
                      {sub.companies?.contact_email && (
                        <a href={`mailto:${sub.companies.contact_email}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                          <Mail className="h-3 w-3 shrink-0" /><span className="truncate min-w-0">{sub.companies.contact_email}</span>
                        </a>
                      )}
                      {sub.companies?.phone && (
                        <a href={`tel:${sub.companies.phone}`} className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600">
                          <Phone className="h-3 w-3" />{sub.companies.phone}
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  )
}

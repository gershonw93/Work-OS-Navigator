'use client'

import { useEffect, useState, useCallback } from 'react'
import { PageHeader } from '@/components/ui/page-header'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { UserPlus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Profile {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  role: string | null
  company_id: string | null
}

interface Company {
  id: string
  name: string | null
  type: string | null
  contact_email: string | null
  phone: string | null
  address: string | null
  license_number: string | null
}

interface Teammate {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getToken(): Promise<string> {
  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? ''
}

// ---------------------------------------------------------------------------
// Notification preference keys
// ---------------------------------------------------------------------------

const NOTIF_PREFS = [
  { key: 'new_invoice', label: 'New invoice submitted' },
  { key: 'invoice_decision', label: 'Invoice approved or rejected' },
  { key: 'rfi_response', label: 'RFI response received' },
  { key: 'compliance_expiring', label: 'Compliance document expiring' },
  { key: 'new_bid', label: 'New bid received' },
]

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [loading, setLoading] = useState(true)

  // Profile state
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Company state
  const [company, setCompany] = useState<Company | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('gc')
  const [contactEmail, setContactEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [address, setAddress] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [companySaving, setCompanySaving] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Team state
  const [teammates, setTeammates] = useState<Teammate[]>([])

  // Invite modal state
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('office_staff')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Notification state
  const [notifState, setNotifState] = useState<Record<string, boolean>>(
    () => Object.fromEntries(NOTIF_PREFS.map((p) => [p.key, true])),
  )

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  const loadSettings = useCallback(async () => {
    const token = await getToken()
    const res = await fetch('/api/settings', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()

    const p: Profile = data.profile
    setProfile(p)
    setFullName(p.full_name ?? '')
    setProfilePhone(p.phone ?? '')

    if (data.company) {
      const c: Company = data.company
      setCompany(c)
      setCompanyName(c.name ?? '')
      setCompanyType(c.type ?? 'gc')
      setContactEmail(c.contact_email ?? '')
      setCompanyPhone(c.phone ?? '')
      setAddress(c.address ?? '')
      setLicenseNumber(c.license_number ?? '')
    }

    setTeammates(data.teammates ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  // ---------------------------------------------------------------------------
  // Save profile
  // ---------------------------------------------------------------------------

  async function saveProfile() {
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ full_name: fullName, phone: profilePhone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setProfileMsg({ ok: true, text: 'Saved!' })
      setTimeout(() => setProfileMsg(null), 2000)
    } catch (err: unknown) {
      setProfileMsg({ ok: false, text: err instanceof Error ? err.message : 'Error saving' })
    } finally {
      setProfileSaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Save company
  // ---------------------------------------------------------------------------

  async function saveCompany() {
    setCompanySaving(true)
    setCompanyMsg(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          company: {
            name: companyName,
            type: companyType,
            contact_email: contactEmail,
            phone: companyPhone,
            address,
            license_number: licenseNumber,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      setCompanyMsg({ ok: true, text: 'Saved!' })
      setTimeout(() => setCompanyMsg(null), 2000)
    } catch (err: unknown) {
      setCompanyMsg({ ok: false, text: err instanceof Error ? err.message : 'Error saving' })
    } finally {
      setCompanySaving(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Send invite
  // ---------------------------------------------------------------------------

  async function sendInvite() {
    if (!inviteEmail) return
    setInviteSending(true)
    setInviteMsg(null)
    try {
      const token = await getToken()
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          company_id: profile?.company_id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      setInviteMsg({ ok: true, text: `Invite sent to ${inviteEmail}` })
      setTimeout(() => {
        setShowInvite(false)
        setInviteEmail('')
        setInviteRole('office_staff')
        setInviteMsg(null)
      }, 1500)
    } catch (err: unknown) {
      setInviteMsg({ ok: false, text: err instanceof Error ? err.message : 'Error sending invite' })
    } finally {
      setInviteSending(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Toggle notification
  // ---------------------------------------------------------------------------

  async function toggleNotif(key: string, value: boolean) {
    setNotifState((prev) => ({ ...prev, [key]: value }))
    try {
      const token = await getToken()
      await fetch('/api/settings', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notifications: { [key]: value } }),
      })
    } catch {
      // revert on error
      setNotifState((prev) => ({ ...prev, [key]: !value }))
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-slate-200 rounded w-1/3" />
          <div className="h-48 bg-slate-100 rounded" />
          <div className="h-48 bg-slate-100 rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-3xl space-y-8">
      <PageHeader title="Settings" subtitle="Manage your profile, company, team, and preferences." />

      {/* ------------------------------------------------------------------ */}
      {/* Your Profile                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Your Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile?.email ?? ''} readOnly disabled />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="profilePhone">Phone</Label>
              <Input
                id="profilePhone"
                type="tel"
                value={profilePhone}
                onChange={(e) => setProfilePhone(e.target.value)}
                placeholder="(555) 000-0000"
              />
            </div>
          </div>
          <div className="pt-2 flex items-center gap-3">
            <Button onClick={saveProfile} disabled={profileSaving}>
              {profileSaving ? 'Saving…' : 'Save Changes'}
            </Button>
            {profileMsg && (
              <span
                className={`text-sm font-medium ${profileMsg.ok ? 'text-green-600' : 'text-red-600'}`}
              >
                {profileMsg.text}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Company Profile                                                      */}
      {/* ------------------------------------------------------------------ */}
      {company && (
        <Card>
          <CardHeader>
            <CardTitle>Company Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="companyName">Company Name</Label>
                <Input
                  id="companyName"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Your company name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyType">Company Type</Label>
                <Select
                  id="companyType"
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                >
                  <option value="gc">General Contractor</option>
                  <option value="subcontractor">Subcontractor</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="contactEmail">Contact Email</Label>
                <Input
                  id="contactEmail"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="contact@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyPhone">Phone</Label>
                <Input
                  id="companyPhone"
                  type="tel"
                  value={companyPhone}
                  onChange={(e) => setCompanyPhone(e.target.value)}
                  placeholder="(555) 000-0000"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="123 Main St, City, State 12345"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="licenseNumber">License Number</Label>
              <Input
                id="licenseNumber"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. CA-123456"
              />
            </div>
            <div className="pt-2 flex items-center gap-3">
              <Button onClick={saveCompany} disabled={companySaving}>
                {companySaving ? 'Saving…' : 'Save Changes'}
              </Button>
              {companyMsg && (
                <span
                  className={`text-sm font-medium ${companyMsg.ok ? 'text-green-600' : 'text-red-600'}`}
                >
                  {companyMsg.text}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Team Members                                                         */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Team Members</CardTitle>
          <Button size="sm" onClick={() => setShowInvite(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-slate-100">
            {teammates.length === 0 ? (
              <p className="text-center text-sm text-slate-400 py-8 px-4">
                No team members yet. Invite your first teammate.
              </p>
            ) : (
              teammates.map((member) => (
                <div key={member.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">
                        {member.full_name ?? '—'}
                      </p>
                      <p className="text-sm text-slate-500 truncate">{member.email}</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <Badge variant="muted" className="capitalize">
                      {member.role}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teammates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                      No team members yet. Invite your first teammate.
                    </TableCell>
                  </TableRow>
                ) : (
                  teammates.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.full_name ?? '—'}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge variant="muted" className="capitalize">
                          {member.role}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Notification Preferences                                            */}
      {/* ------------------------------------------------------------------ */}
      <Card>
        <CardHeader>
          <CardTitle>Notification Preferences</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTIF_PREFS.map((pref) => (
            <label key={pref.key} className="flex items-center justify-between py-1 cursor-pointer">
              <span className="text-sm text-slate-700">{pref.label}</span>
              <div
                className="relative"
                onClick={() => toggleNotif(pref.key, !notifState[pref.key])}
              >
                <div
                  className={`h-5 w-9 rounded-full transition-colors ${
                    notifState[pref.key] ? 'bg-orange-500' : 'bg-slate-200'
                  }`}
                />
                <div
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    notifState[pref.key] ? 'translate-x-4' : 'translate-x-0'
                  }`}
                />
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------------ */}
      {/* Invite Modal                                                         */}
      {/* ------------------------------------------------------------------ */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Invite Team Member</h2>
              <button
                onClick={() => {
                  setShowInvite(false)
                  setInviteMsg(null)
                  setInviteEmail('')
                  setInviteRole('office_staff')
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inviteEmail">Email address</Label>
              <Input
                id="inviteEmail"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="inviteRole">Role</Label>
              <Select
                id="inviteRole"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="admin">Admin</option>
                <option value="project_manager">Project Manager</option>
                <option value="field_supervisor">Field Supervisor</option>
                <option value="office_staff">Office Staff</option>
              </Select>
            </div>

            {inviteMsg && (
              <p
                className={`text-sm font-medium ${inviteMsg.ok ? 'text-green-600' : 'text-red-600'}`}
              >
                {inviteMsg.text}
              </p>
            )}

            <div className="pt-2 flex gap-3">
              <Button onClick={sendInvite} disabled={inviteSending || !inviteEmail}>
                {inviteSending ? 'Sending…' : 'Send Invite'}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowInvite(false)
                  setInviteMsg(null)
                  setInviteEmail('')
                  setInviteRole('office_staff')
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

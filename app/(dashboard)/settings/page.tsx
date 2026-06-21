'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  User, Building2, Users, Shield, Bell, CreditCard, AlertTriangle,
  Check, X, SlidersHorizontal, Plug, Palette, Camera, RefreshCw, Ban,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Profile {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  company_id: string
}

interface Company {
  id: string
  name: string
  type: string
  contact_email: string
  phone: string
  address: string
  license_number: string
}

interface Teammate {
  id: string
  full_name: string
  email: string
  role: string
  status?: string
}

interface PendingInvite {
  id: string
  email: string
  role: string
  status: string
  created_at: string
}

interface NotifState {
  new_invoice: boolean
  invoice_decision: boolean
  rfi_response: boolean
  compliance_expiring: boolean
  new_bid: boolean
  daily_log: boolean
  new_task: boolean
  change_order: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TABS: { id: string; label: string; icon: React.ElementType; danger?: boolean }[] = [
  { id: 'profile',       label: 'Profile',       icon: User },
  { id: 'company',       label: 'Company',        icon: Building2 },
  { id: 'team',          label: 'Team & Users',   icon: Users },
  { id: 'permissions',   label: 'Permissions',    icon: Shield },
  { id: 'notifications', label: 'Notifications',  icon: Bell },
  { id: 'preferences',   label: 'Preferences',    icon: SlidersHorizontal },
  { id: 'billing',       label: 'Billing',        icon: CreditCard },
  { id: 'danger',        label: 'Danger Zone',    icon: AlertTriangle, danger: true },
]

const ROLES = [
  { value: 'admin',            label: 'Admin',            desc: 'Full access, can manage users and settings' },
  { value: 'project_manager',  label: 'Project Manager',  desc: 'Can create/edit projects, tasks, RFIs, daily logs' },
  { value: 'field_supervisor', label: 'Field Supervisor', desc: 'Can submit daily logs, view tasks, update progress' },
  { value: 'office_staff',     label: 'Office Staff',     desc: 'Can view projects, submit invoices, manage compliance docs' },
  { value: 'read_only',        label: 'Read Only',        desc: 'View-only access to all project data' },
]

const ROLE_COLORS: Record<string, string> = {
  admin:            'bg-purple-100 text-purple-800',
  project_manager:  'bg-blue-100 text-blue-800',
  field_supervisor: 'bg-orange-100 text-orange-800',
  office_staff:     'bg-slate-100 text-slate-700',
  read_only:        'bg-gray-100 text-gray-600',
}

const PERMISSION_MATRIX = [
  { feature: 'Projects',      admin: true,  project_manager: true,  field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Daily Logs',    admin: true,  project_manager: true,  field_supervisor: true,  office_staff: false, read_only: true  },
  { feature: 'Tasks',         admin: true,  project_manager: true,  field_supervisor: true,  office_staff: false, read_only: true  },
  { feature: 'RFIs',          admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Invoices',      admin: true,  project_manager: false, field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Bids',          admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Change Orders', admin: true,  project_manager: true,  field_supervisor: false, office_staff: false, read_only: true  },
  { feature: 'Compliance',    admin: true,  project_manager: false, field_supervisor: false, office_staff: true,  read_only: true  },
  { feature: 'Team',          admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
  { feature: 'Financials',    admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
  { feature: 'Settings',      admin: true,  project_manager: false, field_supervisor: false, office_staff: false, read_only: false },
]

const NOTIF_ITEMS: { key: keyof NotifState; label: string }[] = [
  { key: 'new_invoice',         label: 'New invoice submitted' },
  { key: 'invoice_decision',    label: 'Invoice approved / rejected' },
  { key: 'rfi_response',        label: 'RFI response received' },
  { key: 'compliance_expiring', label: 'Compliance document expiring' },
  { key: 'new_bid',             label: 'New bid received' },
  { key: 'daily_log',           label: 'Daily log submitted' },
  { key: 'new_task',            label: 'New task assigned' },
  { key: 'change_order',        label: 'Change order created' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient()
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function RoleBadge({ role }: { role: string }) {
  const colors = ROLE_COLORS[role] ?? 'bg-gray-100 text-gray-600'
  const label = ROLES.find((r) => r.value === role)?.label ?? role
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors}`}>
      {label}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [userRole, setUserRole] = useState<string>('')

  // Profile
  const [profile, setProfile] = useState<Profile | null>(null)
  const [fullName, setFullName] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pwSaving, setPwSaving] = useState(false)

  // Company
  const [company, setCompany] = useState<Company | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [companyPhone, setCompanyPhone] = useState('')
  const [address, setAddress] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [companySaving, setCompanySaving] = useState(false)
  const [companyMsg, setCompanyMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Team
  const [teammates, setTeammates] = useState<Teammate[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteFullName, setInviteFullName] = useState('')
  const [inviteRole, setInviteRole] = useState('read_only')
  const [inviteSending, setInviteSending] = useState(false)
  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null)

  // Notifications
  const [notifState, setNotifState] = useState<NotifState>({
    new_invoice: true,
    invoice_decision: true,
    rfi_response: true,
    compliance_expiring: true,
    new_bid: false,
    daily_log: false,
    new_task: true,
    change_order: false,
  })

  // Preferences (localStorage)
  const [prefDefaultType, setPrefDefaultType] = useState('residential')
  const [prefStartOffset, setPrefStartOffset] = useState('today')
  const [prefEnableBulk, setPrefEnableBulk] = useState(true)
  const [prefAddressIncrement, setPrefAddressIncrement] = useState(1)
  const [prefNamingPattern, setPrefNamingPattern] = useState('prefix_number')
  const [prefMaxUnits, setPrefMaxUnits] = useState(50)
  const [prefRequireCustomer, setPrefRequireCustomer] = useState(false)
  const [prefShowCustomerCol, setPrefShowCustomerCol] = useState(true)
  const [prefSaved, setPrefSaved] = useState(false)

  // Danger Zone
  const [dangerInput, setDangerInput] = useState('')
  const [dangerStep, setDangerStep] = useState<'idle' | 'confirm' | 'deleting' | 'done'>('idle')
  const [dangerMsg, setDangerMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const loadTeammates = useCallback(async () => {
    // Use API (service role) so RLS doesn't block seeing other company members
    const headers = await authHeaders()
    const res = await fetch('/api/settings/teammates', { headers })
    if (res.ok) {
      const data = await res.json()
      if (data.teammates) setTeammates(data.teammates)
      if (data.pendingInvites) setPendingInvites(data.pendingInvites)
    }
  }, [])

  // ── Load — always pull directly from Supabase client first so profile/role
  //    are never blank regardless of API errors
  const loadSettings = useCallback(async () => {
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      // Load profile directly — never silently blank
      const { data: p } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, role, company_id')
        .eq('id', user.id)
        .single()

      if (p) {
        // Fill blanks from auth if DB row is missing them
        const resolvedName = p.full_name || user.user_metadata?.full_name || ''
        const resolvedEmail = p.email || user.email || ''
        setProfile({ ...p, full_name: resolvedName, email: resolvedEmail })
        setUserRole(p.role ?? 'read_only')
        setFullName(resolvedName)
        setProfilePhone(p.phone ?? '')
      }

      // Load company if linked
      if (p?.company_id) {
        const { data: c } = await supabase
          .from('companies')
          .select('id, name, type, contact_email, phone, address, license_number')
          .eq('id', p.company_id)
          .single()
        if (c) {
          setCompany(c)
          setCompanyName(c.name ?? '')
          setCompanyType(c.type ?? '')
          setContactEmail(c.contact_email ?? '')
          setCompanyPhone(c.phone ?? '')
          setAddress(c.address ?? '')
          setLicenseNumber(c.license_number ?? '')
        }
      }

      // Also fetch pending invites via API (needs service role)
      const headers = await authHeaders()
      const res = await fetch('/api/settings', { headers })
      if (res.ok) {
        const data = await res.json()
        if (data.pendingInvites) setPendingInvites(data.pendingInvites)
      }
    } catch {
      // ignore — direct Supabase calls above already populated state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
    loadTeammates()
    // Load preferences from localStorage
    try {
      const raw = localStorage.getItem('workos_preferences')
      if (raw) {
        const p = JSON.parse(raw)
        if (p.defaultType) setPrefDefaultType(p.defaultType)
        if (p.startOffset) setPrefStartOffset(p.startOffset)
        if (p.enableBulk !== undefined) setPrefEnableBulk(p.enableBulk)
        if (p.addressIncrement) setPrefAddressIncrement(p.addressIncrement)
        if (p.namingPattern) setPrefNamingPattern(p.namingPattern)
        if (p.maxUnits) setPrefMaxUnits(p.maxUnits)
        if (p.requireCustomer !== undefined) setPrefRequireCustomer(p.requireCustomer)
        if (p.showCustomerCol !== undefined) setPrefShowCustomerCol(p.showCustomerCol)
      }
    } catch {
      // ignore
    }
  }, [loadSettings])

  function savePreferences() {
    const prefs = {
      defaultType: prefDefaultType,
      startOffset: prefStartOffset,
      enableBulk: prefEnableBulk,
      addressIncrement: prefAddressIncrement,
      namingPattern: prefNamingPattern,
      maxUnits: prefMaxUnits,
      requireCustomer: prefRequireCustomer,
      showCustomerCol: prefShowCustomerCol,
    }
    localStorage.setItem('workos_preferences', JSON.stringify(prefs))
    setPrefSaved(true)
    setTimeout(() => setPrefSaved(false), 2000)
  }

  // ── Profile Save ──────────────────────────────────────────────────────────

  async function saveProfile() {
    setProfileSaving(true)
    setProfileMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ full_name: fullName, phone: profilePhone }),
      })
      setProfileMsg(res.ok ? { ok: true, text: 'Profile saved.' } : { ok: false, text: 'Failed to save.' })
    } catch {
      setProfileMsg({ ok: false, text: 'Network error.' })
    } finally {
      setProfileSaving(false)
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: 'Passwords do not match.' })
      return
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: 'Password must be at least 8 characters.' })
      return
    }
    setPwSaving(true)
    setPwMsg(null)
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setPwMsg({ ok: true, text: 'Password updated.' })
      setNewPassword('')
      setConfirmPassword('')
      setShowPwForm(false)
    } catch (e: unknown) {
      setPwMsg({ ok: false, text: (e as Error).message ?? 'Failed to update password.' })
    } finally {
      setPwSaving(false)
    }
  }

  // ── Company Save ──────────────────────────────────────────────────────────

  async function saveCompany() {
    setCompanySaving(true)
    setCompanyMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers,
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
      setCompanyMsg(res.ok ? { ok: true, text: 'Company saved.' } : { ok: false, text: 'Failed to save.' })
    } catch {
      setCompanyMsg({ ok: false, text: 'Network error.' })
    } finally {
      setCompanySaving(false)
    }
  }

  // ── Invite ────────────────────────────────────────────────────────────────

  async function sendInvite() {
    if (!inviteEmail || !inviteRole) return
    setInviteSending(true)
    setInviteMsg(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteFullName,
          role: inviteRole,
          company_id: profile?.company_id,
        }),
      })
      if (res.ok) {
        const d = await res.json().catch(() => ({}))
        setInviteMsg({
          ok: true,
          text: d.emailSent === false
            ? `Recorded! ${d.note ?? 'Email may not have been sent — check Supabase email limits.'}`
            : 'Invite sent! They will receive an email to set up their account.',
        })
        setInviteEmail('')
        setInviteFullName('')
        setInviteRole('read_only')
        await loadSettings()
      } else {
        const d = await res.json().catch(() => ({}))
        setInviteMsg({ ok: false, text: d.error ?? 'Failed to send invite.' })
      }
    } catch {
      setInviteMsg({ ok: false, text: 'Network error.' })
    } finally {
      setInviteSending(false)
    }
  }

  // ── Role Change ───────────────────────────────────────────────────────────

  async function changeRole(memberId: string, newRole: string) {
    try {
      const headers = await authHeaders()
      await fetch(`/api/settings/members/${memberId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: newRole }),
      })
      setTeammates((prev) =>
        prev.map((t) => (t.id === memberId ? { ...t, role: newRole } : t))
      )
    } catch {
      // fail silently
    }
  }

  // ── Remove Member ─────────────────────────────────────────────────────────

  async function removeMember(memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the team? This cannot be undone.`)) return
    try {
      const headers = await authHeaders()
      await fetch(`/api/settings/members/${memberId}`, {
        method: 'DELETE',
        headers,
      })
      setTeammates((prev) => prev.filter((t) => t.id !== memberId))
    } catch {
      // fail silently
    }
  }

  // ── Resend Invite ─────────────────────────────────────────────────────────

  async function resendInvite(email: string, role: string) {
    try {
      const headers = await authHeaders()
      await fetch('/api/invite', {
        method: 'POST',
        headers,
        body: JSON.stringify({ email, role }),
      })
      setInviteMsg({ ok: true, text: `Invite resent to ${email}` })
      setTimeout(() => setInviteMsg(null), 3000)
    } catch {
      setInviteMsg({ ok: false, text: 'Failed to resend invite.' })
    }
  }

  // ── Cancel Invite ─────────────────────────────────────────────────────────

  async function cancelInvite(inviteId: string) {
    if (!window.confirm('Cancel this invite?')) return
    try {
      const headers = await authHeaders()
      await fetch(`/api/invite/${inviteId}`, { method: 'DELETE', headers })
      setPendingInvites((prev) => prev.filter((i) => i.id !== inviteId))
    } catch {
      // fail silently
    }
  }

  // ── Notifications ─────────────────────────────────────────────────────────

  async function toggleNotif(key: keyof NotifState, value: boolean) {
    setNotifState((prev) => ({ ...prev, [key]: value }))
    try {
      const headers = await authHeaders()
      await fetch('/api/settings', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ notifications: { [key]: value } }),
      })
    } catch {
      setNotifState((prev) => ({ ...prev, [key]: !value }))
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
        Loading settings…
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Settings</h1>

      <div className="flex gap-6">
        {/* ── Left Sidebar ─────────────────────────────────────────────── */}
        <nav className="shrink-0 w-14 md:w-52">
          <ul className="space-y-1">
            {TABS.filter(({ id }) => {
              const isAdmin = userRole === 'admin'
              const isManager = isAdmin || userRole === 'project_manager' || userRole === 'manager' || userRole === 'office_staff'
              const isRestricted = ['field_supervisor', 'worker', 'member', 'read_only'].includes(userRole)
              // Restricted users: only Profile and Notifications
              if (isRestricted) return id === 'profile' || id === 'notifications'
              if (id === 'team' || id === 'permissions' || id === 'billing' || id === 'danger') return isAdmin
              if (id === 'company') return isManager
              return true
            }).map(({ id, label, icon: Icon, danger }) => {
              const active = activeTab === id
              return (
                <li key={id}>
                  <button
                    onClick={() => setActiveTab(id)}
                    className={[
                      'w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
                      active && !danger ? 'rounded-r-lg border-l-4 border-orange-500 bg-orange-50 text-orange-600 pl-2' : '',
                      active && danger  ? 'rounded-r-lg border-l-4 border-red-500 bg-red-50 text-red-600 pl-2' : '',
                      !active && !danger ? 'rounded-lg text-slate-600 hover:bg-slate-50' : '',
                      !active && danger  ? 'rounded-lg text-red-500 hover:bg-red-50' : '',
                    ].join(' ')}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    <span className="hidden md:block">{label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* ══════════════════════════════════════ TAB: PROFILE */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Your Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="fullName">Full Name</Label>
                      <Input
                        id="fullName"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        value={profile?.email ?? ''}
                        readOnly
                        disabled
                        className="mt-1 bg-slate-50 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <Label htmlFor="profilePhone">Phone</Label>
                      <Input
                        id="profilePhone"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <div className="mt-2">
                        <RoleBadge role={profile?.role ?? ''} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <Button onClick={saveProfile} disabled={profileSaving}>
                      {profileSaving ? 'Saving…' : 'Save Profile'}
                    </Button>
                    {profileMsg && (
                      <span className={`text-sm ${profileMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                        {profileMsg.text}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Password */}
              <Card>
                <CardHeader>
                  <CardTitle>Password</CardTitle>
                </CardHeader>
                <CardContent>
                  {!showPwForm ? (
                    <Button variant="outline" onClick={() => setShowPwForm(true)}>
                      Change Password
                    </Button>
                  ) : (
                    <div className="space-y-4 max-w-sm">
                      <div>
                        <Label htmlFor="newPassword">New Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                          id="confirmPassword"
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="flex items-center gap-3">
                        <Button onClick={changePassword} disabled={pwSaving}>
                          {pwSaving ? 'Updating…' : 'Update Password'}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => { setShowPwForm(false); setPwMsg(null) }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {pwMsg && (
                        <p className={`text-sm ${pwMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {pwMsg.text}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: COMPANY */}
          {activeTab === 'company' && (
            <Card>
              <CardHeader>
                <CardTitle>Company Profile</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!company ? (
                  <p className="text-slate-500 text-sm">No company linked to your account.</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyType">Company Type</Label>
                        <select
                          id="companyType"
                          value={companyType}
                          onChange={(e) => setCompanyType(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          <option value="">Select type…</option>
                          <option value="general_contractor">General Contractor</option>
                          <option value="subcontractor">Subcontractor</option>
                          <option value="owner">Owner</option>
                          <option value="architect">Architect / Designer</option>
                          <option value="engineer">Engineer</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="contactEmail">Contact Email</Label>
                        <Input
                          id="contactEmail"
                          type="email"
                          value={contactEmail}
                          onChange={(e) => setContactEmail(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          value={companyPhone}
                          onChange={(e) => setCompanyPhone(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label htmlFor="address">Address</Label>
                        <Input
                          id="address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="licenseNumber">License Number</Label>
                        <Input
                          id="licenseNumber"
                          value={licenseNumber}
                          onChange={(e) => setLicenseNumber(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <Button onClick={saveCompany} disabled={companySaving}>
                        {companySaving ? 'Saving…' : 'Save Company'}
                      </Button>
                      {companyMsg && (
                        <span className={`text-sm ${companyMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {companyMsg.text}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: TEAM */}
          {activeTab === 'team' && (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
                {userRole === 'admin' && (
                  <Button onClick={() => { setShowInvite(true); setInviteMsg(null) }}>
                    + Invite User
                  </Button>
                )}
              </div>

              <Card>
                <CardContent className="p-0">
                  {teammates.length === 0 ? (
                    <p className="text-slate-500 text-sm p-6">No team members yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50">
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Member</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
                            <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teammates.map((t) => {
                            const isSelf = t.id === profile?.id
                            return (
                            <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-8 w-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-xs font-bold shrink-0">
                                    {initials(t.full_name ?? t.email ?? '?')}
                                  </div>
                                  <div>
                                    <span className="font-medium text-slate-800">{t.full_name || '—'}</span>
                                    {isSelf && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-slate-600">{t.email}</td>
                              <td className="px-4 py-3">
                                {userRole === 'admin' && !isSelf ? (
                                  <select
                                    value={t.role}
                                    onChange={(e) => changeRole(t.id, e.target.value)}
                                    className="rounded border border-slate-200 px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-orange-400"
                                  >
                                    {ROLES.map((r) => (
                                      <option key={r.value} value={r.value}>{r.label}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <RoleBadge role={t.role} />
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                                  ${t.status === 'pending'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                  }`}>
                                  {t.status === 'pending' ? 'Pending' : 'Active'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {userRole === 'admin' && !isSelf && (
                                  <button
                                    onClick={() => removeMember(t.id, t.full_name ?? t.email)}
                                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                                  >
                                    Remove
                                  </button>
                                )}
                              </td>
                            </tr>
                            )
                          })}

                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pending Invites */}
              {pendingInvites.length > 0 && (
                <Card className="mt-4">
                  <CardHeader><CardTitle className="text-base">Pending Invites</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Email</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Role</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Sent</th>
                          <th className="text-left px-4 py-3 font-medium text-slate-600">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInvites.map((inv) => (
                          <tr key={inv.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                            <td className="px-4 py-3 text-slate-700">{inv.email}</td>
                            <td className="px-4 py-3"><RoleBadge role={inv.role} /></td>
                            <td className="px-4 py-3 text-slate-500 text-xs">{new Date(inv.created_at).toLocaleDateString()}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">
                                  Pending
                                </span>
                                <button
                                  onClick={() => resendInvite(inv.email, inv.role)}
                                  className="text-xs text-blue-500 hover:text-blue-700 hover:underline flex items-center gap-1"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  Resend
                                </button>
                                <button
                                  onClick={() => cancelInvite(inv.id)}
                                  className="text-xs text-red-500 hover:text-red-700 hover:underline flex items-center gap-1"
                                >
                                  <Ban className="h-3 w-3" />
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}

              {/* Inline message for resend/cancel feedback */}
              {inviteMsg && !showInvite && (
                <p className={`mt-3 text-sm ${inviteMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                  {inviteMsg.text}
                </p>
              )}

              {/* Invite Modal */}
              {showInvite && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                    <div className="flex items-center justify-between mb-5">
                      <h3 className="text-lg font-semibold text-slate-900">Invite Team Member</h3>
                      <button
                        onClick={() => setShowInvite(false)}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="inviteFullName">Full Name</Label>
                        <Input
                          id="inviteFullName"
                          value={inviteFullName}
                          onChange={(e) => setInviteFullName(e.target.value)}
                          placeholder="Jane Smith"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="inviteEmail">Email Address</Label>
                        <Input
                          id="inviteEmail"
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="jane@example.com"
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="inviteRole">Role</Label>
                        <select
                          id="inviteRole"
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                        >
                          {ROLES.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        {inviteRole && (
                          <p className="mt-1.5 text-xs text-slate-500">
                            {ROLES.find((r) => r.value === inviteRole)?.desc}
                          </p>
                        )}
                      </div>

                      {inviteMsg && (
                        <p className={`text-sm ${inviteMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {inviteMsg.text}
                        </p>
                      )}

                      <div className="flex gap-3 pt-1">
                        <Button
                          onClick={sendInvite}
                          disabled={inviteSending || !inviteEmail}
                          className="flex-1"
                        >
                          {inviteSending ? 'Sending…' : 'Send Invite'}
                        </Button>
                        <Button variant="outline" onClick={() => setShowInvite(false)} className="flex-1">
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ══════════════════════════════════════ TAB: PERMISSIONS */}
          {activeTab === 'permissions' && (
            <Card>
              <CardHeader>
                <CardTitle>Permission Matrix</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-500 mb-4">
                  Contact support to customize permissions for your plan.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm border border-slate-200 rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="text-left px-4 py-3 font-medium text-slate-700 sticky left-0 bg-slate-50 min-w-[160px] border-r border-slate-200">
                          Feature
                        </th>
                        {['Admin', 'Project Manager', 'Field Supervisor', 'Office Staff', 'Read Only'].map((col) => (
                          <th key={col} className="text-center px-4 py-3 font-medium text-slate-700 min-w-[130px]">
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {PERMISSION_MATRIX.map((row, i) => (
                        <tr key={row.feature} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-4 py-3 font-medium text-slate-700 sticky left-0 bg-inherit border-r border-slate-100">
                            {row.feature}
                          </td>
                          {(['admin', 'project_manager', 'field_supervisor', 'office_staff', 'read_only'] as const).map((role) => (
                            <td key={role} className="text-center px-4 py-3">
                              {row[role]
                                ? <Check className="h-4 w-4 text-green-500 mx-auto" />
                                : <X className="h-4 w-4 text-red-400 mx-auto" />
                              }
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {NOTIF_ITEMS.map(({ key, label }) => (
                  <div
                    key={key}
                    className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0"
                  >
                    <span className="text-sm text-slate-700">{label}</span>
                    <button
                      onClick={() => toggleNotif(key, !notifState[key])}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2
                        ${notifState[key] ? 'bg-orange-500' : 'bg-slate-200'}`}
                      role="switch"
                      aria-checked={notifState[key]}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform
                          ${notifState[key] ? 'translate-x-5' : 'translate-x-0'}`}
                      />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ══════════════════════════════════════ TAB: PREFERENCES */}
          {activeTab === 'preferences' && (
            <div className="space-y-6">
              {/* Project Defaults */}
              <Card>
                <CardHeader>
                  <CardTitle>Project Defaults</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pref-type">Default Project Type</Label>
                      <select
                        id="pref-type"
                        value={prefDefaultType}
                        onChange={(e) => setPrefDefaultType(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="residential">Residential</option>
                        <option value="commercial">Commercial</option>
                        <option value="renovation">Renovation</option>
                        <option value="mixed_use">Mixed Use</option>
                      </select>
                    </div>
                    <div>
                      <Label htmlFor="pref-offset">Default Start Date Offset</Label>
                      <select
                        id="pref-offset"
                        value={prefStartOffset}
                        onChange={(e) => setPrefStartOffset(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="today">Today</option>
                        <option value="1week">1 week out</option>
                        <option value="2weeks">2 weeks out</option>
                        <option value="1month">1 month out</option>
                      </select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bulk Creation Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Bulk Creation Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Enable Bulk Creation</p>
                      <p className="text-xs text-slate-500 mt-0.5">Show bulk creation options in the UI</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefEnableBulk((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${prefEnableBulk ? 'bg-orange-500' : 'bg-slate-200'}`}
                      role="switch"
                      aria-checked={prefEnableBulk}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${prefEnableBulk ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="pref-naming">Default Naming Pattern</Label>
                      <select
                        id="pref-naming"
                        value={prefNamingPattern}
                        onChange={(e) => setPrefNamingPattern(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                      >
                        <option value="prefix_number">Prefix + Number (e.g. House 1)</option>
                        <option value="prefix_address">Prefix + Address (e.g. House - 95 Main St)</option>
                        <option value="address_only">Address Only</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="pref-max-units">Max Units Per Bulk</Label>
                    <Input
                      id="pref-max-units"
                      type="number"
                      min={1}
                      max={100}
                      value={prefMaxUnits}
                      onChange={(e) => setPrefMaxUnits(Math.min(100, Math.max(1, Number(e.target.value))))}
                      className="mt-1 max-w-[120px]"
                    />
                    <p className="text-xs text-slate-500 mt-1">Maximum is 100</p>
                  </div>
                </CardContent>
              </Card>

              {/* Customer Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Require Customer on Every Project</p>
                      <p className="text-xs text-slate-500 mt-0.5">Projects must be linked to a customer record</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefRequireCustomer((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${prefRequireCustomer ? 'bg-orange-500' : 'bg-slate-200'}`}
                      role="switch"
                      aria-checked={prefRequireCustomer}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${prefRequireCustomer ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-700">Show Customer Column in Project List</p>
                      <p className="text-xs text-slate-500 mt-0.5">Display the customer column in project tables</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrefShowCustomerCol((v) => !v)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 ${prefShowCustomerCol ? 'bg-orange-500' : 'bg-slate-200'}`}
                      role="switch"
                      aria-checked={prefShowCustomerCol}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform ${prefShowCustomerCol ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </CardContent>
              </Card>

              <div className="flex items-center gap-3">
                <Button onClick={savePreferences}>Save Preferences</Button>
                {prefSaved && <span className="text-sm text-green-600">Saved!</span>}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: BILLING */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              {/* Current Plan */}
              <Card>
                <CardHeader>
                  <CardTitle>Current Plan</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-lg font-semibold text-slate-900">Starter Plan</p>
                      <p className="text-sm text-slate-500 mt-0.5">Free during beta</p>
                    </div>
                    <Button disabled className="opacity-60 cursor-not-allowed">
                      Upgrade (Coming Soon)
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Usage */}
              <Card>
                <CardHeader>
                  <CardTitle>Usage</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { label: 'Team Members', used: teammates.length, max: 5, unit: '' },
                    { label: 'Projects',     used: 0,                max: 10, unit: '' },
                    { label: 'Storage',      used: 0,                max: 5,  unit: ' GB' },
                  ].map(({ label, used, max, unit }) => (
                    <div key={label}>
                      <div className="flex justify-between text-sm text-slate-600 mb-1">
                        <span>{label}</span>
                        <span>{used} / {max}{unit}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-400 rounded-full transition-all"
                          style={{ width: `${Math.min((used / max) * 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Plans comparison */}
              <div>
                <h3 className="text-base font-semibold text-slate-900 mb-3">Available Plans</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      name: 'Starter',
                      price: 'Free',
                      current: true,
                      features: ['Up to 5 users', '10 projects', '5 GB storage', 'Core features'],
                    },
                    {
                      name: 'Pro',
                      price: '$49 / mo',
                      current: false,
                      features: ['Up to 25 users', 'Unlimited projects', '50 GB storage', 'Priority support', 'Advanced reports'],
                    },
                    {
                      name: 'Enterprise',
                      price: 'Custom',
                      current: false,
                      features: ['Unlimited users', 'Unlimited projects', 'Custom storage', 'Dedicated support', 'SSO / SAML', 'Custom integrations'],
                    },
                  ].map((plan) => (
                    <div
                      key={plan.name}
                      className={`rounded-xl border p-5 ${plan.current ? 'border-orange-400 bg-orange-50' : 'border-slate-200 bg-white'}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-slate-900">{plan.name}</p>
                        {plan.current && (
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-slate-900 mb-3">{plan.price}</p>
                      <ul className="space-y-1.5">
                        {plan.features.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                            <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      {!plan.current && (
                        <Button
                          disabled
                          variant="outline"
                          className="mt-4 w-full opacity-60 cursor-not-allowed"
                        >
                          Coming Soon
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════ TAB: DANGER ZONE */}
          {activeTab === 'danger' && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="border border-red-200 rounded-lg p-5 bg-red-50">
                  <p className="font-medium text-slate-900 mb-1">Delete Company Account</p>
                  <p className="text-sm text-slate-600 mb-4">
                    This will permanently delete your company account, all projects, and all associated
                    data. This action cannot be undone.
                  </p>

                  {dangerStep === 'idle' && (
                    <Button
                      variant="outline"
                      className="border-red-400 text-red-600 hover:bg-red-100"
                      onClick={() => setDangerStep('confirm')}
                    >
                      Delete Company Account
                    </Button>
                  )}

                  {(dangerStep === 'confirm' || dangerStep === 'deleting') && (
                    <div className="space-y-3 max-w-sm">
                      <p className="text-sm font-medium text-slate-700">
                        Type <strong>{companyName || 'your company name'}</strong> to confirm:
                      </p>
                      <Input
                        value={dangerInput}
                        onChange={(e) => setDangerInput(e.target.value)}
                        placeholder={companyName || 'Company name'}
                      />
                      <div className="flex gap-3">
                        <button
                          disabled={dangerInput !== companyName || dangerStep === 'deleting'}
                          onClick={async () => {
                            setDangerStep('deleting')
                            setDangerMsg(null)
                            try {
                              const headers = await authHeaders()
                              const res = await fetch('/api/settings', {
                                method: 'DELETE',
                                headers,
                              })
                              if (res.ok) {
                                setDangerStep('done')
                                setDangerMsg({ ok: true, text: 'Account deleted. Signing you out…' })
                                setTimeout(async () => {
                                  const supabase = createClient()
                                  await supabase.auth.signOut()
                                  window.location.href = '/login'
                                }, 3000)
                              } else {
                                setDangerStep('confirm')
                                setDangerMsg({ ok: false, text: 'Failed to delete account. Contact support.' })
                              }
                            } catch {
                              setDangerStep('confirm')
                              setDangerMsg({ ok: false, text: 'Network error.' })
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-700 transition-colors"
                        >
                          {dangerStep === 'deleting' ? 'Deleting…' : 'Confirm Delete'}
                        </button>
                        <Button
                          variant="outline"
                          onClick={() => { setDangerStep('idle'); setDangerInput(''); setDangerMsg(null) }}
                        >
                          Cancel
                        </Button>
                      </div>
                      {dangerMsg && (
                        <p className={`text-sm ${dangerMsg.ok ? 'text-green-600' : 'text-red-600'}`}>
                          {dangerMsg.text}
                        </p>
                      )}
                    </div>
                  )}

                  {dangerStep === 'done' && (
                    <p className="text-sm text-green-700 font-medium">
                      Account deleted. Signing you out…
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
